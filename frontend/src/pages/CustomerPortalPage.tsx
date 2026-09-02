import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Car, LogOut, Wrench, Receipt, User, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { customerPortalApi } from '../lib/api';
import { formatCurrency, formatDate, formatStatus, JOB_STATUS_COLORS } from '../lib/types';

interface CustomerJob {
  id: string;
  jobNumber: string;
  status: string;
  description?: string;
  receivedDate: string;
  dueDate?: string;
}

interface JobHistoryItem {
  fromStatus: string | null;
  toStatus: string;
  notes: string | null;
  createdAt: string;
  changedBy?: { firstName: string; lastName: string };
}

interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  amountPaid: number;
  paymentStatus: string;
  createdAt: string;
  job?: { jobNumber: string };
}

export default function CustomerPortalPage() {
  const { session, logout } = useCustomerAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<CustomerJob[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobHistory, setJobHistory] = useState<Record<string, JobHistoryItem[]>>({});
  const [activeTab, setActiveTab] = useState<'jobs' | 'invoices' | 'profile'>('jobs');

  useEffect(() => {
    customerPortalApi.jobs().then((res) => setJobs(res.data.data));
    customerPortalApi.invoices().then((res) => setInvoices(res.data.data));
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/customer/login');
  };

  const toggleJob = async (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(jobId);
    if (!jobHistory[jobId]) {
      const res = await customerPortalApi.jobDetail(jobId);
      setJobHistory((prev) => ({ ...prev, [jobId]: res.data.data.statusHistory || [] }));
    }
  };

  if (!session) return null;

  const { customer, vehicle } = session;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Car className="w-7 h-7 text-accent-500" />
            <div>
              <h1 className="font-bold">Ceylon Automobile</h1>
              <p className="text-brand-300 text-xs">Customer Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/register"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-800 hover:bg-brand-700 text-sm text-white transition-colors"
            >
              <ClipboardList className="w-4 h-4" /> Register Job
            </Link>
            <button onClick={handleLogout} className="flex items-center gap-2 text-brand-200 hover:text-white text-sm">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="card bg-brand-50 border-brand-100">
          <p className="text-sm text-brand-800">
            Welcome, <strong>{customer.name}</strong> · Vehicle <strong>{vehicle.registrationNo}</strong> ({vehicle.make} {vehicle.model})
          </p>
        </div>

        <div className="flex gap-2 border-b border-gray-200 flex-wrap">
          {[
            { id: 'jobs' as const, label: 'My Jobs', icon: Wrench },
            { id: 'invoices' as const, label: 'Invoices', icon: Receipt },
            { id: 'profile' as const, label: 'My Details', icon: User },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
          <Link
            to="/register"
            className="sm:hidden flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-600 border-b-2 border-transparent -mb-px"
          >
            <ClipboardList className="w-4 h-4" /> Register Job
          </Link>
        </div>

        {activeTab === 'jobs' && (
          <div className="space-y-3">
            {jobs.length === 0 ? (
              <div className="card text-center py-10 text-gray-500">No jobs found for this vehicle.</div>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="card">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-medium">{job.jobNumber}</span>
                        <span className={`badge ${JOB_STATUS_COLORS[job.status]}`}>{formatStatus(job.status)}</span>
                      </div>
                      {job.description && <p className="text-sm text-gray-600 mt-2">{job.description}</p>}
                      <p className="text-xs text-gray-400 mt-1">Received {formatDate(job.receivedDate)}</p>
                    </div>
                    <button onClick={() => toggleJob(job.id)} className="btn-secondary text-sm flex items-center gap-1">
                      Progress
                      {expandedJobId === job.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                  {expandedJobId === job.id && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <h4 className="text-sm font-semibold text-gray-700">Repair Progress History</h4>
                      {!jobHistory[job.id] ? (
                        <p className="text-sm text-gray-400">Loading...</p>
                      ) : (
                        jobHistory[job.id].map((h) => (
                          <div key={`${h.createdAt}-${h.toStatus}`} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`badge text-xs ${JOB_STATUS_COLORS[h.toStatus]}`}>{formatStatus(h.toStatus)}</span>
                              <span className="text-xs text-gray-400">{formatDate(h.createdAt)}</span>
                            </div>
                            {h.notes && <p className="text-sm text-gray-700 mt-2">{h.notes}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3">Invoice</th>
                  <th className="pb-3">Job</th>
                  <th className="pb-3">Total</th>
                  <th className="pb-3">Paid</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">No invoices yet</td></tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="border-b">
                      <td className="py-3 font-mono">{inv.invoiceNumber}</td>
                      <td className="py-3">{inv.job?.jobNumber || '—'}</td>
                      <td className="py-3">{formatCurrency(Number(inv.total))}</td>
                      <td className="py-3">{formatCurrency(Number(inv.amountPaid))}</td>
                      <td className="py-3"><span className="badge bg-gray-100">{formatStatus(inv.paymentStatus)}</span></td>
                      <td className="py-3 text-gray-500">{formatDate(inv.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="card space-y-4">
            <h3 className="font-semibold">Your Details</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><dt className="text-gray-500">Name</dt><dd className="font-medium">{customer.name}</dd></div>
              <div><dt className="text-gray-500">Customer Code</dt><dd className="font-medium">{customer.customerCode}</dd></div>
              <div><dt className="text-gray-500">Phone</dt><dd className="font-medium">{customer.phone || '—'}</dd></div>
              <div><dt className="text-gray-500">Email</dt><dd className="font-medium">{customer.email || '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-gray-500">Address</dt><dd className="font-medium">{customer.address || '—'}</dd></div>
              <div><dt className="text-gray-500">Vehicle</dt><dd className="font-medium">{vehicle.registrationNo} — {vehicle.make} {vehicle.model}</dd></div>
              {vehicle.colour && <div><dt className="text-gray-500">Colour</dt><dd className="font-medium">{vehicle.colour}</dd></div>}
            </dl>
            <p className="text-xs text-gray-400 pt-2 border-t">This is a read-only view. Contact the workshop for changes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
