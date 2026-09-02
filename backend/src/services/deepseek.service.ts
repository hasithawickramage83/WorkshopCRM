import { AiLogType } from '@prisma/client';
import prisma from '../utils/prisma';
import { config } from '../utils/config';
import { AppError } from '../utils/response';
import { logger } from '../utils/logger';

type AiRequestType =
  | 'CUSTOMER_MESSAGE'
  | 'WORKSHOP_ASSISTANT'
  | 'INSURANCE_ASSISTANT'
  | 'SALES_ASSISTANT'
  | 'QUOTATION_GENERATOR';

const SYSTEM_PROMPTS: Record<AiRequestType, string> = {
  CUSTOMER_MESSAGE: `You are an AI assistant for Ceylon Automobile / West Panel, Paint & Tyres workshop in New Zealand.
Generate professional, friendly customer communication messages for SMS or email.
Keep messages concise, clear, and professional. Use NZ English.`,
  WORKSHOP_ASSISTANT: `You are an expert automotive workshop assistant for a panel beating, paint, and tyre workshop.
Provide repair scope, estimated time, parts needed, and technical recommendations.
Format output with clear sections: Repair Scope, Estimated Time, Parts Required, Notes.`,
  INSURANCE_ASSISTANT: `You are an insurance claim assessment assistant for an automotive repair workshop.
Generate professional claim summaries, damage descriptions, and assessment reports suitable for insurance companies.
Use formal, technical language appropriate for insurance documentation.`,
  SALES_ASSISTANT: `You are a sales assistant for Ceylon Automobile workshop.
Generate persuasive but professional sales messages, follow-up replies, and negotiation responses.
Focus on building trust and highlighting quality workmanship.`,
  QUOTATION_GENERATOR: `You are a quotation specialist for an automotive repair workshop in New Zealand.
Generate professional quotation text with itemised scope of work, pricing suggestions, and terms.
Include GST note (15% NZ GST). Format professionally for customer presentation.`,
};

const TYPE_MAP: Record<AiRequestType, AiLogType> = {
  CUSTOMER_MESSAGE: 'CUSTOMER_MESSAGE',
  WORKSHOP_ASSISTANT: 'WORKSHOP_ASSISTANT',
  INSURANCE_ASSISTANT: 'INSURANCE_ASSISTANT',
  SALES_ASSISTANT: 'SALES_ASSISTANT',
  QUOTATION_GENERATOR: 'QUOTATION_GENERATOR',
};

export class DeepSeekService {
  async generate(params: {
    type: AiRequestType;
    context: string;
    userId?: string;
    entityType?: string;
    entityId?: string;
    additionalInfo?: Record<string, unknown>;
  }) {
    if (!config.deepseek.apiKey) {
      throw new AppError(500, 'DeepSeek API key not configured', 'AI_NOT_CONFIGURED');
    }

    const systemPrompt = SYSTEM_PROMPTS[params.type];
    let userPrompt = params.context;

    if (params.additionalInfo) {
      userPrompt += `\n\nAdditional Information:\n${JSON.stringify(params.additionalInfo, null, 2)}`;
    }

    const response = await this.callDeepSeek(systemPrompt, userPrompt);
    const content = response.choices?.[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens;

    await prisma.aiLog.create({
      data: {
        userId: params.userId,
        type: TYPE_MAP[params.type],
        prompt: userPrompt,
        response: content,
        tokensUsed,
        model: config.deepseek.model,
        entityType: params.entityType,
        entityId: params.entityId,
      },
    });

    return { content, tokensUsed, model: config.deepseek.model };
  }

  async generateWorkshopAnalysis(context: string, userId?: string) {
    return this.generate({
      type: 'WORKSHOP_ASSISTANT',
      context,
      userId,
    });
  }

  async generateCustomerMessage(context: string, userId?: string, channel: 'sms' | 'email' = 'sms') {
    const enhancedContext = `${context}\n\nChannel: ${channel.toUpperCase()}`;
    return this.generate({
      type: 'CUSTOMER_MESSAGE',
      context: enhancedContext,
      userId,
    });
  }

  async sendEmailViaWebhook(params: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    if (!config.email.webhookUrl) {
      logger.warn('Email webhook not configured');
      return { sent: false, reason: 'webhook_not_configured' };
    }

    const payload = {
      to: params.to,
      from: config.email.from,
      subject: params.subject,
      // Common field names used by Make.com, Zapier, and email modules
      body: params.text,
      text: params.text,
      plainText: params.text,
      message: params.text,
      content: params.text,
      html: params.html,
      htmlBody: params.html,
      htmlContent: params.html,
    };

    try {
      const res = await fetch(config.email.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        logger.error('Email webhook error', { status: res.status, error: errorText });
      }

      return { sent: res.ok, status: res.status };
    } catch (error) {
      logger.error('Email webhook failed', error);
      return { sent: false, reason: 'webhook_error' };
    }
  }

  private async callDeepSeek(systemPrompt: string, userPrompt: string) {
    const res = await fetch(config.deepseek.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.deepseek.apiKey}`,
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      logger.error('DeepSeek API error', { status: res.status, error: errorText });
      throw new AppError(502, 'AI service unavailable', 'AI_SERVICE_ERROR');
    }

    return res.json() as Promise<{
      choices: { message: { content: string } }[];
      usage?: { total_tokens: number };
    }>;
  }

  async getLogs(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      prisma.aiLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.aiLog.count(),
    ]);
    return { logs, total, page, limit };
  }
}

export const deepSeekService = new DeepSeekService();
