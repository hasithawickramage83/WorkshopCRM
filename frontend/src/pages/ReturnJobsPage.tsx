import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { jobsApi, returnJobsApi } from '../lib/api';
import { formatStatus } from '../lib/types';

type ReturnStatus = 'OPEN' | 'DONE';
type FilterStatus = 'all' | ReturnStatus;

interface JobHit {
  id: string;
  jobNumber: string;
  status: string;
  description?: string | null;
  customer?: { name?: string; phone?: string | null } | null;
  vehicle?: { registrationNo?: string; make?: string; model?: string } | null;
}

interface ReturnJob {
  id: string;
  jobId: string;
  returnedAt: string;
  reason: string;
  notes?: string | null;
  status: ReturnStatus;
  job: JobHit;
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatYmd(value?: string | null) {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

function vehicleLabel(job?: JobHit | null) {
  const vehicle = job?.vehicle;
  if (!vehicle) return '—';
  return [vehicle.registrationNo, vehicle.make, vehicle.model].filter(Boolean).join(' · ');
}

const emptyForm = () => ({
  returnedAt: todayInput(),
  reason: '',
  notes: '',
  status: 'OPEN' as ReturnStatus,
});

export default function ReturnJobsPage() {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ open: 0, done: 0 });
  const [rows, setRows] = useState<ReturnJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [editing, setEditing] = useState<ReturnJob | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [jobQuery, setJobQuery] = useState('');
  const [jobHits, setJobHits] = useState<JobHit[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobHit | null>(null);
  const [searchingJobs, setSearchingJobs] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (filter !== 'all') params.status = filter;
      if (search.trim()) params.search = search.trim();
      const res = await returnJobsApi.list(params);
      const data = res.data.data;
      setRows(data.returns || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setSummary(data.summary || { open: 0, done: 0 });
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to load return jobs',
      );
    } finally {
      setLoading(false);
    }
  }, [filter, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!showForm || editing) return;
    const q = jobQuery.trim();
    if (q.length < 2) {
      setJobHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingJobs(true);
      try {
        const res = await jobsApi.list({ search: q, limit: '8' });
        setJobHits(res.data.data.jobs || []);
      } catch {
        setJobHits([]);
      } finally {
        setSearchingJobs(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [jobQuery, showForm, editing]);

  const openCreate = () => {
    setEditing(null);
    setSelectedJob(null);
    setJobQuery('');
    setJobHits([]);
    setForm(emptyForm());
    setError('');
    setShowForm(true);
  };

  const openEdit = (row: ReturnJob) => {
    setEditing(row);
    setSelectedJob(row.job);
    setForm({
      returnedAt: row.returnedAt,
      reason: row.reason,
      notes: row.notes || '',
      status: row.status,
    });
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setSelectedJob(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing && !selectedJob) {
      setError('Choose the job that came back');
      return;
    }
    if (!form.reason.trim()) {
      setError('Reason is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await returnJobsApi.update(editing.id, {
          returnedAt: form.returnedAt,
          reason: form.reason.trim(),
          notes: form.notes.trim() || null,
          status: form.status,
        });
        setToast('Return job updated');
      } else {
        await returnJobsApi.create({
          jobId: selectedJob!.id,
          returnedAt: form.returnedAt,
          reason: form.reason.trim(),
          notes: form.notes.trim() || null,
        });
        setToast('Return job recorded');
      }
      closeForm();
      setPage(1);
      await load();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to save return job',
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: ReturnJob) => {
    if (!window.confirm(`Remove the return record for ${row.job.jobNumber}?`)) return;
    try {
      await returnJobsApi.delete(row.id);
      setToast('Return record removed');
      await load();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to remove return job',
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Return jobs</h1>
          <p className="text-sm text-gray-500">Jobs that come back to the workshop</p>
        </div>
        <button type="button" className="btn-primary flex items-center gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Record return
        </button>
      </div>

      {toast && <div className="px-4 py-3 rounded-lg text-sm bg-green-50 text-green-800">{toast}</div>}
      {error && !showForm && <div className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button type="button" onClick={() => { setFilter('all'); setPage(1); }} className={`card text-left ${filter === 'all' ? 'ring-2 ring-brand-500' : ''}`}>
          <p className="text-sm text-gray-500">All returns</p>
          <p className="text-2xl font-bold text-gray-900">{summary.open + summary.done}</p>
        </button>
        <button type="button" onClick={() => { setFilter('OPEN'); setPage(1); }} className={`card text-left ${filter === 'OPEN' ? 'ring-2 ring-brand-500' : ''}`}>
          <p className="text-sm text-amber-700">Open</p>
          <p className="text-2xl font-bold text-amber-900">{summary.open}</p>
        </button>
        <button type="button" onClick={() => { setFilter('DONE'); setPage(1); }} className={`card text-left ${filter === 'DONE' ? 'ring-2 ring-brand-500' : ''}`}>
          <p className="text-sm text-green-700">Done</p>
          <p className="text-2xl font-bold text-green-900">{summary.done}</p>
        </button>
      </div>

      <div className="card space-y-3">
        <input
          className="input"
          placeholder="Search job number, customer, rego or reason"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {showForm && (
        <form onSubmit={submit} className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{editing ? `Edit ${editing.job.jobNumber}` : 'Record a return'}</h2>
            <button type="button" onClick={closeForm} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && <div className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700">{error}</div>}
          {!editing && (
            <div>
              <label className="label">Job</label>
              <input
                className="input"
                placeholder="Search job number, customer or rego"
                value={selectedJob ? `${selectedJob.jobNumber} · ${selectedJob.customer?.name || ''} · ${vehicleLabel(selectedJob)}` : jobQuery}
                onChange={(e) => {
                  setSelectedJob(null);
                  setJobQuery(e.target.value);
                }}
              />
              {!selectedJob && (searchingJobs || jobHits.length > 0) && (
                <div className="mt-2 border rounded-lg divide-y max-h-56 overflow-y-auto">
                  {searchingJobs && <p className="p-3 text-sm text-gray-500">Searching...</p>}
                  {jobHits.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      className="w-full text-left p-3 hover:bg-gray-50"
                      onClick={() => { setSelectedJob(job); setJobHits([]); }}
                    >
                      <p className="font-medium text-gray-900">{job.jobNumber} · {job.customer?.name || 'No customer'}</p>
                      <p className="text-sm text-gray-500">{vehicleLabel(job)} · {formatStatus(job.status)}</p>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">A finished or out job is brought back to Received and shown in the workshop again.</p>
            </div>
          )}
          {editing && (
            <p className="text-sm text-gray-600">{editing.job.customer?.name} · {vehicleLabel(editing.job)} · job is {formatStatus(editing.job.status)}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Return date</label>
              <input type="date" className="input" required value={form.returnedAt} onChange={(e) => setForm({ ...form, returnedAt: e.target.value })} />
            </div>
            {editing && (
              <div>
                <label className="label">Return status</label>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ReturnStatus })}>
                  <option value="OPEN">Open</option>
                  <option value="DONE">Done</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="label">Reason</label>
            <input className="input" required placeholder="Why the vehicle came back" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Record return'}</button>
            <button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-3">Return date</th>
              <th className="text-left p-3">Job</th>
              <th className="text-left p-3">Customer</th>
              <th className="text-left p-3">Vehicle</th>
              <th className="text-left p-3">Reason</th>
              <th className="text-left p-3">Job status</th>
              <th className="text-left p-3">Return</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-400">
                  {loading ? 'Loading...' : 'No return jobs yet'}
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3 whitespace-nowrap">{formatYmd(row.returnedAt)}</td>
                <td className="p-3 font-medium">{row.job.jobNumber}</td>
                <td className="p-3">{row.job.customer?.name || '—'}</td>
                <td className="p-3">{vehicleLabel(row.job)}</td>
                <td className="p-3">
                  <p>{row.reason}</p>
                  {row.notes ? <p className="text-xs text-gray-500">{row.notes}</p> : null}
                </td>
                <td className="p-3">{formatStatus(row.job.status)}</td>
                <td className="p-3">
                  <span className={`badge ${row.status === 'DONE' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    {row.status === 'DONE' ? 'Done' : 'Open'}
                  </span>
                </td>
                <td className="p-3 whitespace-nowrap text-right">
                  <button type="button" className="p-2 text-gray-500 hover:bg-gray-100 rounded" aria-label="Edit return" onClick={() => openEdit(row)}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" className="p-2 text-red-500 hover:bg-red-50 rounded" aria-label="Remove return" onClick={() => remove(row)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-3 py-2 border-t text-sm text-gray-500">
          <span>{total} record(s)</span>
          <div className="flex items-center gap-2">
            <button type="button" className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>{page} / {totalPages}</span>
            <button type="button" className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
