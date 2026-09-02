import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { outVehiclesApi } from '../lib/api';
import { formatCurrency, formatDate, formatStatus } from '../lib/types';

type ViewStatus = 'all' | 'out' | 'in';

interface OutJob {
  id: string;
  jobNumber: string;
  status: string;
  jobType?: string;
  receivedDate?: string;
  dueDate?: string | null;
  description?: string | null;
  estimatedPrice?: number | null;
  jobAmount?: number;
  isOut?: boolean;
  outDate?: string | null;
  outInvoiceType?: 'TAX' | 'CASH' | null;
  outInvoiceNumber?: string | null;
  outNotes?: string | null;
  customer?: { id: string; name: string; phone?: string | null };
  vehicle?: {
    id: string;
    registrationNo: string;
    make: string;
    model: string;
    year?: number | null;
    colour?: string | null;
  };
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number;
    paymentStatus: string;
  } | null;
}

interface Summary {
  totalJobs: number;
  totalJobValue: number;
  outCount: number;
  inCount: number;
}

const PAGE_SIZE = 20;

const INVOICE_TYPES = [
  { value: 'TAX', label: 'Tax invoice' },
  { value: 'CASH', label: 'Cash invoice' },
];

function toInputDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export default function OutVehiclesPage() {
  const [view, setView] = useState<ViewStatus>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [jobs, setJobs] = useState<OutJob[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [editing, setEditing] = useState<OutJob | null>(null);
  const [form, setForm] = useState({
    outDate: toInputDate(),
    outInvoiceType: 'TAX',
    outInvoiceNumber: '',
    outNotes: '',
    markCompleted: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {
        status: view,
        page: String(page),
        limit: String(PAGE_SIZE),
      };
      if (from) params.from = from;
      if (to) params.to = to;
      if (search.trim()) params.search = search.trim();
      const res = await outVehiclesApi.list(params);
      const data = res.data.data;
      setJobs(data.jobs || []);
      setSummary(data.summary || null);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to load vehicles',
      );
    } finally {
      setLoading(false);
    }
  }, [view, from, to, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setViewAndReset = (next: ViewStatus) => {
    setView(next);
    setPage(1);
  };

  const openForm = (job: OutJob) => {
    setEditing(job);
    setForm({
      outDate: job.outDate ? job.outDate.slice(0, 10) : toInputDate(),
      outInvoiceType: job.outInvoiceType || 'TAX',
      outInvoiceNumber: job.outInvoiceNumber || job.invoice?.invoiceNumber || '',
      outNotes: job.outNotes || '',
      markCompleted: true,
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError('');
    const payload = {
      outDate: form.outDate,
      outInvoiceType: form.outInvoiceType,
      outInvoiceNumber: form.outInvoiceNumber.trim() || null,
      outNotes: form.outNotes.trim() || null,
      markCompleted: form.markCompleted,
    };
    try {
      if (editing.outDate) {
        await outVehiclesApi.updateOut(editing.id, payload);
        setToast('Out vehicle updated');
      } else {
        await outVehiclesApi.markOut(editing.id, payload);
        setToast('Vehicle marked out');
      }
      setEditing(null);
      load();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to save',
      );
    } finally {
      setSaving(false);
    }
  };

  const clearOut = async () => {
    if (!editing?.outDate) return;
    if (!confirm('Clear out record for this vehicle?')) return;
    setSaving(true);
    try {
      await outVehiclesApi.updateOut(editing.id, { clearOut: true });
      setToast('Out record cleared');
      setEditing(null);
      load();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to clear out record',
      );
    } finally {
      setSaving(false);
    }
  };

  const viewLabel = view === 'out' ? 'Out vehicles' : view === 'in' ? 'In workshop' : 'All jobs';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Out Vehicles</h1>
        <p className="text-sm text-gray-500">
          All jobs load by default. Click Out vehicles to see marked-out records. Green rows are out.
        </p>
      </div>

      {toast && (
        <div className="bg-green-50 text-green-800 border border-green-200 rounded-lg px-4 py-2 text-sm">{toast}</div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2 text-sm">{error}</div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 items-end">
          <div>
            <label className="label">From</label>
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              type="date"
              className="input"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex-1 w-full">
            <label className="label">Search</label>
            <input
              className="input"
              placeholder="Job no, customer, phone, rego, invoice..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setFrom(''); setTo(''); setSearch(''); setView('all'); setPage(1); }}
          >
            Clear filters
          </button>
          <button type="button" className="btn-primary" disabled={loading} onClick={load}>
            {loading ? 'Loading...' : 'Apply'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {view === 'out'
            ? 'Date filter uses out date for marked-out vehicles.'
            : 'Date filter uses job received date. Leave blank to show all jobs.'}
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => setViewAndReset('all')}
            className={`rounded-lg p-4 text-left transition hover:ring-2 hover:ring-blue-300 ${
              view === 'all' ? 'bg-blue-100 ring-2 ring-blue-400' : 'bg-blue-50'
            }`}
          >
            <p className="text-sm text-blue-700">Total jobs</p>
            <p className="text-2xl font-bold text-blue-900">{summary.totalJobs}</p>
          </button>
          <div className="bg-emerald-50 rounded-lg p-4">
            <p className="text-sm text-emerald-700">Total job value</p>
            <p className="text-2xl font-bold text-emerald-900">{formatCurrency(summary.totalJobValue)}</p>
          </div>
          <button
            type="button"
            onClick={() => setViewAndReset('out')}
            className={`rounded-lg p-4 text-left transition hover:ring-2 hover:ring-green-300 ${
              view === 'out' ? 'bg-green-100 ring-2 ring-green-500' : 'bg-green-50'
            }`}
          >
            <p className="text-sm text-green-700">Out vehicles</p>
            <p className="text-2xl font-bold text-green-900">{summary.outCount}</p>
            <p className="text-xs text-green-700 mt-1">Click to view marked-out list</p>
          </button>
          <button
            type="button"
            onClick={() => setViewAndReset('in')}
            className={`rounded-lg p-4 text-left transition hover:ring-2 hover:ring-amber-300 ${
              view === 'in' ? 'bg-amber-100 ring-2 ring-amber-400' : 'bg-amber-50'
            }`}
          >
            <p className="text-sm text-amber-700">Still in workshop</p>
            <p className="text-2xl font-bold text-amber-900">{summary.inCount}</p>
          </button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-gray-50">
          <p className="text-sm font-medium text-gray-700">
            Showing: {viewLabel}
            <span className="text-gray-500 font-normal"> · {total} record(s)</span>
          </p>
          {view !== 'all' && (
            <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setViewAndReset('all')}>
              Show all jobs
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-3">Rego</th>
              <th className="text-left p-3">Vehicle</th>
              <th className="text-left p-3">Customer</th>
              <th className="text-left p-3">Job</th>
              <th className="text-left p-3">Received</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-left p-3">Out date</th>
              <th className="text-left p-3">Invoice</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-gray-400">
                  {loading
                    ? 'Loading...'
                    : view === 'out'
                      ? 'No out vehicles found'
                      : 'No jobs found'}
                </td>
              </tr>
            ) : jobs.map((job) => {
              const isOut = !!(job.isOut || job.outDate);
              return (
                <tr
                  key={job.id}
                  className={`border-t ${isOut ? 'bg-green-50 hover:bg-green-100/70' : 'hover:bg-gray-50'}`}
                >
                  <td className="p-3 font-mono font-medium">{job.vehicle?.registrationNo || '—'}</td>
                  <td className="p-3">
                    {[job.vehicle?.make, job.vehicle?.model, job.vehicle?.colour].filter(Boolean).join(' ') || '—'}
                    {job.vehicle?.year ? <span className="text-xs text-gray-400 block">{job.vehicle.year}</span> : null}
                  </td>
                  <td className="p-3">
                    {job.customer?.name || '—'}
                    {job.customer?.phone ? <span className="block text-xs text-gray-400">{job.customer.phone}</span> : null}
                  </td>
                  <td className="p-3 font-mono">{job.jobNumber}</td>
                  <td className="p-3">{job.receivedDate ? formatDate(job.receivedDate) : '—'}</td>
                  <td className="p-3 text-right font-medium">
                    {(job.jobAmount || 0) > 0 ? formatCurrency(job.jobAmount || 0) : '—'}
                  </td>
                  <td className="p-3">{job.outDate ? formatDate(job.outDate) : '—'}</td>
                  <td className="p-3">
                    {job.outInvoiceType
                      ? (
                        <>
                          <span className="font-medium">
                            {job.outInvoiceType === 'TAX' ? 'Tax' : 'Cash'}
                          </span>
                          {job.outInvoiceNumber ? (
                            <span className="block text-xs font-mono text-gray-600">{job.outInvoiceNumber}</span>
                          ) : null}
                        </>
                      )
                      : '—'}
                  </td>
                  <td className="p-3">
                    <span className={isOut ? 'text-green-800 font-medium' : ''}>
                      {isOut ? 'Out' : formatStatus(job.status)}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-brand-600 hover:underline text-xs"
                      onClick={() => openForm(job)}
                    >
                      {isOut ? 'Edit' : 'Mark out'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 border-t">
          <p className="text-xs text-gray-500">
            Page {page} of {totalPages} · {PAGE_SIZE} per page
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-40"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button
              type="button"
              className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-40"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-start gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {editing.outDate ? 'Edit out vehicle' : 'Mark vehicle out'}
                </h2>
                <p className="text-xs text-gray-500">
                  {[editing.vehicle?.registrationNo, editing.customer?.name, editing.jobNumber].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Amount {(editing.jobAmount || 0) > 0 ? formatCurrency(editing.jobAmount || 0) : '—'}
                </p>
                {editing.invoice && (
                  <p className="text-xs text-gray-500 mt-1">
                    Linked invoice {editing.invoice.invoiceNumber} · {formatCurrency(editing.invoice.total)} · {formatStatus(editing.invoice.paymentStatus)}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setEditing(null)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Out date *</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={form.outDate}
                  onChange={(e) => setForm({ ...form, outDate: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Invoice type *</label>
                <select
                  className="input"
                  required
                  value={form.outInvoiceType}
                  onChange={(e) => setForm({ ...form, outInvoiceType: e.target.value })}
                >
                  {INVOICE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Invoice number</label>
              <input
                className="input"
                placeholder="Tax / cash invoice number"
                value={form.outInvoiceNumber}
                onChange={(e) => setForm({ ...form, outInvoiceNumber: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea
                className="input"
                rows={2}
                value={form.outNotes}
                onChange={(e) => setForm({ ...form, outNotes: e.target.value })}
              />
            </div>

            {!editing.outDate && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={form.markCompleted}
                  onChange={(e) => setForm({ ...form, markCompleted: e.target.checked })}
                />
                Mark job as completed
              </label>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <div>
                {editing.outDate && (
                  <button type="button" className="text-red-600 text-sm hover:underline" disabled={saving} onClick={clearOut}>
                    Clear out record
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editing.outDate ? 'Update' : 'Mark out'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
