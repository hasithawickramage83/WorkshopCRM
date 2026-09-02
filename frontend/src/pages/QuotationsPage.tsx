import { useEffect, useState } from 'react';
import { Plus, Pencil, Mail, MessageCircle, X, Trash2, Loader2 } from 'lucide-react';
import { quotationsApi, customersApi } from '../lib/api';
import { Customer, formatCurrency, formatDate, formatStatus } from '../lib/types';

interface QuotationItem {
  description: string;
  quantity: number;
  unitPrice: number;
  itemType?: string;
}

interface Quotation {
  id: string;
  quotationNumber: string;
  totalAmount: number;
  labourCost: number;
  partsCost: number;
  paintCost: number;
  discount: number;
  gst: number;
  status: string;
  notes?: string;
  customer?: { id: string; name: string; email?: string; phone?: string };
  items?: QuotationItem[];
  createdAt: string;
}

const emptyItem = (): QuotationItem => ({ description: '', quantity: 1, unitPrice: 0, itemType: 'PART' });

const emptyForm = {
  customerId: '',
  labourCost: '0',
  partsCost: '0',
  paintCost: '0',
  discount: '0',
  notes: '',
  items: [] as QuotationItem[],
};

function calcPreview(labour: number, parts: number, paint: number, discount: number) {
  const subtotal = labour + parts + paint;
  const afterDiscount = Math.max(0, subtotal - discount);
  const gst = afterDiscount * 0.15;
  return afterDiscount + gst;
};

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = () => quotationsApi.list().then((res) => setQuotations(res.data.data.quotations));

  useEffect(() => {
    load();
    customersApi.list({ limit: '100' }).then((res) => setCustomers(res.data.data.customers));
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = async (id: string) => {
    const res = await quotationsApi.get(id);
    const q = res.data.data;
    setEditingId(id);
    setForm({
      customerId: q.customerId,
      labourCost: String(Number(q.labourCost)),
      partsCost: String(Number(q.partsCost)),
      paintCost: String(Number(q.paintCost)),
      discount: String(Number(q.discount)),
      notes: q.notes || '',
      items: (q.items || []).map((i: QuotationItem & { totalPrice?: number }) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        itemType: i.itemType || 'PART',
      })),
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      labourCost: parseFloat(form.labourCost) || 0,
      partsCost: parseFloat(form.partsCost) || 0,
      paintCost: parseFloat(form.paintCost) || 0,
      discount: parseFloat(form.discount) || 0,
      notes: form.notes,
      items: form.items.filter((i) => i.description.trim()),
    };

    try {
      if (editingId) {
        await quotationsApi.update(editingId, payload);
        setToast({ type: 'success', message: 'Quotation updated successfully' });
      } else {
        await quotationsApi.create({ ...payload, customerId: form.customerId });
        setToast({ type: 'success', message: 'Quotation created successfully' });
      }
      closeForm();
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setToast({ type: 'error', message: msg || 'Failed to save quotation' });
    }
  };

  const handleSendEmail = async (q: Quotation) => {
    if (!q.customer?.email) {
      setToast({ type: 'error', message: 'Customer has no email address on file' });
      return;
    }
    setSending(`${q.id}-email`);
    try {
      await quotationsApi.sendEmail(q.id);
      setToast({ type: 'success', message: `Quotation emailed to ${q.customer.email}` });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setToast({ type: 'error', message: msg || 'Failed to send email' });
    } finally {
      setSending(null);
    }
  };

  const handleSendWhatsApp = async (q: Quotation) => {
    if (!q.customer?.phone) {
      setToast({ type: 'error', message: 'Customer has no phone number on file' });
      return;
    }
    setSending(`${q.id}-whatsapp`);
    try {
      const res = await quotationsApi.sendWhatsApp(q.id);
      window.open(res.data.data.whatsappUrl, '_blank', 'noopener,noreferrer');
      setToast({ type: 'success', message: 'WhatsApp opened — send the message to the customer' });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setToast({ type: 'error', message: msg || 'Failed to open WhatsApp' });
    } finally {
      setSending(null);
    }
  };

  const addItem = () => setForm({ ...form, items: [...form.items, emptyItem()] });
  const removeItem = (idx: number) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  const updateItem = (idx: number, field: keyof QuotationItem, value: string | number) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };

  const previewTotal = calcPreview(
    parseFloat(form.labourCost) || 0,
    parseFloat(form.partsCost) || 0,
    parseFloat(form.paintCost) || 0,
    parseFloat(form.discount) || 0
  );

  const canEdit = (status: string) => ['DRAFT', 'SENT'].includes(status);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Quotations</h1>
          <p className="text-gray-500">Create, edit, and send quotations via email or WhatsApp</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Quotation
        </button>
      </div>

      {toast && (
        <div className={`px-4 py-3 rounded-lg text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {toast.message}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">{editingId ? 'Edit Quotation' : 'New Quotation'}</h3>
            <button type="button" onClick={closeForm} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {!editingId && (
              <div>
                <label className="label">Customer *</label>
                <select className="input" required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                  <option value="">Select</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div><label className="label">Labour ($)</label><input type="number" step="0.01" min="0" className="input" value={form.labourCost} onChange={(e) => setForm({ ...form, labourCost: e.target.value })} /></div>
            <div><label className="label">Parts ($)</label><input type="number" step="0.01" min="0" className="input" value={form.partsCost} onChange={(e) => setForm({ ...form, partsCost: e.target.value })} /></div>
            <div><label className="label">Paint ($)</label><input type="number" step="0.01" min="0" className="input" value={form.paintCost} onChange={(e) => setForm({ ...form, paintCost: e.target.value })} /></div>
            <div><label className="label">Discount ($)</label><input type="number" step="0.01" min="0" className="input" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
            <div className="flex items-end">
              <div className="bg-brand-50 rounded-lg px-4 py-2 w-full">
                <p className="text-xs text-brand-600">Estimated Total (incl. GST)</p>
                <p className="text-lg font-bold text-brand-800">{formatCurrency(previewTotal)}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes for the customer..." />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="label mb-0">Line Items (optional)</label>
              <button type="button" onClick={addItem} className="text-sm text-brand-600 hover:text-brand-800 font-medium">+ Add Item</button>
            </div>
            {form.items.length > 0 && (
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input className="input col-span-5" placeholder="Description" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} />
                    <input type="number" min="0" step="0.01" className="input col-span-2" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                    <input type="number" min="0" step="0.01" className="input col-span-2" placeholder="Unit $" value={item.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                    <select className="input col-span-2" value={item.itemType} onChange={(e) => updateItem(idx, 'itemType', e.target.value)}>
                      <option value="PART">Part</option>
                      <option value="LABOUR">Labour</option>
                      <option value="PAINT">Paint</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <button type="button" onClick={() => removeItem(idx)} className="col-span-1 p-2 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary">{editingId ? 'Save Changes' : 'Create Quotation'}</button>
            <button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3">Number</th>
              <th className="pb-3">Customer</th>
              <th className="pb-3">Contact</th>
              <th className="pb-3">Total</th>
              <th className="pb-3">Status</th>
              <th className="pb-3">Date</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {quotations.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">No quotations yet</td></tr>
            ) : (
              quotations.map((q) => (
                <tr key={q.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-mono">{q.quotationNumber}</td>
                  <td className="py-3 font-medium">{q.customer?.name}</td>
                  <td className="py-3 text-xs text-gray-500">
                    {q.customer?.email && <div>{q.customer.email}</div>}
                    {q.customer?.phone && <div>{q.customer.phone}</div>}
                    {!q.customer?.email && !q.customer?.phone && '—'}
                  </td>
                  <td className="py-3 font-medium">{formatCurrency(Number(q.totalAmount))}</td>
                  <td className="py-3">
                    <span className={`badge ${q.status === 'SENT' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {formatStatus(q.status)}
                    </span>
                  </td>
                  <td className="py-3 text-gray-500">{formatDate(q.createdAt)}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      {canEdit(q.status) && (
                        <button
                          onClick={() => openEdit(q.id)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleSendEmail(q)}
                        disabled={!q.customer?.email || sending === `${q.id}-email`}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40"
                        title="Send via Email"
                      >
                        {sending === `${q.id}-email` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleSendWhatsApp(q)}
                        disabled={!q.customer?.phone || sending === `${q.id}-whatsapp`}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-40"
                        title="Send via WhatsApp"
                      >
                        {sending === `${q.id}-whatsapp` ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
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
