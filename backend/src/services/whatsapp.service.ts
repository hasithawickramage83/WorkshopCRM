import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { AppError } from '../utils/response';
import { jobAmountWithGst } from '../utils/helpers';

type WahaSession = {
  name?: string;
  status?: string;
  me?: { id?: string; pushName?: string };
};

type WahaGroup = {
  id?: string | { server?: string; user?: string; _serialized?: string };
  subject?: string;
  name?: string;
};

function formatNzd(amount: number) {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(amount || 0);
}

/** WAHA/WEBJS may return chat ids as strings or {_serialized,user,server} objects. */
function normalizeChatId(id: unknown): string {
  if (!id) return '';
  if (typeof id === 'string') {
    const trimmed = id.trim();
    // Reject bad values like "[object Object]"
    if (!trimmed || trimmed === '[object Object]') return '';
    return trimmed;
  }
  if (typeof id === 'object') {
    const obj = id as { _serialized?: string; user?: string; server?: string };
    if (obj._serialized) return String(obj._serialized);
    if (obj.user && obj.server) return `${obj.user}@${obj.server}`;
  }
  return '';
}

export class WhatsAppService {
  private cachedGroupId: string | null = null;

  get enabled() {
    return config.whatsapp.enabled;
  }

  private headers() {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (config.whatsapp.apiKey) {
      headers['X-Api-Key'] = config.whatsapp.apiKey;
    }
    return headers;
  }

  private url(path: string) {
    return `${config.whatsapp.apiUrl.replace(/\/$/, '')}${path}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!config.whatsapp.enabled) {
      throw new AppError(503, 'WhatsApp notifications are disabled', 'WHATSAPP_DISABLED');
    }

    const res = await fetch(this.url(path), {
      ...init,
      headers: {
        ...this.headers(),
        ...(init?.headers || {}),
      },
    });

    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      let message = `WhatsApp API error (${res.status})`;
      if (typeof body === 'object' && body) {
        const err = body as { message?: unknown; error?: unknown; exception?: { message?: unknown } };
        if (typeof err.message === 'string' && err.message.trim() && err.message !== 't') {
          message = err.message;
        } else if (typeof err.error === 'string' && err.error.trim()) {
          message = err.error;
        } else if (err.exception?.message) {
          message = String(err.exception.message);
        }
      }
      if (message === 't' || message.length < 2) {
        message = `WhatsApp send failed (${res.status}). Check the linked session is WORKING and the group id is valid.`;
      }
      throw new AppError(502, message, 'WHATSAPP_API_ERROR');
    }

    return body as T;
  }

  async getStatus() {
    if (!config.whatsapp.enabled) {
      return {
        enabled: false,
        session: config.whatsapp.session,
        status: 'DISABLED',
        groupName: config.whatsapp.groupName,
        groupId: config.whatsapp.groupId || this.cachedGroupId,
        senderHint: config.whatsapp.senderHint,
        me: null as null,
      };
    }

    try {
      const session = await this.request<WahaSession>(
        `/api/sessions/${encodeURIComponent(config.whatsapp.session)}`,
      );
      return {
        enabled: true,
        session: config.whatsapp.session,
        status: session.status || 'UNKNOWN',
        groupName: config.whatsapp.groupName,
        groupId: config.whatsapp.groupId || this.cachedGroupId,
        senderHint: config.whatsapp.senderHint,
        me: session.me || null,
      };
    } catch {
      return {
        enabled: true,
        session: config.whatsapp.session,
        status: 'NOT_STARTED',
        groupName: config.whatsapp.groupName,
        groupId: config.whatsapp.groupId || this.cachedGroupId,
        senderHint: config.whatsapp.senderHint,
        me: null as null,
      };
    }
  }

  async startSession() {
    const name = config.whatsapp.session;
    const current = await this.getStatus();

    // Restart failed / stuck sessions so a fresh QR can be issued
    if (['FAILED', 'STOPPED', 'WORKING'].includes(String(current.status).toUpperCase()) === false
      || String(current.status).toUpperCase() === 'FAILED'
      || String(current.status).toUpperCase() === 'STOPPED') {
      try {
        await this.request(`/api/sessions/${encodeURIComponent(name)}/stop`, { method: 'POST' });
      } catch {
        // ignore
      }
      try {
        await this.request(`/api/sessions/${encodeURIComponent(name)}/restart`, { method: 'POST' });
        return this.getStatus();
      } catch {
        // fall through to create/start
      }
    }

    try {
      await this.request(`/api/sessions/${encodeURIComponent(name)}/start`, {
        method: 'POST',
      });
    } catch {
      try {
        await this.request('/api/sessions', {
          method: 'POST',
          body: JSON.stringify({
            name,
            start: true,
            config: { webhooks: [] },
          }),
        });
      } catch {
        await this.request(`/api/sessions/${encodeURIComponent(name)}/restart`, {
          method: 'POST',
        });
      }
    }
    return this.getStatus();
  }

  async stopSession() {
    await this.request(`/api/sessions/${encodeURIComponent(config.whatsapp.session)}/stop`, {
      method: 'POST',
    });
    return this.getStatus();
  }

  async getQr() {
    const status = await this.getStatus();
    if (status.status === 'WORKING') {
      return { status: status.status, qr: null as string | null, message: 'Already connected' };
    }

    const session = encodeURIComponent(config.whatsapp.session);
    const hint = `Scan this QR with WhatsApp on ${config.whatsapp.senderHint || '021 214 7160'}`;

    // 1) Prefer WAHA base64 image JSON: Accept application/json on /auth/qr
    try {
      const res = await fetch(this.url(`/api/${session}/auth/qr`), {
        headers: {
          ...this.headers(),
          Accept: 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json() as { data?: string; mimetype?: string; value?: string };
        if (data?.data) {
          const mime = data.mimetype || 'image/png';
          return {
            status: status.status,
            qr: `data:${mime};base64,${data.data}`,
            message: hint,
          };
        }
      }
    } catch {
      // continue
    }

    // 2) Binary PNG from /auth/qr
    try {
      const imgRes = await fetch(this.url(`/api/${session}/auth/qr?format=image`), {
        headers: {
          ...this.headers(),
          Accept: 'image/png',
        },
      });
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || '';
        if (contentType.includes('image') || contentType.includes('octet-stream')) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          if (buffer.length > 200) {
            return {
              status: status.status,
              qr: `data:image/png;base64,${buffer.toString('base64')}`,
              message: hint,
            };
          }
        }
      }
    } catch {
      // continue
    }

    // 3) Screenshot fallback (WEBJS engine)
    const screenshotRes = await fetch(
      this.url(`/api/screenshot?session=${config.whatsapp.session}`),
      { headers: this.headers() },
    );
    if (!screenshotRes.ok) {
      throw new AppError(
        502,
        `Could not load WhatsApp QR (session: ${status.status}). Click Start / Connect, wait a few seconds, then Reload QR.`,
        'WHATSAPP_QR_ERROR',
      );
    }
    const buffer = Buffer.from(await screenshotRes.arrayBuffer());
    if (buffer.length < 200) {
      throw new AppError(
        502,
        `QR not ready yet (session: ${status.status}). Wait a moment and tap Reload QR.`,
        'WHATSAPP_QR_NOT_READY',
      );
    }
    const qr = `data:${screenshotRes.headers.get('content-type') || 'image/png'};base64,${buffer.toString('base64')}`;
    return { status: status.status, qr, message: hint };
  }

  async listGroups() {
    const groups = await this.request<WahaGroup[]>(
      `/api/${encodeURIComponent(config.whatsapp.session)}/groups`,
    );
    return (Array.isArray(groups) ? groups : [])
      .map((g) => {
        const id = normalizeChatId(g.id);
        const name = g.subject || g.name || id;
        return { id, name };
      })
      .filter((g) => !!g.id);
  }

  async resolveGroupId(forceRefresh = false) {
    if (!forceRefresh) {
      const fromEnv = normalizeChatId(config.whatsapp.groupId);
      if (fromEnv) return fromEnv;
      if (this.cachedGroupId) return this.cachedGroupId;
    }

    const groups = await this.listGroups();
    const target = config.whatsapp.groupName.trim().toLowerCase();
    const match = groups.find((g) => g.name.trim().toLowerCase() === target)
      || groups.find((g) => g.name.trim().toLowerCase().includes(target));

    if (!match?.id) {
      throw new AppError(
        404,
        `WhatsApp group "${config.whatsapp.groupName}" not found. Join it on the linked phone, then refresh groups.`,
        'WHATSAPP_GROUP_NOT_FOUND',
      );
    }

    this.cachedGroupId = match.id;
    return match.id;
  }

  async setGroupId(groupId: string) {
    const normalized = normalizeChatId(groupId);
    if (!normalized || !normalized.includes('@')) {
      throw new AppError(400, 'Invalid WhatsApp group id', 'INVALID_GROUP_ID');
    }
    this.cachedGroupId = normalized;
    return {
      groupId: this.cachedGroupId,
      groupName: config.whatsapp.groupName,
      note: 'Group selected for this server session. Set WHATSAPP_GROUP_ID in .env to persist across restarts.',
    };
  }

  async sendText(chatId: string, text: string) {
    const normalized = normalizeChatId(chatId);
    if (!normalized) {
      throw new AppError(400, 'Invalid WhatsApp chat id', 'INVALID_CHAT_ID');
    }
    return this.request('/api/sendText', {
      method: 'POST',
      body: JSON.stringify({
        session: config.whatsapp.session,
        chatId: normalized,
        text,
      }),
    });
  }

  async sendToGroup(text: string) {
    const chatId = await this.resolveGroupId();
    return this.sendText(chatId, text);
  }

  async sendTestMessage() {
    const text = [
      '✅ Ceylon CRM WhatsApp test',
      `Group: ${config.whatsapp.groupName}`,
      `Time: ${new Date().toLocaleString('en-NZ')}`,
    ].join('\n');
    await this.sendToGroup(text);
    return { sent: true, groupId: this.cachedGroupId || config.whatsapp.groupId };
  }

  buildJobCreatedMessage(input: {
    customerName: string;
    registrationNo: string;
    amount: number;
    jobNumber?: string;
  }) {
    return [
      '🆕 New Job',
      input.jobNumber ? `Job: ${input.jobNumber}` : null,
      `Customer: ${input.customerName}`,
      `Vehicle: ${input.registrationNo}`,
      `Amount: ${formatNzd(input.amount)}`,
    ].filter(Boolean).join('\n');
  }

  buildVehicleOutMessage(input: {
    customerName: string;
    registrationNo: string;
    amount: number;
    jobNumber?: string;
  }) {
    return [
      '🚗 Vehicle Out',
      input.jobNumber ? `Job: ${input.jobNumber}` : null,
      `Customer: ${input.customerName}`,
      `Vehicle: ${input.registrationNo}`,
      `Amount: ${formatNzd(input.amount)}`,
    ].filter(Boolean).join('\n');
  }

  buildLeadCreatedMessage(input: {
    leadCode?: string;
    customerName: string;
    phone?: string | null;
    source?: string | null;
    estimatedPrice?: number | null;
    notes?: string | null;
  }) {
    return [
      '📋 New Lead',
      input.leadCode ? `Lead: ${input.leadCode}` : null,
      `Customer: ${input.customerName}`,
      input.phone ? `Phone: ${input.phone}` : null,
      input.source ? `Source: ${String(input.source).replace(/_/g, ' ')}` : null,
      typeof input.estimatedPrice === 'number' ? `Est. Amount: ${formatNzd(input.estimatedPrice)}` : null,
      input.notes?.trim() ? `Notes: ${input.notes.trim().slice(0, 200)}` : null,
    ].filter(Boolean).join('\n');
  }

  /** Fire-and-forget; never throws to callers. */
  notifyJobCreated(job: {
    jobNumber?: string;
    estimatedPrice?: unknown;
    addGst?: boolean | null;
    jobCategory?: string | null;
    jobSource?: string | null;
    customer?: { name?: string | null } | null;
    vehicle?: { registrationNo?: string | null } | null;
    subTasks?: { price?: unknown }[] | null;
  }) {
    if (!config.whatsapp.enabled) return;
    const amount = jobAmountWithGst(job.subTasks || undefined, job.estimatedPrice, job);
    const text = this.buildJobCreatedMessage({
      customerName: job.customer?.name?.trim() || 'Unknown',
      registrationNo: job.vehicle?.registrationNo?.trim() || '—',
      amount,
      jobNumber: job.jobNumber,
    });
    void this.sendToGroup(text).catch((err) => {
      logger.error('WhatsApp job-created notify failed', err instanceof Error ? err.message : err);
    });
  }

  notifyVehicleOut(job: {
    jobNumber?: string;
    jobAmount?: number;
    estimatedPrice?: unknown;
    addGst?: boolean | null;
    jobCategory?: string | null;
    jobSource?: string | null;
    customer?: { name?: string | null } | null;
    vehicle?: { registrationNo?: string | null } | null;
    subTasks?: { price?: unknown }[] | null;
  }) {
    if (!config.whatsapp.enabled) return;
    const amount = typeof job.jobAmount === 'number'
      ? job.jobAmount
      : jobAmountWithGst(job.subTasks || undefined, job.estimatedPrice, job);
    const text = this.buildVehicleOutMessage({
      customerName: job.customer?.name?.trim() || 'Unknown',
      registrationNo: job.vehicle?.registrationNo?.trim() || '—',
      amount,
      jobNumber: job.jobNumber,
    });
    void this.sendToGroup(text).catch((err) => {
      logger.error('WhatsApp vehicle-out notify failed', err instanceof Error ? err.message : err);
    });
  }

  notifyLeadCreated(lead: {
    leadCode?: string;
    customerName?: string | null;
    phone?: string | null;
    source?: string | null;
    estimatedPrice?: number | null;
    notes?: string | null;
  }) {
    if (!config.whatsapp.enabled) return;
    const text = this.buildLeadCreatedMessage({
      leadCode: lead.leadCode,
      customerName: lead.customerName?.trim() || 'Unknown',
      phone: lead.phone,
      source: lead.source,
      estimatedPrice: lead.estimatedPrice ?? null,
      notes: lead.notes,
    });
    void this.sendToGroup(text).catch((err) => {
      logger.error('WhatsApp lead-created notify failed', err instanceof Error ? err.message : err);
    });
  }
}

export const whatsappService = new WhatsAppService();
