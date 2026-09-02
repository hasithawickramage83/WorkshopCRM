import { useEffect, useState } from 'react';
import { Users, Wrench, Shield, FileText, DollarSign, TrendingUp, CheckCircle, UserCog, Briefcase } from 'lucide-react';
import { dashboardApi } from '../lib/api';
import { DashboardStats, Job, formatCurrency, formatStatus, formatDate, JOB_STATUS_COLORS } from '../lib/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: string | number; color: string }) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </div>
    </div>
  );
}

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

function periodRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = toDateInput(now);
  if (preset === 'today') {
    return { from: to, to };
  }
  if (preset === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: toDateInput(start), to };
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toDateInput(start), to: toDateInput(end) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toDateInput(start), to };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [jobsByStatus, setJobsByStatus] = useState<{ status: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesPreset, setSalesPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const loadStats = (from: string, to: string) => {
    setLoading(true);
    Promise.all([
      dashboardApi.stats({ from, to }),
      dashboardApi.recentJobs(),
      dashboardApi.jobsByStatus(),
    ]).then(([s, j, b]) => {
      setStats(s.data.data);
      setRecentJobs(j.data.data);
      setJobsByStatus(b.data.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    const { from, to } = periodRange(salesPreset);
    if (salesPreset === 'custom') {
      if (customFrom && customTo) loadStats(customFrom, customTo);
      return;
    }
    loadStats(from, to);
  }, [salesPreset, customFrom, customTo]);

  const chartData = jobsByStatus.map((j) => ({
    name: formatStatus(j.status).slice(0, 12),
    count: j.count,
  }));

  const periodLabel = salesPreset === 'custom' && customFrom && customTo
    ? `${formatDate(customFrom)} – ${formatDate(customTo)}`
    : salesPreset === 'today'
      ? 'Today'
      : salesPreset === 'week'
        ? 'Last 7 days'
        : salesPreset === 'last_month'
          ? 'Last month'
          : 'This month';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome to Ceylon Automobile Workshop Management</p>
      </div>

      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div>
            <h2 className="font-semibold">Invoice Sales</h2>
            <p className="text-sm text-gray-500">All invoices raised in the selected period</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            {[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Last 7 days' },
              { value: 'month', label: 'This month' },
              { value: 'last_month', label: 'Last month' },
              { value: 'custom', label: 'Custom' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSalesPreset(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  salesPreset === opt.value ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {salesPreset === 'custom' && (
          <div className="flex flex-wrap gap-3 mt-4">
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </div>
        )}
        {!loading && stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-4 pt-4 border-t">
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-green-700">Total Invoiced ({periodLabel})</p>
              <p className="text-2xl font-bold text-green-900">{formatCurrency(stats.revenue)}</p>
              <p className="text-xs text-green-600 mt-1">{stats.invoiceCount ?? 0} invoice(s)</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <p className="text-sm text-orange-700">Job Value ({periodLabel})</p>
              <p className="text-2xl font-bold text-orange-900">{formatCurrency(stats.periodJobValue ?? 0)}</p>
              <p className="text-xs text-orange-600 mt-1">Jobs registered in period</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-4">
              <p className="text-sm text-emerald-700">Amount Paid</p>
              <p className="text-2xl font-bold text-emerald-900">{formatCurrency(stats.invoiceAmountPaid ?? 0)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Est. Profit</p>
              <p className="text-2xl font-bold">{formatCurrency(stats.profit)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-700">Outstanding</p>
              <p className="text-2xl font-bold text-blue-900">{formatCurrency(stats.outstandingInvoices)}</p>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading dashboard...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Total Customers" value={stats?.totalCustomers ?? 0} color="bg-blue-500" />
            <StatCard icon={Wrench} label="Active Jobs" value={stats?.activeJobs ?? 0} color="bg-orange-500" />
            <StatCard icon={Shield} label="Insurance Claims" value={stats?.insuranceClaims ?? 0} color="bg-purple-500" />
            <StatCard icon={FileText} label="Pending Quotes" value={stats?.pendingQuotes ?? 0} color="bg-yellow-500" />
            <StatCard icon={DollarSign} label="Invoice Total" value={formatCurrency(stats?.revenue ?? 0)} color="bg-green-500" />
            <StatCard icon={Briefcase} label="Total Job Value" value={formatCurrency(stats?.totalJobValue ?? 0)} color="bg-amber-500" />
            <StatCard icon={TrendingUp} label="Est. Profit" value={formatCurrency(stats?.profit ?? 0)} color="bg-emerald-500" />
            <StatCard icon={CheckCircle} label="Jobs Completed" value={stats?.jobsCompleted ?? 0} color="bg-teal-500" />
            <StatCard icon={UserCog} label="Active Technicians" value={stats?.techniciansActive ?? 0} color="bg-indigo-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Jobs by Status</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Recent Jobs</h2>
              <div className="space-y-3">
                {recentJobs.length === 0 ? (
                  <p className="text-gray-500 text-sm">No jobs yet</p>
                ) : (
                  recentJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{job.jobNumber}</p>
                        <p className="text-xs text-gray-500">
                          {job.vehicle?.registrationNo} · {job.customer?.name}
                          {job.customer?.phone && ` · ${job.customer.phone}`}
                        </p>
                      </div>
                      <span className={`badge ${JOB_STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-800'}`}>
                        {formatStatus(job.status)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
