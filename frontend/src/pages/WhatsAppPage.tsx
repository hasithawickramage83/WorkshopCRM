import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageCircle, RefreshCw, Play, Square, Send } from 'lucide-react';
import { whatsappApi } from '../lib/api';

interface WhatsAppStatus {
  enabled: boolean;
  session: string;
  status: string;
  groupName: string;
  groupId?: string | null;
  senderHint?: string;
  me?: { id?: string; pushName?: string } | null;
}

interface WhatsAppGroup {
  id: string;
  name: string;
}

function needsQr(status?: string | null) {
  if (!status) return false;
  const s = status.toUpperCase();
  if (s === 'WORKING' || s === 'DISABLED') return false;
  return true;
}

export default function WhatsAppPage() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const showError = (err: unknown, fallback: string) => {
    const msg = (err as { response?: { data?: { error?: { message?: string } } } })
      ?.response?.data?.error?.message;
    setError(msg || fallback);
  };

  const loadStatus = useCallback(async () => {
    const res = await whatsappApi.status();
    const data = res.data.data as WhatsAppStatus;
    setStatus(data);
    if (data.groupId) setSelectedGroupId(data.groupId);
    return data;
  }, []);

  const loadQr = useCallback(async () => {
    setQrLoading(true);
    setError('');
    try {
      const res = await whatsappApi.qr();
      const data = res.data.data as { qr?: string | null; status?: string; message?: string };
      if (data.status) {
        setStatus((prev) => (prev ? { ...prev, status: data.status! } : prev));
      }
      setQr(data.qr || null);
      if (data.message) setToast(data.message);
      if (!data.qr) {
        setError('QR not ready yet. Tap Start / Connect, wait 3–5 seconds, then Reload QR.');
      }
    } catch (err) {
      setQr(null);
      showError(err, 'Could not load QR code');
    } finally {
      setQrLoading(false);
    }
  }, []);

  const refresh = useCallback(async (withQr = true) => {
    setLoading(true);
    setError('');
    try {
      const data = await loadStatus();
      if (withQr && needsQr(data.status)) {
        await loadQr();
      } else if (data.status === 'WORKING') {
        setQr(null);
      }
    } catch (err) {
      showError(err, 'Failed to load WhatsApp status');
    } finally {
      setLoading(false);
    }
  }, [loadQr, loadStatus]);

  useEffect(() => { refresh(true); }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Keep refreshing QR while pairing — WhatsApp rotates the code
  useEffect(() => {
    if (!needsQr(status?.status)) return;
    const t = setInterval(() => { refresh(true); }, 8000);
    return () => clearInterval(t);
  }, [status?.status, refresh]);

  const run = async (key: string, action: () => Promise<void>, okMsg: string) => {
    setBusy(key);
    setError('');
    try {
      await action();
      setToast(okMsg);
      // Give WAHA a moment to produce the QR after start
      if (key === 'start') {
        await new Promise((r) => setTimeout(r, 2500));
      }
      await refresh(true);
    } catch (err) {
      showError(err, 'Action failed');
    } finally {
      setBusy('');
    }
  };

  const loadGroups = () => run('groups', async () => {
    const res = await whatsappApi.groups();
    const list = (res.data.data.groups || []) as WhatsAppGroup[];
    setGroups(list);
    const match = list.find((g) => g.name.toLowerCase() === (status?.groupName || 'ca management').toLowerCase())
      || list.find((g) => g.name.toLowerCase().includes('ca management'));
    if (match) setSelectedGroupId(match.id);
  }, 'Groups loaded');

  const connected = status?.status === 'WORKING';
  const showQrPanel = !connected && status?.enabled !== false;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="w-7 h-7 text-brand-700" /> WhatsApp Alerts
        </h1>
        <p className="text-gray-500 mt-1">
          Link phone <strong>{status?.senderHint || '021 214 7160'}</strong> and send job / vehicle-out messages to{' '}
          <strong>{status?.groupName || 'CA Management'}</strong>.
        </p>
      </div>

      {toast && <div className="bg-brand-50 text-brand-800 px-4 py-3 rounded-lg text-sm">{toast}</div>}
      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">Connection status</p>
            <p className="text-lg font-semibold">
              {loading ? 'Loading…' : (status?.status || 'UNKNOWN')}
              {status?.me?.pushName ? (
                <span className="text-sm font-normal text-gray-500 ml-2">({status.me.pushName})</span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => refresh(true)} disabled={!!busy}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              type="button"
              className="btn-primary flex items-center gap-2"
              disabled={!!busy || status?.enabled === false}
              onClick={() => run('start', async () => { await whatsappApi.start(); }, 'Session started — scan QR if shown')}
            >
              {busy === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start / Connect
            </button>
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              disabled={!!busy || !connected}
              onClick={() => run('stop', async () => { await whatsappApi.stop(); }, 'Session stopped')}
            >
              {busy === 'stop' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Stop
            </button>
          </div>
        </div>

        {showQrPanel && (
          <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center space-y-3">
            <p className="text-sm text-gray-600">
              1. Tap <strong>Start / Connect</strong><br />
              2. On phone <strong>021 214 7160</strong> open WhatsApp → Linked devices → Link a device<br />
              3. Scan the QR below (it refreshes automatically)
            </p>
            {qrLoading && !qr && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-10">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading QR…
              </div>
            )}
            {qr ? (
              <img
                src={qr}
                alt="WhatsApp QR"
                className="mx-auto w-72 h-72 object-contain bg-white p-2 rounded-lg border"
              />
            ) : !qrLoading && (
              <p className="text-sm text-gray-400 py-6">
                No QR yet. Tap <strong>Start / Connect</strong>, wait a few seconds, then <strong>Reload QR</strong>.
              </p>
            )}
            <button
              type="button"
              className="btn-secondary text-sm inline-flex items-center gap-2"
              onClick={() => loadQr()}
              disabled={!!busy || qrLoading}
            >
              {qrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Reload QR
            </button>
          </div>
        )}

        {connected && (
          <div className="bg-green-50 text-green-800 px-4 py-3 rounded-lg text-sm">
            Connected. Make sure this phone has joined the <strong>CA Management</strong> group (scan the group invite QR once on the phone).
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">Target group</h2>
        <p className="text-sm text-gray-500">
          After connecting, load groups and select <strong>CA Management</strong>, then send a test message.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={!connected || !!busy} onClick={loadGroups}>
            {busy === 'groups' ? 'Loading…' : 'Load groups'}
          </button>
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            disabled={!connected || !!busy}
            onClick={() => run('test', async () => { await whatsappApi.test(); }, 'Test message sent to the group')}
          >
            {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send test message
          </button>
        </div>
        {(groups.length > 0 || selectedGroupId) && (
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="input flex-1"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              <option value="">Select group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              disabled={!selectedGroupId || !!busy}
              onClick={() => run('select', async () => {
                await whatsappApi.selectGroup(selectedGroupId);
              }, 'Group selected')}
            >
              Use selected group
            </button>
          </div>
        )}
        {status?.groupId && (
          <p className="text-xs text-gray-500 font-mono break-all">Active group id: {status.groupId}</p>
        )}
      </div>

      <div className="card text-sm text-gray-600 space-y-2">
        <h2 className="font-semibold text-gray-900">Automatic messages → CA Management</h2>
        <p><strong>New job</strong> (Jobs / Register) — customer, vehicle rego, amount</p>
        <p><strong>New lead</strong> — customer, phone, source, est. amount</p>
        <p><strong>Vehicle out</strong> — customer, vehicle rego, amount</p>
        <p className="text-xs text-gray-400">
          Keep WhatsApp open on the phone occasionally so the linked session stays active.
        </p>
      </div>
    </div>
  );
}
