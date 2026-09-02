import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, X, Link2, Unlink } from 'lucide-react';
import { customersApi, leadsApi } from '../lib/api';
import { Customer, formatDate, formatStatus, formatCompany, BUSINESS_COMPANIES } from '../lib/types';

const CUSTOMER_TYPES = ['WALK_IN', 'INSURANCE', 'DEALER', 'FLEET', 'TRADE', 'BUSINESS', 'SUPPLIER'];

interface LinkedLead {
  id: string;
  leadCode: string;
  customerName: string;
  status: string;
  phone?: string;
  customerId?: string | null;
}

interface CustomerDetail extends Customer {
  leads?: LinkedLead[];
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allLeads, setAllLeads] = useState<LinkedLead[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState('');
  const [editingLeads, setEditingLeads] = useState<LinkedLead[]>([]);
  const [linkLeadId, setLinkLeadId] = useState('');
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', customerType: 'WALK_IN', address: '', company: 'CEYLON_AUTOMOBILE', companyName: '', contactPerson: '' });

  const load = () => {
    customersApi.list({ search }).then((res) => setCustomers(res.data.data.customers)).finally(() => setLoading(false));
    leadsApi.list({ limit: '200' }).then((res) => setAllLeads(res.data.data.leads));
  };

  useEffect(() => { load(); }, [search]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const openCreate = () => {
    setEditingId(null);
    setEditingCode('');
    setEditingLeads([]);
    setForm({ name: '', phone: '', email: '', customerType: 'WALK_IN', address: '', company: 'CEYLON_AUTOMOBILE', companyName: '', contactPerson: '' });
    setShowForm(true);
  };

  const openEdit = async (customer: Customer) => {
    setEditingId(customer.id);
    setEditingCode(customer.customerCode);
    const res = await customersApi.get(customer.id);
    const detail = res.data.data as CustomerDetail;
    setForm({
      name: detail.name,
      phone: detail.phone || '',
      email: detail.email || '',
      customerType: detail.customerType,
      address: (detail as CustomerDetail & { address?: string }).address || '',
      company: (detail as CustomerDetail & { company?: string }).company || 'CEYLON_AUTOMOBILE',
      companyName: (detail as CustomerDetail & { companyName?: string }).companyName || '',
      contactPerson: (detail as CustomerDetail & { contactPerson?: string }).contactPerson || '',
    });
    setEditingLeads(detail.leads || []);
    setLinkLeadId('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await customersApi.update(editingId, form);
        setToast('Customer updated');
      } else {
        await customersApi.create(form);
        setToast('Customer created');
      }
      setShowForm(false);
      load();
    } catch {
      setToast('Failed to save customer');
    }
  };

  const handleLinkLead = async () => {
    if (!editingId || !linkLeadId) return;
    try {
      await leadsApi.update(linkLeadId, { customerId: editingId });
      const res = await customersApi.get(editingId);
      setEditingLeads((res.data.data as CustomerDetail).leads || []);
      setLinkLeadId('');
      setToast('Lead linked to customer');
      load();
    } catch {
      setToast('Failed to link lead');
    }
  };

  const handleUnlinkLead = async (leadId: string) => {
    if (!confirm('Unlink this lead from the customer?')) return;
    try {
      await leadsApi.update(leadId, { customerId: null });
      setEditingLeads((prev) => prev.filter((l) => l.id !== leadId));
      setToast('Lead unlinked');
      load();
    } catch {
      setToast('Failed to unlink lead');
    }
  };

  const unlinkedLeads = allLeads.filter((l) => !l.customerId && !editingLeads.some((el) => el.id === l.id));

  const copyDealerRegistrationLink = async (customer: Customer) => {
    const link = `${window.location.origin}/register?dealer=${encodeURIComponent(customer.customerCode)}`;
    try {
      await navigator.clipboard.writeText(link);
      setToast(`Registration link copied for ${customer.companyName?.trim() || customer.name}`);
    } catch {
      setToast(link);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-gray-500">Manage customers and link CRM leads</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {toast && <div className="bg-brand-50 text-brand-800 px-4 py-3 rounded-lg text-sm">{toast}</div>}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className="input pl-10" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">{editingId ? 'Edit Customer' : 'New Customer'}</h3>
            <button type="button" onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="label">Name *</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <label className="label">Company *</label>
              <select className="input" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                {BUSINESS_COMPANIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div><label className="label">Org / Business Name</label><input className="input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Customer's own company" /></div>
            <div><label className="label">Contact Person</label><input className="input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })}>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="md:col-span-2"><label className="label">Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>

          {editingId && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2"><Link2 className="w-4 h-4" /> Linked Leads</h4>
              {editingLeads.length === 0 ? (
                <p className="text-sm text-gray-400">No leads linked yet</p>
              ) : (
                <div className="space-y-2">
                  {editingLeads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <div>
                        <span className="font-mono text-xs text-gray-400 mr-2">{lead.leadCode}</span>
                        <span className="font-medium">{lead.customerName}</span>
                        <span className="ml-2 badge bg-blue-100 text-blue-800 text-xs">{formatStatus(lead.status)}</span>
                      </div>
                      <button type="button" onClick={() => handleUnlinkLead(lead.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Unlink">
                        <Unlink className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <select className="input flex-1" value={linkLeadId} onChange={(e) => setLinkLeadId(e.target.value)}>
                  <option value="">Select lead to link...</option>
                  {unlinkedLeads.map((l) => (
                    <option key={l.id} value={l.id}>{l.leadCode} — {l.customerName} ({formatStatus(l.status)})</option>
                  ))}
                </select>
                <button type="button" onClick={handleLinkLead} disabled={!linkLeadId} className="btn-secondary whitespace-nowrap">Link Lead</button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary">{editingId ? 'Save Changes' : 'Create Customer'}</button>
            {editingId && form.customerType === 'DEALER' && editingCode && (
              <button
                type="button"
                className="btn-secondary flex items-center gap-2"
                onClick={() => copyDealerRegistrationLink({
                  id: editingId,
                  customerCode: editingCode,
                  name: form.name,
                  companyName: form.companyName,
                  phone: form.phone,
                  email: form.email,
                  customerType: form.customerType,
                  createdAt: '',
                })}
              >
                <Link2 className="w-4 h-4" /> Copy registration link
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 font-medium">Code</th>
              <th className="pb-3 font-medium">Name</th>
              <th className="pb-3 font-medium">Company</th>
              <th className="pb-3 font-medium">Phone</th>
              <th className="pb-3 font-medium">Type</th>
              <th className="pb-3 font-medium">Created</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">No customers found</td></tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 font-mono text-xs">{c.customerCode}</td>
                  <td className="py-3 font-medium">{c.name}</td>
                  <td className="py-3">
                    <span className="text-sm">{formatCompany(c.company)}</span>
                    {c.companyName && <span className="block text-xs text-gray-400">{c.companyName}</span>}
                  </td>
                  <td className="py-3">{c.phone || '—'}</td>
                  <td className="py-3"><span className="badge bg-blue-100 text-blue-800">{c.customerType.replace(/_/g, ' ')}</span></td>
                  <td className="py-3 text-gray-500">{formatDate(c.createdAt)}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      {c.customerType === 'DEALER' && (
                        <button
                          type="button"
                          onClick={() => copyDealerRegistrationLink(c)}
                          className="p-2 text-brand-700 hover:bg-brand-50 rounded-lg"
                          title="Copy job registration link for this dealer"
                        >
                          <Link2 className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => openEdit(c)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Edit & link leads">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
