import { useEffect, useMemo, useState } from 'react';
import { GripVertical, Loader2, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { winzQuotesApi } from '../lib/api';
import { WINZ_QUOTE, formatCurrency, formatDate } from '../lib/types';

type ItemKind = 'HEADING' | 'ITEM';

interface QuoteItem {
  key: string;
  id?: string;
  kind: ItemKind;
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
}

interface WinzQuote {
  id: string;
  quoteNumber: string;
  customerName: string;
  vehicleRego: string;
  quoteDate: string;
  expiryDate: string;
  notes?: string | null;
  subtotal: number;
  gst: number;
  totalAmount: number;
  items: QuoteItem[];
  createdAt: string;
}

const HEADING_PRESETS = [
  'Remove and Refitting',
  'Repairing',
  'Removing/Refitting/Cleaning',
  'Painting',
  'Parts',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number);
  const next = new Date(year, month - 1, day + days);
  return localDateStr(next);
}

function money(value: number) {
  return value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function emptyItem(kind: ItemKind = 'ITEM', description = ''): QuoteItem {
  return { key: crypto.randomUUID(), kind, description, quantity: kind === 'ITEM' ? 1 : 0, unitPrice: 0 };
}

const emptyForm = () => {
  const quoteDate = localDateStr();
  return {
    customerName: '',
    vehicleRego: '',
    quoteDate,
    expiryDate: addDays(quoteDate, 6),
    notes: '',
    items: [emptyItem('HEADING', 'Remove and Refitting'), emptyItem('ITEM')],
  };
};

function calcTotals(items: QuoteItem[]) {
  const subtotal = items
    .filter((item) => item.kind === 'ITEM')
    .reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const gst = Math.round(subtotal * 0.15 * 100) / 100;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    gst,
    total: Math.round((subtotal + gst) * 100) / 100,
  };
}

function WinzQuoteSheet({
  quoteNumber,
  customerName,
  vehicleRego,
  quoteDate,
  expiryDate,
  items,
  notes,
}: {
  quoteNumber: string;
  customerName: string;
  vehicleRego: string;
  quoteDate: string;
  expiryDate: string;
  items: QuoteItem[];
  notes?: string;
}) {
  const totals = calcTotals(items);
  return (
    <div className="winz-sheet">
      <div className="winz-top">
        <div>
          <p className="winz-brand">WEST PANEL,</p>
          <p className="winz-brand">PAINT &amp; TYRES</p>
          <p className="winz-services">{WINZ_QUOTE.services}</p>
          <p className="winz-contact">Phone: {WINZ_QUOTE.phone} · {WINZ_QUOTE.phone2}</p>
          <p className="winz-contact">Email: {WINZ_QUOTE.email}</p>
          <p className="winz-contact">{WINZ_QUOTE.email2}</p>
        </div>
        <div className="winz-title-block">
          <p className="winz-title">QUOTE</p>
          <p className="winz-gst">GST NO: {WINZ_QUOTE.gstNumber}</p>
        </div>
      </div>

      <div className="winz-meta">
        <div>
          <div className="winz-meta-row"><span>Customer Name</span><strong>{customerName || '—'}</strong></div>
          <div className="winz-meta-row"><span>Vehicle Rego</span><strong>{vehicleRego || '—'}</strong></div>
        </div>
        <div>
          <div className="winz-meta-row"><span>Date</span><strong>{quoteDate ? formatDate(quoteDate) : '—'}</strong></div>
          <div className="winz-meta-row"><span>Expiry Date</span><strong>{expiryDate ? formatDate(expiryDate) : '—'}</strong></div>
        </div>
        <div className="winz-quote-no">
          <span>Quote Number</span>
          <strong>{quoteNumber || 'QU-XXXX'}</strong>
        </div>
      </div>

      <table className="winz-table">
        <thead>
          <tr>
            <th>DESCRIPTION</th>
            <th>QTY</th>
            <th>UNIT PRICE</th>
            <th>AMOUNT NZD</th>
          </tr>
        </thead>
        <tbody>
          {items.filter((item) => item.description.trim()).map((item, index) => (
            item.kind === 'HEADING' ? (
              <tr key={index} className="winz-heading-row">
                <td colSpan={4}>{item.description}</td>
              </tr>
            ) : (
              <tr key={index}>
                <td>{item.description}</td>
                <td>{item.quantity || ''}</td>
                <td>{item.unitPrice ? money(Number(item.unitPrice)) : ''}</td>
                <td>{money((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</td>
              </tr>
            )
          ))}
        </tbody>
      </table>

      <div className="winz-bottom">
        <div className="winz-footer-left">
          <p><strong>Winz Registration Number:</strong> {WINZ_QUOTE.winzReg}</p>
          <p>GST NO: {WINZ_QUOTE.gstNumber}</p>
          <p>Phone: {WINZ_QUOTE.phone} · {WINZ_QUOTE.phone2}</p>
          <p>Email: {WINZ_QUOTE.email}</p>
          <p>Email: {WINZ_QUOTE.email2}</p>
          <p>Address: {WINZ_QUOTE.address}</p>
          <div className="winz-bank">
            <p><strong>Bank Name:</strong> {WINZ_QUOTE.bankName}</p>
            <p><strong>Account Name:</strong> {WINZ_QUOTE.bankAccountName}</p>
            <p><strong>Account Number:</strong> {WINZ_QUOTE.bankAccountNumber}</p>
          </div>
          <p className="winz-terms"><strong>Terms:</strong> {WINZ_QUOTE.terms}</p>
          {notes ? <p className="winz-notes">{notes}</p> : null}
        </div>
        <div className="winz-totals">
          <div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div>
          <div><span>GST 15%</span><strong>{money(totals.gst)}</strong></div>
          <div className="winz-total"><span>Total</span><strong>{money(totals.total)}</strong></div>
        </div>
      </div>
    </div>
  );
}

export default function WinzQuotesPage() {
  const [quotes, setQuotes] = useState<WinzQuote[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [printQuote, setPrintQuote] = useState<WinzQuote | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const load = async (q = search) => {
    const res = await winzQuotesApi.list({ search: q, limit: '100' });
    setQuotes(res.data.data.quotes);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const totals = useMemo(() => calcTotals(form.items), [form.items]);

  const openCreate = () => {
    setEditingId(null);
    setQuoteNumber('');
    setForm(emptyForm());
    setPrintQuote(null);
    setShowForm(true);
  };

  const openEdit = async (id: string) => {
    const res = await winzQuotesApi.get(id);
    const quote = res.data.data as WinzQuote;
    setEditingId(id);
    setQuoteNumber(quote.quoteNumber);
    setForm({
      customerName: quote.customerName,
      vehicleRego: quote.vehicleRego,
      quoteDate: quote.quoteDate,
      expiryDate: quote.expiryDate,
      notes: quote.notes || '',
      items: quote.items.map((item) => ({
        key: item.id || crypto.randomUUID(),
        kind: item.kind === 'HEADING' ? 'HEADING' : 'ITEM',
        description: item.description,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
      })),
    });
    setPrintQuote(quote);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setPrintQuote(null);
    setForm(emptyForm());
  };

  const updateItem = (index: number, patch: Partial<QuoteItem>) => {
    const items = [...form.items];
    items[index] = { ...items[index], ...patch };
    if (patch.kind === 'HEADING') {
      items[index].quantity = 0;
      items[index].unitPrice = 0;
    }
    setForm({ ...form, items });
  };

  const reorderItems = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= form.items.length) return;
    const items = [...form.items];
    const [row] = items.splice(from, 1);
    items.splice(to, 0, row);
    setForm({ ...form, items });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = form.items
      .filter((item) => item.description.trim())
      .map((item) => ({
        kind: item.kind,
        description: item.description.trim(),
        quantity: item.kind === 'HEADING' ? 0 : Number(item.quantity) || 0,
        unitPrice: item.kind === 'HEADING' ? 0 : Number(item.unitPrice) || 0,
      }));
    setSaving(true);
    try {
      const payload = { ...form, items };
      const res = editingId
        ? await winzQuotesApi.update(editingId, payload)
        : await winzQuotesApi.create(payload);
      const saved = res.data.data as WinzQuote;
      setEditingId(saved.id);
      setQuoteNumber(saved.quoteNumber);
      setPrintQuote(saved);
      setToast({ type: 'success', message: editingId ? 'WINZ quote updated' : `Quote ${saved.quoteNumber} created` });
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setToast({ type: 'error', message: msg || 'Failed to save WINZ quote' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (quote: WinzQuote) => {
    if (!window.confirm(`Delete ${quote.quoteNumber}?`)) return;
    try {
      await winzQuotesApi.delete(quote.id);
      if (editingId === quote.id) closeForm();
      setToast({ type: 'success', message: 'WINZ quote deleted' });
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setToast({ type: 'error', message: msg || 'Failed to delete quote' });
    }
  };

  const handlePrint = (quote?: WinzQuote | null) => {
    if (quote) setPrintQuote(quote);
    window.setTimeout(() => {
      const el = document.getElementById('winz-quote-print');
      if (!el) return;
      const clone = el.cloneNode(true) as HTMLElement;
      clone.id = 'winz-quote-print-clone';
      clone.classList.remove('hidden');
      document.body.appendChild(clone);
      document.body.classList.add('winz-quote-print-mode');
      const cleanup = () => {
        document.body.classList.remove('winz-quote-print-mode');
        clone.remove();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      window.print();
    }, 80);
  };

  const previewItems = form.items;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WINZ quotes</h1>
          <p className="text-sm text-gray-500">Create quotations in the West Panel / WINZ format</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New WINZ quote
        </button>
      </div>

      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {toast.message}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-gray-900">{editingId ? `Edit ${quoteNumber}` : 'New WINZ quote'}</h2>
            <button type="button" onClick={closeForm} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Customer name</label>
              <input className="input" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            </div>
            <div>
              <label className="label">Vehicle rego</label>
              <input className="input" required value={form.vehicleRego} onChange={(e) => setForm({ ...form, vehicleRego: e.target.value })} />
            </div>
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                required
                value={form.quoteDate}
                onChange={(e) => setForm({ ...form, quoteDate: e.target.value, expiryDate: addDays(e.target.value, 6) })}
              />
            </div>
            <div>
              <label className="label">Expiry date</label>
              <input type="date" className="input" required value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
              <div>
                <label className="label mb-0">Line items</label>
                <p className="text-xs text-gray-500">Drag a row to move headings and line items</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="text-sm text-brand-600 font-medium" onClick={() => setForm({ ...form, items: [...form.items, emptyItem('HEADING')] })}>
                  + Add heading
                </button>
                <button type="button" className="text-sm text-brand-600 font-medium" onClick={() => setForm({ ...form, items: [...form.items, emptyItem('ITEM')] })}>
                  + Add row
                </button>
              </div>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
              <span className="col-span-1">Drag</span>
              <span className="col-span-2">Type</span>
              <span className="col-span-3">Description</span>
              <span className="col-span-1">Qty</span>
              <span className="col-span-2">Unit price</span>
              <span className="col-span-2">Amount</span>
            </div>
            <div className="space-y-2">
              {form.items.map((item, index) => (
                <div
                  key={item.key}
                  data-quote-row
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOver !== index) setDragOver(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData('text/plain'));
                    if (!Number.isNaN(from)) reorderItems(from, index);
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  className={`grid grid-cols-12 gap-2 items-center rounded-lg ${dragFrom === index ? 'opacity-40' : ''} ${dragOver === index && dragFrom !== index ? 'ring-2 ring-brand-400' : ''}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                    draggable
                    onDragStart={(e) => {
                      setDragFrom(index);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(index));
                      const row = e.currentTarget.closest('[data-quote-row]');
                      if (row) e.dataTransfer.setDragImage(row, 16, 16);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    className="col-span-2 md:col-span-1 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 touch-none"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <select
                    className="input col-span-8 md:col-span-2"
                    value={item.kind}
                    onChange={(e) => updateItem(index, { kind: e.target.value as ItemKind })}
                  >
                    <option value="ITEM">Item</option>
                    <option value="HEADING">Heading</option>
                  </select>
                  <button type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })} className="col-span-2 md:col-span-1 md:order-last p-2 text-red-500 hover:bg-red-50 rounded justify-self-end" aria-label="Remove row">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {item.kind === 'HEADING' ? (
                    <input
                      className="input col-span-12 md:col-span-8"
                      list="winz-headings"
                      placeholder="Section heading"
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                    />
                  ) : (
                    <>
                      <input
                        className="input col-span-12 md:col-span-3"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(index, { description: e.target.value })}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input col-span-4 md:col-span-1"
                        placeholder="Qty"
                        aria-label="Qty"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: parseFloat(e.target.value) || 0 })}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input col-span-4 md:col-span-2"
                        placeholder="Unit $"
                        aria-label="Unit price"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                      />
                      <div className="col-span-4 md:col-span-2 input bg-gray-50 font-semibold text-gray-900 flex items-center tabular-nums" aria-label="Amount">
                        {formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <datalist id="winz-headings">
              {HEADING_PRESETS.map((heading) => <option key={heading} value={heading} />)}
            </datalist>
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="bg-brand-50 rounded-lg px-4 py-2">
              <p className="text-xs text-brand-600">Subtotal {formatCurrency(totals.subtotal)} · GST {formatCurrency(totals.gst)}</p>
              <p className="text-lg font-bold text-brand-800">{formatCurrency(totals.total)}</p>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? 'Save changes' : 'Create quote'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => handlePrint(printQuote)}>
                <Printer className="w-4 h-4 inline mr-1" /> Print
              </button>
              <button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button>
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-gray-50 overflow-x-auto">
            <p className="text-xs text-gray-500 mb-2">Preview — header, bank, WINZ registration and GST stay fixed</p>
            <div className="min-w-[720px]">
            <WinzQuoteSheet
              quoteNumber={quoteNumber}
              customerName={form.customerName}
              vehicleRego={form.vehicleRego}
              quoteDate={form.quoteDate}
              expiryDate={form.expiryDate}
              items={previewItems}
              notes={form.notes}
            />
            </div>
          </div>
        </form>
      )}

      <div className="card mb-4">
        <input
          className="input max-w-md"
          placeholder="Search quote number, customer or rego"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(search); }}
        />
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3">Number</th>
                <th className="pb-3">Customer</th>
                <th className="pb-3">Vehicle</th>
                <th className="pb-3">Date</th>
                <th className="pb-3">Total</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-400">No WINZ quotes yet</td></tr>
              ) : quotes.map((quote) => (
                <tr key={quote.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-mono">{quote.quoteNumber}</td>
                  <td className="py-3 font-medium">{quote.customerName}</td>
                  <td className="py-3">{quote.vehicleRego}</td>
                  <td className="py-3 text-gray-500">{formatDate(quote.quoteDate)}</td>
                  <td className="py-3 font-medium">{formatCurrency(Number(quote.totalAmount))}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(quote.id)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handlePrint(quote)} className="p-2 text-brand-600 hover:bg-brand-50 rounded-lg" title="Print">
                        <Printer className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(quote)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div id="winz-quote-print" className="hidden">
        <WinzQuoteSheet
          quoteNumber={printQuote?.quoteNumber || quoteNumber}
          customerName={printQuote?.customerName || form.customerName}
          vehicleRego={printQuote?.vehicleRego || form.vehicleRego}
          quoteDate={printQuote?.quoteDate || form.quoteDate}
          expiryDate={printQuote?.expiryDate || form.expiryDate}
          items={printQuote?.items || form.items}
          notes={printQuote?.notes || form.notes}
        />
      </div>
    </div>
  );
}
