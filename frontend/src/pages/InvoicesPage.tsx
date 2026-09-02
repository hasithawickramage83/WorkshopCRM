import { useEffect, useMemo, useState } from 'react';
import { Printer, X, Loader2 } from 'lucide-react';
import { invoicesApi, jobsApi } from '../lib/api';
import { formatCurrency, formatStatus, jobPriceSummary } from '../lib/types';
import InvoicePrintTemplate, { InvoicePrintData } from '../components/InvoicePrintTemplate';

interface JobSubTask {
  id: string;
  taskType: string;
  description: string;
  price?: number | string | null;
}

interface JobRow {
  id: string;
  jobNumber: string;
  status: string;
  description?: string;
  estimatedPrice?: number | string | null;
  addGst?: boolean;
  jobCategory?: string | null;
  jobSource?: string | null;
  customer?: { name: string };
  vehicle?: { registrationNo: string; make: string; model: string };
  subTasks?: JobSubTask[];
}

interface Invoice extends InvoicePrintData {
  id: string;
  paymentStatus: string;
  job?: InvoicePrintData['job'] & { id?: string };
}

function withJobVehicle(invoice: Invoice, fallback?: JobRow): Invoice {
  const jobId = invoice.job?.id || fallback?.id;
  return {
    ...invoice,
    job: {
      id: jobId,
      jobNumber: invoice.job?.jobNumber || fallback?.jobNumber || '',
      vehicle: invoice.job?.vehicle || fallback?.vehicle,
    },
  };
}

/** Job cash amount the customer pays (includes GST when job.addGst). */
function jobCashAmount(job: JobRow): number {
  return jobPriceSummary(job.subTasks, job.estimatedPrice, !!job.addGst).total;
}

function jobListTotal(job: JobRow): number {
  return jobCashAmount(job);
}

function InvoicePrintView({
  invoice: initialInvoice,
  onClose,
  onInvoiceUpdate,
}: {
  invoice: Invoice;
  onClose: () => void;
  onInvoiceUpdate?: (invoice: Invoice) => void;
}) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [amountPaid, setAmountPaid] = useState(String(Number(initialInvoice.amountPaid || 0)));
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [collectionType, setCollectionType] = useState('OTHER');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setInvoice(initialInvoice);
    setAmountPaid(String(Number(initialInvoice.amountPaid || 0)));
  }, [initialInvoice]);

  const handlePrint = () => {
    const el = document.getElementById('invoice-print');
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

  const refreshInvoice = async () => {
    const res = await invoicesApi.get(invoice.id);
    const updated = res.data.data as Invoice;
    setInvoice(updated);
    setAmountPaid(String(Number(updated.amountPaid || 0)));
    onInvoiceUpdate?.(updated);
  };

  const saveAmountPaid = async () => {
    const paid = parseFloat(amountPaid);
    if (Number.isNaN(paid) || paid < 0) {
      setError('Enter a valid amount');
      return;
    }
    if (paid > Number(invoice.total)) {
      setError('Amount paid cannot exceed invoice total');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await invoicesApi.updateAmountPaid(invoice.id, paid);
      const updated = res.data.data as Invoice;
      setInvoice(updated);
      setAmountPaid(String(Number(updated.amountPaid || 0)));
      onInvoiceUpdate?.(updated);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg || 'Failed to update paid amount');
    } finally {
      setSaving(false);
    }
  };

  const recordPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      setError('Enter a valid payment amount');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await invoicesApi.addPayment(invoice.id, {
        amount,
        paymentMethod,
        collectionType,
      });
      setPaymentAmount('');
      await refreshInvoice();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const balanceDue = Math.max(Number(invoice.total) - Number(invoice.amountPaid || 0), 0);

  return (
    <div id="invoice-print-overlay" className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto print:bg-white print:p-0">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-8 print:shadow-none print:rounded-none print:max-w-none print:my-0">
        <div className="flex flex-col gap-3 p-4 print:hidden border-b">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Total Amount Paid (NZD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input w-40"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                />
              </div>
              <button
                onClick={saveAmountPaid}
                disabled={saving}
                className="btn-secondary flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Set Total Paid
              </button>
              <div className="text-sm text-gray-500 pb-2">
                Balance due: <strong>{formatCurrency(balanceDue)}</strong>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button onClick={onClose} className="btn-secondary"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Add payment</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input w-36"
                placeholder="Amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={collectionType} onChange={(e) => setCollectionType(e.target.value)}>
                <option value="ADVANCE">Advance</option>
                <option value="SECOND">Second</option>
                <option value="FINAL">Final</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Method</label>
              <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Card</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <button type="button" onClick={recordPayment} disabled={saving} className="btn-primary">
              Record Payment
            </button>
          </div>
        </div>
        {error && (
          <div className="mx-4 mt-3 bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm print:hidden">{error}</div>
        )}
        <InvoicePrintTemplate invoice={invoice} />
      </div>
    </div>
  );
}

function InvoiceOptionsModal({
  job,
  existingInvoice,
  onClose,
  onGenerate,
  loading,
}: {
  job: JobRow;
  existingInvoice?: Invoice;
  onClose: () => void;
  onGenerate: (options: { invoiceNumber?: string; amountPaid: number }) => void;
  loading: boolean;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState(existingInvoice?.invoiceNumber || '');
  const [amountPaid, setAmountPaid] = useState(String(Number(existingInvoice?.amountPaid || 0)));
  const enteredTotal = jobCashAmount(job);
  const total = enteredTotal;
  const paidValue = parseFloat(amountPaid) || 0;
  const balanceDue = Math.max(total - paidValue, 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-4 sm:my-8 max-h-[calc(100vh-2rem)] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold">{existingInvoice ? 'Cash Invoice' : 'Generate Cash Invoice'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto min-h-0 flex-1">
          <div>
            <label className="label">Invoice Number</label>
            <input
              className="input font-mono"
              placeholder="Auto-generated if left blank"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              readOnly={!!existingInvoice}
            />
            {existingInvoice && (
              <p className="text-xs text-gray-500 mt-1">Existing invoice — number cannot be changed</p>
            )}
          </div>

          <div>
            <label className="label">Amount Paid (NZD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Balance due after save: {formatCurrency(balanceDue)}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p><span className="text-gray-500">Job:</span> <strong>{job.jobNumber}</strong></p>
            <p><span className="text-gray-500">Customer:</span> {job.customer?.name || '—'}</p>
            <p><span className="text-gray-500">Cash amount:</span> {formatCurrency(enteredTotal)}</p>
            <p className="text-xs text-gray-500 pt-1">Cash invoice — no GST / tax applied.</p>
          </div>

          <div className="flex justify-between items-center pt-2 border-t text-sm">
            <span className="font-medium">Invoice Total (Cash)</span>
            <span className="text-lg font-bold">{formatCurrency(total)}</span>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-4 border-t shrink-0 bg-white rounded-b-xl">
          <button onClick={onClose} className="btn-secondary w-full sm:w-auto">Cancel</button>
          <button
            onClick={() => onGenerate({
              invoiceNumber: invoiceNumber.trim() || undefined,
              amountPaid: paidValue,
            })}
            disabled={loading || paidValue > total}
            className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {existingInvoice ? 'Update & Print' : 'Generate & Print'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [invoicesByJob, setInvoicesByJob] = useState<Record<string, Invoice>>({});
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [printingJobId, setPrintingJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoadingJobs(true);
    try {
      const [jobsRes, invoicesRes] = await Promise.all([
        jobsApi.list({ limit: '500' }),
        invoicesApi.list({ limit: '500' }),
      ]);
      const jobList = jobsRes.data.data.jobs as JobRow[];
      setJobs(jobList);
      const jobsById = Object.fromEntries(jobList.map((j) => [j.id, j]));
      const map: Record<string, Invoice> = {};
      for (const inv of invoicesRes.data.data.invoices as Invoice[]) {
        if (!inv.job?.id || map[inv.job.id]) continue;
        map[inv.job.id] = withJobVehicle(inv, jobsById[inv.job.id]);
      }
      setInvoicesByJob(map);
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((job) =>
      job.jobNumber.toLowerCase().includes(q)
      || job.customer?.name.toLowerCase().includes(q)
      || job.vehicle?.registrationNo.toLowerCase().includes(q)
      || job.description?.toLowerCase().includes(q),
    );
  }, [jobs, search]);

  const openInvoiceOptions = (job: JobRow) => {
    setSelectedJob(job);
  };

  const generateInvoice = async (options: { invoiceNumber?: string; amountPaid: number }) => {
    if (!selectedJob) return;
    if (options.amountPaid < 0 || Number.isNaN(options.amountPaid)) {
      setToast('Enter a valid paid amount');
      return;
    }
    setPrintingJobId(selectedJob.id);
    try {
      const res = await invoicesApi.createFromJob({
        jobId: selectedJob.id,
        includeGst: false,
        invoiceNumber: options.invoiceNumber,
      });
      let invoice = res.data.data as Invoice;
      if (options.amountPaid > Number(invoice.total)) {
        setToast('Amount paid cannot exceed invoice total');
        return;
      }
      if (options.amountPaid !== Number(invoice.amountPaid || 0)) {
        const paidRes = await invoicesApi.updateAmountPaid(invoice.id, options.amountPaid);
        invoice = paidRes.data.data as Invoice;
      }
      invoice = withJobVehicle(invoice, selectedJob);
      setSelectedJob(null);
      setViewInvoice(invoice);
      setInvoicesByJob((prev) => ({ ...prev, [selectedJob.id]: invoice }));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setToast(msg || 'Failed to open invoice');
    } finally {
      setPrintingJobId(null);
    }
  };

  const handleInvoiceUpdate = (invoice: Invoice) => {
    const jobId = invoice.job?.id;
    const enriched = withJobVehicle(
      invoice,
      jobId ? jobs.find((j) => j.id === jobId) : undefined,
    );
    setViewInvoice(enriched);
    if (jobId) {
      setInvoicesByJob((prev) => ({ ...prev, [jobId]: enriched }));
    }
  };

  const openExistingInvoice = async (job: JobRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const existing = invoicesByJob[job.id];
    if (!existing?.id) return;
    try {
      const res = await invoicesApi.get(existing.id);
      setViewInvoice(withJobVehicle(res.data.data as Invoice, job));
    } catch {
      setViewInvoice(withJobVehicle(existing, job));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-gray-500">Select a job to generate and print its cash invoice</p>
        </div>
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search job, customer, rego..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3">Job</th>
              <th className="pb-3">Customer</th>
              <th className="pb-3">Vehicle</th>
              <th className="pb-3">Lines</th>
              <th className="pb-3">Amount</th>
              <th className="pb-3">Invoice</th>
              <th className="pb-3">Paid</th>
              <th className="pb-3">Status</th>
              <th className="pb-3"></th>
            </tr>
          </thead>
          <tbody>
            {loadingJobs ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading jobs...
                </td>
              </tr>
            ) : filteredJobs.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-400">No jobs found</td></tr>
            ) : (
              filteredJobs.map((job) => {
                const existing = invoicesByJob[job.id];
                return (
                  <tr
                    key={job.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => openInvoiceOptions(job)}
                  >
                    <td className="py-3 font-mono font-medium">{job.jobNumber}</td>
                    <td className="py-3">{job.customer?.name || '—'}</td>
                    <td className="py-3">
                      {job.vehicle?.registrationNo || '—'}
                      {job.vehicle && (
                        <span className="block text-xs text-gray-400">
                          {job.vehicle.make} {job.vehicle.model}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-gray-500">
                      {job.subTasks?.length
                        ? `${job.subTasks.length} sub-task${job.subTasks.length > 1 ? 's' : ''}`
                        : 'Base job'}
                    </td>
                    <td className="py-3 font-medium">
                      {formatCurrency(jobListTotal(job))}
                    </td>
                    <td className="py-3 font-mono text-xs">{existing?.invoiceNumber || '—'}</td>
                    <td className="py-3">
                      {existing ? formatCurrency(Number(existing.amountPaid || 0)) : '—'}
                    </td>
                    <td className="py-3 text-gray-500">{formatStatus(job.status)}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        {existing && (
                          <button
                            type="button"
                            onClick={(e) => openExistingInvoice(job, e)}
                            className="btn-secondary text-xs"
                          >
                            View
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openInvoiceOptions(job); }}
                          disabled={printingJobId === job.id}
                          className="btn-primary text-xs flex items-center gap-1"
                        >
                          {printingJobId === job.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Printer className="w-3 h-3" />
                          )}
                          {existing ? 'Update' : 'Print Invoice'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedJob && (
        <InvoiceOptionsModal
          job={selectedJob}
          existingInvoice={invoicesByJob[selectedJob.id]}
          onClose={() => setSelectedJob(null)}
          onGenerate={generateInvoice}
          loading={printingJobId === selectedJob.id}
        />
      )}

      {viewInvoice && (
        <InvoicePrintView
          invoice={viewInvoice}
          onClose={() => setViewInvoice(null)}
          onInvoiceUpdate={handleInvoiceUpdate}
        />
      )}
    </div>
  );
}
