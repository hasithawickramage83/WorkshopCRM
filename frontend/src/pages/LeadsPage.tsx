import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Link2, MessageSquarePlus, Phone } from 'lucide-react';
import { leadsApi, customersApi } from '../lib/api';
import { Customer, formatCurrency, formatDate, formatStatus, formatCompany, BUSINESS_COMPANIES } from '../lib/types';

interface LeadFollowUp {
  id: string;
  status: string;
  description: string;
  nextDate?: string | null;
  createdAt: string;
}

interface Lead {
  id: string;
  leadCode: string;
  customerName: string;
  company?: string;
  companyName?: string;
  phone?: string;
  email?: string;
  source: string;
  status: string;
  estimatedPrice?: number | null;
  notes?: string;
  customerId?: string | null;
  customer?: { id: string; name: string; customerCode: string };
  followUps?: LeadFollowUp[];
  _count?: { followUps: number };
  createdAt: string;
}

const SOURCES = ['WALK_IN', 'PHONE_CALL', 'WEBSITE', 'FACEBOOK', 'REFERRAL', 'DEALER_VISIT', 'INSURANCE_COMPANY', 'FLEET_COMPANY', 'OTHER'];

const STATUSES = [
  'NEW', 'PENDING', 'CONTACTED', 'VISITED', 'INTERESTED', 'QUOTED', 'NEGOTIATING',
  'WON', 'LOST', 'CLOSED', 'CANCELLED',
];

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-orange-100 text-orange-800',
  CONTACTED: 'bg-yellow-100 text-yellow-800',
  VISITED: 'bg-cyan-100 text-cyan-800',
  INTERESTED: 'bg-purple-100 text-purple-800',
  QUOTED: 'bg-indigo-100 text-indigo-800',
  NEGOTIATING: 'bg-violet-100 text-violet-800',
  WON: 'bg-green-100 text-green-800',
  CLOSED: 'bg-green-100 text-green-800',
  LOST: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

const emptyForm = {
  customerName: '',
  company: 'CEYLON_AUTOMOBILE',
  phone: '',
  email: '',
  source: 'WEBSITE',
  status: 'NEW',
  estimatedPrice: '',
  notes: '',
  customerId: '',
};

const emptyFollowUp = {
  status: 'CONTACTED',
  description: '',
  nextDate: '',
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState('');
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [followUpForm, setFollowUpForm] = useState(emptyFollowUp);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  const load = () => leadsApi.list().then((res) => setLeads(res.data.data.leads));

  useEffect(() => {
    load();
    customersApi.list({ limit: '200' }).then((res) => setCustomers(res.data.data.customers));
  }, []);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (lead: Lead) => {
    setEditingId(lead.id);
    setForm({
      customerName: lead.customerName,
      company: lead.company || 'CEYLON_AUTOMOBILE',
      phone: lead.phone || '',
      email: lead.email || '',
      source: lead.source,
      status: lead.status,
      estimatedPrice: lead.estimatedPrice != null ? String(lead.estimatedPrice) : '',
      notes: lead.notes || '',
      customerId: lead.customerId || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      customerName: form.customerName,
      company: form.company,
      phone: form.phone || undefined,
      email: form.email || undefined,
      source: form.source,
      status: form.status,
      estimatedPrice: form.estimatedPrice.trim() === '' ? null : Number(form.estimatedPrice),
      notes: form.notes || undefined,
      customerId: form.customerId || null,
    };
    try {
      if (editingId) {
        await leadsApi.update(editingId, payload);
        setToast('Lead updated');
      } else {
        await leadsApi.create(payload);
        setToast('Lead created');
      }
      setShowForm(false);
      load();
    } catch {
      setToast('Failed to save lead');
    }
  };

  const handleDelete = async (lead: Lead) => {
    if (!confirm(`Delete lead ${lead.leadCode} — ${lead.customerName}?`)) return;
    try {
      await leadsApi.delete(lead.id);
      setToast('Lead deleted');
      load();
    } catch {
      setToast('Failed to delete lead');
    }
  };

  const handleStatusChange = async (lead: Lead, status: string) => {
    try {
      await leadsApi.update(lead.id, { status });
      load();
    } catch {
      setToast('Failed to update status');
    }
  };

  const openFollowUps = async (lead: Lead) => {
    setFollowUpLead(lead);
    setFollowUpForm({
      status: lead.status === 'NEW' ? 'CONTACTED' : lead.status,
      description: '',
      nextDate: '',
    });
    setLoadingFollowUps(true);
    try {
      const res = await leadsApi.get(lead.id);
      const detail = res.data.data as Lead;
      setFollowUps(detail.followUps || []);
      setFollowUpLead(detail);
    } catch {
      setToast('Failed to load follow-ups');
      setFollowUpLead(null);
    } finally {
      setLoadingFollowUps(false);
    }
  };

  const submitFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpLead) return;
    if (!followUpForm.description.trim()) {
      setToast('Enter a follow-up description');
      return;
    }
    setSavingFollowUp(true);
    try {
      await leadsApi.addFollowUp(followUpLead.id, {
        status: followUpForm.status,
        description: followUpForm.description.trim(),
        nextDate: followUpForm.nextDate || null,
      });
      setToast('Follow-up saved');
      setFollowUpForm({
        status: followUpForm.status,
        description: '',
        nextDate: '',
      });
      const res = await leadsApi.get(followUpLead.id);
      const detail = res.data.data as Lead;
      setFollowUps(detail.followUps || []);
      setFollowUpLead(detail);
      load();
    } catch {
      setToast('Failed to save follow-up');
    } finally {
      setSavingFollowUp(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">CRM Leads</h1>
          <p className="text-gray-500">Add, edit, follow up, update status, and link leads to customers</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Lead
        </button>
      </div>

      {toast && <div className="bg-brand-50 text-brand-800 px-4 py-3 rounded-lg text-sm">{toast}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">{editingId ? 'Edit Lead' : 'New Lead'}</h3>
            <button type="button" onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="label">Customer Name *</label><input className="input" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
            <div>
              <label className="label">Company *</label>
              <select className="input" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                {BUSINESS_COMPANIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div>
              <label className="label">Source</label>
              <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {SOURCES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Job estimated price (NZD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                placeholder="e.g. 1500"
                value={form.estimatedPrice}
                onChange={(e) => setForm({ ...form, estimatedPrice: e.target.value })}
              />
            </div>
            {editingId && (
              <div className="md:col-span-2">
                <label className="label flex items-center gap-1"><Link2 className="w-4 h-4" /> Link to Customer</label>
                <select className="input" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                  <option value="">— Not linked —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.customerCode})</option>)}
                </select>
              </div>
            )}
            <div className="md:col-span-2"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">{editingId ? 'Save Changes' : 'Create Lead'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {leads.map((lead) => {
          const latest = lead.followUps?.[0];
          const followUpCount = lead._count?.followUps ?? lead.followUps?.length ?? 0;
          return (
            <div key={lead.id} className="card">
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-mono text-gray-400">{lead.leadCode}</span>
                <select
                  className={`text-xs font-medium rounded-full px-2 py-0.5 border-0 cursor-pointer ${STATUS_COLORS[lead.status] || 'bg-gray-100 text-gray-800'}`}
                  value={lead.status}
                  onChange={(e) => handleStatusChange(lead, e.target.value)}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
                </select>
              </div>
              <h3 className="font-semibold">{lead.customerName}</h3>
              <p className="text-xs text-brand-700 font-medium mt-0.5">{formatCompany(lead.company)}</p>
              <p className="text-sm text-gray-500 mt-1">{lead.phone || 'No phone'}</p>
              {lead.estimatedPrice != null && Number(lead.estimatedPrice) > 0 && (
                <p className="text-sm font-semibold text-brand-800 mt-1">
                  Est. {formatCurrency(Number(lead.estimatedPrice))}
                </p>
              )}
              {lead.customer && (
                <p className="text-xs text-brand-600 mt-1 flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> {lead.customer.name}
                </p>
              )}
              {latest && (
                <div className="mt-2 bg-gray-50 rounded-lg p-2 text-xs text-gray-600">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`badge ${STATUS_COLORS[latest.status] || 'bg-gray-100 text-gray-800'}`}>
                      {formatStatus(latest.status)}
                    </span>
                    <span className="text-gray-400">{formatDate(latest.createdAt)}</span>
                  </div>
                  <p className="line-clamp-2">{latest.description}</p>
                </div>
              )}
              {lead.notes && !latest && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{lead.notes}</p>}
              <div className="mt-3 flex justify-between items-center">
                <div className="text-xs text-gray-400">
                  <span>{lead.source.replace(/_/g, ' ')}</span>
                  <span className="mx-1">·</span>
                  <span>{formatDate(lead.createdAt)}</span>
                  {followUpCount > 0 && (
                    <>
                      <span className="mx-1">·</span>
                      <span>{followUpCount} follow-up{followUpCount === 1 ? '' : 's'}</span>
                    </>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openFollowUps(lead)}
                    className="p-1.5 text-brand-600 hover:bg-brand-50 rounded"
                    title="Follow up"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(lead)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(lead)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {followUpLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8 space-y-4 p-6">
            <div className="flex justify-between items-start gap-3">
              <div>
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <MessageSquarePlus className="w-5 h-5 text-brand-600" />
                  Lead Follow-up
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {followUpLead.leadCode} · {followUpLead.customerName}
                  {followUpLead.phone ? ` · ${followUpLead.phone}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setFollowUpLead(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitFollowUp} className="border rounded-lg p-4 space-y-3 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Add follow-up</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Status *</label>
                  <select
                    className="input"
                    required
                    value={followUpForm.status}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, status: e.target.value })}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Next follow-up date</label>
                  <input
                    type="date"
                    className="input"
                    value={followUpForm.nextDate}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, nextDate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">Description *</label>
                <textarea
                  className="input"
                  rows={3}
                  required
                  placeholder="What was discussed, outcome, next action..."
                  value={followUpForm.description}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setFollowUpLead(null)}>Close</button>
                <button type="submit" className="btn-primary" disabled={savingFollowUp}>
                  {savingFollowUp ? 'Saving...' : 'Save Follow-up'}
                </button>
              </div>
            </form>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Follow-up history</h3>
              {loadingFollowUps ? (
                <p className="text-sm text-gray-400 py-4 text-center">Loading...</p>
              ) : followUps.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No follow-ups yet</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {followUps.map((fu, idx) => (
                    <div key={fu.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-brand-500 mt-1.5" />
                        {idx < followUps.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
                      </div>
                      <div className="flex-1 border rounded-lg p-3 mb-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`badge ${STATUS_COLORS[fu.status] || 'bg-gray-100 text-gray-800'}`}>
                            {formatStatus(fu.status)}
                          </span>
                          <span className="text-xs text-gray-400">{formatDate(fu.createdAt)}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{fu.description}</p>
                        {fu.nextDate && (
                          <p className="text-xs text-brand-700 mt-2">Next follow-up: {formatDate(fu.nextDate)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
