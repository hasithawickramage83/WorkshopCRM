import { useEffect, useState, useCallback } from 'react';
import { Plus, History, ChevronDown, ChevronUp, X, Pencil, Eye, Link2, Trash2, Search, FileText, Printer, Loader2 } from 'lucide-react';
import { jobsApi, customersApi, vehiclesApi, authApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import JobCardPrintTemplate, { JobCardData } from '../components/JobCardPrintTemplate';
import {
  Job, Customer, formatDate, formatStatus, formatCurrency, formatCompany, formatJobType, formatJobCategory, formatSubTaskType, jobPriceSummary, jobShouldAddGst,
  BUSINESS_COMPANIES, JOB_TYPES, JOB_CATEGORIES, JOB_SOURCES, JOB_SUB_TASK_TYPES, JOB_STATUS_COLORS, JOB_PRIORITY_COLORS, JOB_TYPE_COLORS,
} from '../lib/types';

interface SubTaskForm {
  taskType: string;
  description: string;
  price: string;
}

interface JobSubTask {
  id?: string;
  taskType: string;
  description: string;
  price?: number | string | null;
}

interface Vehicle { id: string; registrationNo: string; make: string; model: string; ownerId: string; }

interface Technician { id: string; firstName: string; lastName: string; role?: { name: string }; }

interface StatusHistoryItem {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  notes: string | null;
  createdAt: string;
  changedBy?: { firstName: string; lastName: string };
}

interface JobDetail extends Job {
  statusHistory?: StatusHistoryItem[];
  jobCategory?: string | null;
  addGst?: boolean;
  subTasks?: JobSubTask[];
  customer?: { id?: string; name: string; phone?: string; email?: string };
  vehicle?: { id?: string; registrationNo: string; make: string; model: string; colour?: string };
}

const JOB_STATUSES = [
  'RECEIVED', 'INSPECTION', 'QUOTED', 'AWAITING_APPROVAL', 'APPROVED', 'PARTS_ORDERED',
  'IN_PROGRESS', 'PANEL_BEATING', 'PAINTING', 'QUALITY_CHECK', 'READY_FOR_DELIVERY',
  'COMPLETED', 'INVOICED', 'CLOSED',
];

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Pending / Active' },
  { value: 'DONE', label: 'Completed / Closed' },
  ...JOB_STATUSES.map((s) => ({ value: s, label: formatStatus(s) })),
];

const emptyForm = {
  customerId: '', vehicleId: '', jobSource: 'WALK_IN', company: 'CEYLON_AUTOMOBILE', jobType: 'OTHER',
  jobCategory: '', description: '', internalNotes: '', dueDate: '', assignedTechnicianId: '', priority: 'NORMAL', estimatedPrice: '', addGst: false,
};

const emptySubTask = (): SubTaskForm => ({ taskType: 'OTHER', description: '', price: '' });

const REGISTRATION_BASE = `${window.location.origin}/register`;

function toDateInput(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 10);
}

function dealerDisplayName(c: Customer) {
  return (c.companyName?.trim() || c.name || c.customerCode).trim();
}

function registrationLinkForDealer(code?: string) {
  if (!code) return REGISTRATION_BASE;
  return `${REGISTRATION_BASE}?dealer=${encodeURIComponent(code)}`;
}

export default function JobsPage() {
  const { user } = useAuth();
  const canDelete = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [subTasks, setSubTasks] = useState<SubTaskForm[]>([emptySubTask()]);
  const [toast, setToast] = useState('');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<Record<string, JobDetail>>({});
  const [statusModal, setStatusModal] = useState<{ jobId: string; currentStatus: string; newStatus: string } | null>(null);
  const [remark, setRemark] = useState('');
  const [statusError, setStatusError] = useState('');
  const [deleteJob, setDeleteJob] = useState<Job | null>(null);
  const [deleteRemarks, setDeleteRemarks] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [jobTotal, setJobTotal] = useState(0);
  const [jobCard, setJobCard] = useState<JobCardData | null>(null);
  const [loadingJobCardId, setLoadingJobCardId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareDealerCode, setShareDealerCode] = useState('');

  const load = useCallback(() => {
    const params: Record<string, string> = { limit: '500' };
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;
    return jobsApi.list(params).then((res) => {
      setJobs(res.data.data.jobs);
      setJobTotal(res.data.data.total ?? res.data.data.jobs.length);
    });
  }, [search, statusFilter]);

  useEffect(() => {
    load();
    customersApi.list({ limit: '200' }).then((res) => setCustomers(res.data.data.customers));
    vehiclesApi.list({ limit: '200' }).then((res) => setVehicles(res.data.data.vehicles));
    authApi.listUsers()
      .then((res) => {
        const users = res.data.data as Technician[];
        setTechnicians(users.filter((u) => u.role?.name === 'TECHNICIAN' || u.role?.name === 'ASSESSOR'));
      })
      .catch(() => setTechnicians([]));
  }, [load]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setSubTasks([emptySubTask()]);
    setShowForm(true);
  };

  const openEdit = async (job: Job) => {
    const detail = await fetchJobDetail(job.id);
    setEditingId(job.id);
    setForm({
      customerId: detail.customerId || detail.customer?.id || '',
      vehicleId: detail.vehicleId || detail.vehicle?.id || '',
      jobSource: detail.jobSource || 'WALK_IN',
      company: detail.company || 'CEYLON_AUTOMOBILE',
      jobType: detail.jobType || 'OTHER',
      jobCategory: detail.jobCategory || '',
      description: detail.description || '',
      internalNotes: detail.internalNotes || '',
      dueDate: toDateInput(detail.dueDate),
      assignedTechnicianId: detail.assignedTechnicianId || detail.assignedTechnician?.id || '',
      priority: detail.priority || 'NORMAL',
      estimatedPrice: detail.estimatedPrice != null ? String(detail.estimatedPrice) : '',
      addGst: detail.addGst ?? false,
    });
    setSubTasks(
      detail.subTasks?.length
        ? detail.subTasks.map((t) => ({
            taskType: t.taskType,
            description: t.description,
            price: t.price != null ? String(t.price) : '',
          }))
        : [emptySubTask()],
    );
    setShowForm(true);
  };

  const fetchJobDetail = async (jobId: string) => {
    if (jobDetails[jobId]) return jobDetails[jobId];
    const res = await jobsApi.get(jobId);
    const detail = res.data.data as JobDetail;
    setJobDetails((prev) => ({ ...prev, [jobId]: detail }));
    return detail;
  };

  const openDetail = async (jobId: string) => {
    setDetailJobId(jobId);
    await fetchJobDetail(jobId);
  };

  const openJobCard = async (jobId: string) => {
    setLoadingJobCardId(jobId);
    try {
      const detail = await fetchJobDetail(jobId);
      setJobCard(detail as JobCardData);
    } catch {
      setToast('Failed to load job card');
    } finally {
      setLoadingJobCardId(null);
    }
  };

  const printJobCard = () => {
    const el = document.getElementById('job-card-print');
    if (!el) return;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.id = 'invoice-print-clone';
    document.body.appendChild(clone);
    document.body.classList.add('invoice-print-mode');
    const cleanup = () => {
      document.body.classList.remove('invoice-print-mode');
      clone.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validSubTasks = subTasks
      .filter((t) => t.description.trim())
      .map((t) => ({
        taskType: t.taskType,
        description: t.description.trim(),
        price: t.price ? parseFloat(t.price) : null,
      }));
    const payload = {
      customerId: form.customerId,
      vehicleId: form.vehicleId,
      jobSource: form.jobSource,
      company: form.company,
      jobType: form.jobType,
      jobCategory: form.jobCategory || null,
      description: form.description || undefined,
      internalNotes: form.internalNotes || undefined,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      assignedTechnicianId: form.assignedTechnicianId || null,
      priority: form.priority,
      estimatedPrice: form.estimatedPrice ? parseFloat(form.estimatedPrice) : null,
      addGst: form.addGst,
      subTasks: validSubTasks.length ? validSubTasks : undefined,
    };
    try {
      if (editingId) {
        await jobsApi.update(editingId, payload);
        setToast('Job updated');
        if (jobDetails[editingId]) await fetchJobDetail(editingId);
      } else {
        await jobsApi.create(payload);
        setToast('Job created');
      }
      setShowForm(false);
      load();
    } catch {
      setToast('Failed to save job');
    }
  };

  const handlePriorityChange = async (job: Job, priority: string) => {
    if (job.priority === priority) return;
    try {
      await jobsApi.update(job.id, { priority });
      load();
    } catch {
      setToast('Failed to update priority');
    }
  };

  const handleJobTypeChange = async (job: Job, jobType: string) => {
    if (job.jobType === jobType) return;
    try {
      await jobsApi.update(job.id, { jobType });
      load();
    } catch {
      setToast('Failed to update job type');
    }
  };

  const openStatusModal = (jobId: string, currentStatus: string, newStatus: string) => {
    if (currentStatus === newStatus) return;
    setStatusModal({ jobId, currentStatus, newStatus });
    setRemark('');
    setStatusError('');
  };

  const submitStatusChange = async () => {
    if (!statusModal || !remark.trim()) {
      setStatusError('Please enter a remark for this status change');
      return;
    }
    try {
      await jobsApi.updateStatus(statusModal.jobId, statusModal.newStatus, remark.trim());
      setStatusModal(null);
      setRemark('');
      load();
      if (expandedJobId === statusModal.jobId || detailJobId === statusModal.jobId) {
        await fetchJobDetail(statusModal.jobId);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setStatusError(msg || 'Failed to update status');
    }
  };

  const toggleHistory = async (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(jobId);
    await fetchJobDetail(jobId);
  };

  const openDeleteModal = (job: Job) => {
    setDeleteJob(job);
    setDeleteRemarks('');
    setDeleteError('');
  };

  const handleSoftDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteJob) return;
    const remarks = deleteRemarks.trim();
    if (!remarks) {
      setDeleteError('Remarks are required');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await jobsApi.delete(deleteJob.id, remarks);
      setToast(`Job ${deleteJob.jobNumber} deleted`);
      if (detailJobId === deleteJob.id) setDetailJobId(null);
      if (expandedJobId === deleteJob.id) setExpandedJobId(null);
      setDeleteJob(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setDeleteError(msg || 'Failed to delete job');
    } finally {
      setDeleting(false);
    }
  };

  const dealerCustomers = customers
    .filter((c) => c.customerType === 'DEALER')
    .slice()
    .sort((a, b) => dealerDisplayName(a).localeCompare(dealerDisplayName(b)));

  const copyRegistrationLink = async (dealerCode?: string) => {
    const link = registrationLinkForDealer(dealerCode);
    try {
      await navigator.clipboard.writeText(link);
      setToast(dealerCode
        ? `Dealer registration link copied (${dealerCode})`
        : 'Registration link copied to clipboard');
      setShowShareModal(false);
    } catch {
      setToast(link);
    }
  };

  const filteredVehicles = form.customerId
    ? vehicles.filter((v) => v.ownerId === form.customerId)
    : vehicles;

  const detailJob = detailJobId ? jobDetails[detailJobId] : null;

  const formSubTasks = subTasks
    .filter((t) => t.description.trim())
    .map((t) => ({ price: t.price ? parseFloat(t.price) : 0 }));
  const formAddGst = form.addGst;
  const formPriceSummary = jobPriceSummary(
    formSubTasks.length ? formSubTasks : undefined,
    form.estimatedPrice ? parseFloat(form.estimatedPrice) : null,
    formAddGst,
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Workshop Jobs</h1>
          <p className="text-gray-500">Track jobs by type, priority, pricing — click a job for full details</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setShareDealerCode(''); setShowShareModal(true); }}
            className="btn-secondary flex items-center gap-2"
          >
            <Link2 className="w-4 h-4" /> Share Form
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Job
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="card">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              className="input pl-9"
              placeholder="Search job no, customer, phone, rego..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input md:w-56"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-400 mt-2">{jobTotal} job{jobTotal !== 1 ? 's' : ''} found</p>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h3 className="font-semibold">{editingId ? 'Edit Job' : 'Create Job'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Customer *</label>
              <select className="input" required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value, vehicleId: '' })}>
                <option value="">Select</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Vehicle *</label>
              <select className="input" required value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                <option value="">Select</option>
                {filteredVehicles.map((v) => <option key={v.id} value={v.id}>{v.registrationNo} - {v.make} {v.model}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Company *</label>
              <select className="input" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}>
                {BUSINESS_COMPANIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Job Type *</label>
              <select className="input" required value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value })}>
                {JOB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Job Source</label>
              <select className="input" value={form.jobSource} onChange={(e) => setForm({ ...form, jobSource: e.target.value })}>
                {JOB_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Job Category</label>
              <select
                className="input"
                value={form.jobCategory}
                onChange={(e) => {
                  const jobCategory = e.target.value;
                  setForm({
                    ...form,
                    jobCategory,
                    // Default GST on for new dealer selection, but keep it editable
                    addGst: jobCategory === 'DEALER' ? true : form.addGst,
                  });
                }}
              >
                <option value="">Not set</option>
                {JOB_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{formatStatus(p)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Estimated Price (NZD)</label>
              <input type="number" min="0" step="0.01" className="input" placeholder="0.00" value={form.estimatedPrice} onChange={(e) => setForm({ ...form, estimatedPrice: e.target.value })} />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            {technicians.length > 0 && (
              <div>
                <label className="label">Assigned Technician</label>
                <select className="input" value={form.assignedTechnicianId} onChange={(e) => setForm({ ...form, assignedTechnicianId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {technicians.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
                </select>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Internal Notes</label>
              <textarea className="input" rows={2} value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} />
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Sub Tasks</h4>
              <button type="button" className="btn-secondary text-sm flex items-center gap-1" onClick={() => setSubTasks((prev) => [...prev, emptySubTask()])}>
                <Plus className="w-4 h-4" /> Add Sub Task
              </button>
            </div>
            {subTasks.map((task, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-gray-50 border rounded-lg p-3">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={task.taskType} onChange={(e) => setSubTasks((prev) => prev.map((t, i) => i === index ? { ...t, taskType: e.target.value } : t))}>
                    {JOB_SUB_TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Price (NZD)</label>
                  <input type="number" min="0" step="0.01" className="input" value={task.price} onChange={(e) => setSubTasks((prev) => prev.map((t, i) => i === index ? { ...t, price: e.target.value } : t))} />
                </div>
                <div className="md:col-span-2 flex gap-2">
                  <div className="flex-1">
                    <label className="label">Description</label>
                    <input className="input" value={task.description} onChange={(e) => setSubTasks((prev) => prev.map((t, i) => i === index ? { ...t, description: e.target.value } : t))} />
                  </div>
                  {subTasks.length > 1 && (
                    <button type="button" className="self-end text-red-600 p-2" onClick={() => setSubTasks((prev) => prev.filter((_, i) => i !== index))}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {formPriceSummary.entered > 0 && (
              <div className="bg-brand-50 border border-brand-100 rounded-lg p-3 text-sm space-y-2">
                <label className="flex items-center gap-2 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formAddGst}
                    onChange={(e) => setForm({ ...form, addGst: e.target.checked })}
                    className="rounded"
                  />
                  Add GST (15%) to total
                </label>
                <p className="text-brand-800">
                  Subtotal: <strong>{formatCurrency(formPriceSummary.subtotal)}</strong>
                  {formAddGst && <> · GST: <strong>{formatCurrency(formPriceSummary.gst)}</strong></>}
                  {' · '}Total: <strong>{formatCurrency(formPriceSummary.total)}</strong>
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary">{editingId ? 'Update Job' : 'Create Job'}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {jobs.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">No jobs match your search or filter</div>
        ) : jobs.map((job, index) => {
          const listAddGst = jobShouldAddGst(job);
          const listPrice = jobPriceSummary(
            (job as Job & { subTasks?: JobSubTask[] }).subTasks,
            job.estimatedPrice,
            listAddGst,
          );
          return (
          <div key={job.id} className="card hover:shadow-md transition-shadow">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => openDetail(job.id)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-gray-100 text-gray-700 text-sm font-semibold">
                    {index + 1}
                  </span>
                  <span className="font-mono font-medium">{job.jobNumber}</span>
                  <span className={`badge ${JOB_TYPE_COLORS[job.jobType || 'OTHER']}`}>{formatJobType(job.jobType)}</span>
                  {job.jobCategory && (
                    <span className="badge bg-teal-100 text-teal-800">{formatJobCategory(job.jobCategory)}</span>
                  )}
                  <span className={`badge ${JOB_STATUS_COLORS[job.status]}`}>{formatStatus(job.status)}</span>
                  <span className="badge bg-brand-50 text-brand-800">{formatCompany(job.company)}</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xl font-bold text-brand-700">
                    {listPrice.entered > 0 ? formatCurrency(listPrice.total) : 'No price set'}
                  </span>
                  {listAddGst && listPrice.entered > 0 && (
                    <span className="text-xs text-gray-500">incl. GST {formatCurrency(listPrice.gst)}</span>
                  )}
                  <span className={`badge ${JOB_PRIORITY_COLORS[job.priority || 'NORMAL']}`}>{formatStatus(job.priority || 'NORMAL')}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">{job.customer?.name}</span>
                  {job.customer?.phone && <span> · {job.customer.phone}</span>}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-mono font-medium">{job.vehicle?.registrationNo || 'No rego'}</span>
                  {job.vehicle && (
                    <span> · {job.vehicle.make} {job.vehicle.model}</span>
                  )}
                </p>
                {job.description && <p className="text-sm text-gray-500 mt-1 line-clamp-1">{job.description}</p>}
                <p className="text-xs text-brand-600 mt-1 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Click for full details
                </p>
              </button>
              <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto flex-wrap" onClick={(e) => e.stopPropagation()}>
                <select
                  className="input text-sm lg:w-40"
                  value={job.jobType || 'OTHER'}
                  onChange={(e) => handleJobTypeChange(job, e.target.value)}
                  title="Job Type"
                >
                  {JOB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select
                  className="input text-sm lg:w-32"
                  value={job.priority || 'NORMAL'}
                  onChange={(e) => handlePriorityChange(job, e.target.value)}
                  title="Priority"
                >
                  {PRIORITIES.map((p) => <option key={p} value={p}>{formatStatus(p)}</option>)}
                </select>
                <select
                  className="input text-sm lg:w-48"
                  value={job.status}
                  onChange={(e) => openStatusModal(job.id, job.status, e.target.value)}
                >
                  {JOB_STATUSES.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
                </select>
                <button onClick={() => openEdit(job)} className="btn-secondary flex items-center justify-center gap-2 text-sm">
                  <Pencil className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={() => openJobCard(job.id)}
                  disabled={loadingJobCardId === job.id}
                  className="btn-secondary flex items-center justify-center gap-2 text-sm"
                  title="Generate job card"
                >
                  {loadingJobCardId === job.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  Job Card
                </button>
                {canDelete && (
                  <button
                    onClick={() => openDeleteModal(job)}
                    className="btn-secondary flex items-center justify-center gap-2 text-sm text-red-600 hover:bg-red-50 border-red-200"
                    title="Soft delete job"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                )}
                <button
                  onClick={() => toggleHistory(job.id)}
                  className="btn-secondary flex items-center justify-center gap-2 text-sm"
                >
                  <History className="w-4 h-4" />
                  History
                  {expandedJobId === job.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {expandedJobId === job.id && jobDetails[job.id] && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Status History</h4>
                {jobDetails[job.id].statusHistory?.length === 0 ? (
                  <p className="text-sm text-gray-400">No history recorded</p>
                ) : (
                  <div className="space-y-3">
                    {[...(jobDetails[job.id].statusHistory || [])].reverse().map((h, idx) => (
                      <div key={h.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-3 h-3 rounded-full bg-brand-500 mt-1.5" />
                          {idx < (jobDetails[job.id].statusHistory?.length || 0) - 1 && (
                            <div className="w-0.5 flex-1 bg-gray-200 my-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {h.fromStatus && (
                              <>
                                <span className="text-xs text-gray-500">{formatStatus(h.fromStatus)}</span>
                                <span className="text-gray-400">→</span>
                              </>
                            )}
                            <span className={`badge text-xs ${JOB_STATUS_COLORS[h.toStatus]}`}>{formatStatus(h.toStatus)}</span>
                            <span className="text-xs text-gray-400">{formatDate(h.createdAt)}</span>
                          </div>
                          {h.notes && <p className="text-sm text-gray-700 mt-1 bg-gray-50 rounded-lg p-2">{h.notes}</p>}
                          {h.changedBy && (
                            <p className="text-xs text-gray-400 mt-1">By {h.changedBy.firstName} {h.changedBy.lastName}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>

      {detailJobId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailJobId(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            {!detailJob ? (
              <p className="text-gray-400 text-center py-8">Loading...</p>
            ) : (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-xl font-mono">{detailJob.jobNumber}</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className={`badge ${JOB_TYPE_COLORS[detailJob.jobType || 'OTHER']}`}>{formatJobType(detailJob.jobType)}</span>
                      <span className={`badge ${JOB_STATUS_COLORS[detailJob.status]}`}>{formatStatus(detailJob.status)}</span>
                      <span className="badge bg-brand-50 text-brand-800">{formatCompany(detailJob.company)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openJobCard(detailJob.id)}
                      disabled={loadingJobCardId === detailJob.id}
                      className="btn-secondary flex items-center gap-2 text-sm"
                    >
                      {loadingJobCardId === detailJob.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                      Job Card
                    </button>
                    <button onClick={() => setDetailJobId(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
                  </div>
                </div>

                <div className="bg-brand-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-500">Job Total{jobShouldAddGst(detailJob) ? ' (incl. GST)' : ''}</p>
                  <p className="text-3xl font-bold text-brand-700">
                    {(() => {
                      const p = jobPriceSummary(detailJob.subTasks, detailJob.estimatedPrice, jobShouldAddGst(detailJob));
                      return p.entered > 0 ? formatCurrency(p.total) : '—';
                    })()}
                  </p>
                  {jobShouldAddGst(detailJob) && (detailJob.subTasks?.length || detailJob.estimatedPrice != null) ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Ex GST {formatCurrency(jobPriceSummary(detailJob.subTasks, detailJob.estimatedPrice, true).subtotal)}
                      {' · '}GST {formatCurrency(jobPriceSummary(detailJob.subTasks, detailJob.estimatedPrice, true).gst)}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Customer</span><p className="font-medium">{detailJob.customer?.name}</p></div>
                  <div><span className="text-gray-500">Contact No</span><p className="font-medium">{detailJob.customer?.phone || '—'}</p></div>
                  <div><span className="text-gray-500">Vehicle Rego</span><p className="font-medium font-mono">{detailJob.vehicle?.registrationNo || '—'}</p></div>
                  <div><span className="text-gray-500">Vehicle</span><p className="font-medium">{detailJob.vehicle?.make} {detailJob.vehicle?.model}</p></div>
                  <div><span className="text-gray-500">Job Type</span><p className="font-medium">{formatJobType(detailJob.jobType)}</p></div>
                  <div><span className="text-gray-500">Job Category</span><p className="font-medium">{formatJobCategory(detailJob.jobCategory)}</p></div>
                  <div><span className="text-gray-500">Priority</span><p className="font-medium">{formatStatus(detailJob.priority || 'NORMAL')}</p></div>
                  <div><span className="text-gray-500">Source</span><p className="font-medium">{formatStatus(detailJob.jobSource || '')}</p></div>
                  <div><span className="text-gray-500">Received</span><p className="font-medium">{formatDate(detailJob.receivedDate)}</p></div>
                  {detailJob.dueDate && <div><span className="text-gray-500">Due Date</span><p className="font-medium">{formatDate(detailJob.dueDate)}</p></div>}
                  {detailJob.assignedTechnician && (
                    <div><span className="text-gray-500">Technician</span><p className="font-medium">{detailJob.assignedTechnician.firstName} {detailJob.assignedTechnician.lastName}</p></div>
                  )}
                </div>

                {detailJob.subTasks && detailJob.subTasks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Sub Tasks</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                          <tr>
                            <th className="text-left p-2">Type</th>
                            <th className="text-left p-2">Description</th>
                            <th className="text-right p-2">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailJob.subTasks.map((task) => (
                            <tr key={task.id || task.description} className="border-t">
                              <td className="p-2">{formatSubTaskType(task.taskType)}</td>
                              <td className="p-2">{task.description}</td>
                              <td className="p-2 text-right">{task.price != null ? formatCurrency(Number(task.price)) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {detailJob.description && (
                  <div><span className="text-sm text-gray-500">Description</span><p className="text-sm mt-1 bg-gray-50 rounded-lg p-3">{detailJob.description}</p></div>
                )}
                {detailJob.internalNotes && (
                  <div><span className="text-sm text-gray-500">Internal Notes</span><p className="text-sm mt-1 bg-yellow-50 rounded-lg p-3">{detailJob.internalNotes}</p></div>
                )}

                {detailJob.statusHistory && detailJob.statusHistory.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Status History</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {[...detailJob.statusHistory].reverse().slice(0, 5).map((h) => (
                        <div key={h.id} className="text-xs bg-gray-50 rounded p-2">
                          <span className={`badge ${JOB_STATUS_COLORS[h.toStatus]}`}>{formatStatus(h.toStatus)}</span>
                          <span className="ml-2 text-gray-400">{formatDate(h.createdAt)}</span>
                          {h.notes && <p className="mt-1 text-gray-600">{h.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2">
                  {canDelete && (
                    <button
                      className="btn-secondary text-red-600 hover:bg-red-50 border-red-200 flex items-center gap-2"
                      onClick={() => { setDetailJobId(null); openDeleteModal(detailJob); }}
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  )}
                  <button className="btn-secondary" onClick={() => { setDetailJobId(null); openEdit(detailJob); }}>Edit Job</button>
                  <button className="btn-primary" onClick={() => setDetailJobId(null)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {jobCard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto print:bg-white print:p-0">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-8 print:shadow-none print:rounded-none print:max-w-none print:my-0">
            <div className="flex justify-between items-center gap-3 p-4 border-b print:hidden">
              <div>
                <h2 className="font-semibold">Job Card</h2>
                <p className="text-sm text-gray-500">{jobCard.jobNumber}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={printJobCard} className="btn-primary flex items-center gap-2">
                  <Printer className="w-4 h-4" /> Print / PDF
                </button>
                <button type="button" onClick={() => setJobCard(null)} className="btn-secondary">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <JobCardPrintTemplate job={jobCard} />
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">Share registration form</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Copy a general link, or a dealer-specific link that pre-fills name, phone, and category.
                </p>
              </div>
              <button type="button" onClick={() => setShowShareModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="label">Dealer (optional)</label>
              <select
                className="input"
                value={shareDealerCode}
                onChange={(e) => setShareDealerCode(e.target.value)}
              >
                <option value="">General form (no pre-fill)</option>
                {dealerCustomers.map((d) => (
                  <option key={d.id} value={d.customerCode}>
                    {dealerDisplayName(d)}{d.phone ? ` · ${d.phone}` : ''}
                  </option>
                ))}
              </select>
              {dealerCustomers.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  No dealers found. Add a customer with type Dealer first.
                </p>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600 break-all font-mono">
              {registrationLinkForDealer(shareDealerCode || undefined)}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => setShowShareModal(false)}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => copyRegistrationLink(shareDealerCode || undefined)}
              >
                Copy link
              </button>
            </div>
          </div>
        </div>
      )}

      {statusModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">Update Job Status</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {formatStatus(statusModal.currentStatus)} → {formatStatus(statusModal.newStatus)}
                </p>
              </div>
              <button onClick={() => setStatusModal(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="label">Remark *</label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g. Parts ordered from supplier, ETA 2 days..."
                value={remark}
                onChange={(e) => { setRemark(e.target.value); setStatusError(''); }}
                autoFocus
              />
              {statusError && <p className="text-red-600 text-sm mt-1">{statusError}</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setStatusModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={submitStatusChange}>Save Status</button>
            </div>
          </div>
        </div>
      )}

      {deleteJob && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSoftDelete} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">Delete job</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Soft delete <span className="font-mono font-medium">{deleteJob.jobNumber}</span>. It will be hidden from the list but kept in the database.
                </p>
              </div>
              <button type="button" onClick={() => setDeleteJob(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="label">Remarks *</label>
              <textarea
                className="input"
                rows={3}
                required
                placeholder="Reason for deleting this job..."
                value={deleteRemarks}
                onChange={(e) => { setDeleteRemarks(e.target.value); setDeleteError(''); }}
                autoFocus
              />
              {deleteError && <p className="text-red-600 text-sm mt-1">{deleteError}</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => setDeleteJob(null)}>Cancel</button>
              <button type="submit" className="btn-primary bg-red-600 hover:bg-red-700" disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete job'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
