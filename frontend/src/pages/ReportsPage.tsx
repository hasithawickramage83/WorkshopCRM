import { Fragment, useCallback, useEffect, useState } from 'react';
import { Download, FileDown } from 'lucide-react';
import { attendanceApi, reportsApi } from '../lib/api';
import { JOB_CATEGORIES, formatCurrency, formatDate, formatJobCategory, formatStatus } from '../lib/types';
import { downloadDealerWiseReportPdf, downloadJobsReportPdf } from '../lib/reportPdf';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];

interface InvoiceSalesReport {
  totalSales: number;
  subtotal: number;
  gst: number;
  amountPaid: number;
  invoiceCount: number;
  jobCategory?: string | null;
  from: string;
  to: string;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    total: number | string;
    amountPaid?: number | string;
    paymentStatus?: string;
    createdAt: string;
    customer?: { name: string };
    job?: {
      jobNumber: string;
      jobCategory?: string | null;
      vehicle?: { registrationNo: string };
    };
  }>;
}

interface JobsCategoryReport {
  jobCount: number;
  invoicedCount: number;
  uninvoicedCount: number;
  totalEstimatedValue: number;
  totalAmount?: number;
  jobCategory?: string | null;
  from: string;
  to: string;
  dealerJobCount?: number;
  dealerTotalAmount?: number;
  jobs: Array<{
    id: string;
    jobNumber: string;
    status: string;
    jobCategory?: string | null;
    jobSource?: string;
    isDealer?: boolean;
    dealerLabel?: string;
    description?: string;
    estimatedValue: number;
    amount?: number;
    createdAt: string;
    customerName?: string;
    customer?: { name: string; phone?: string };
    registrationNo?: string;
    vehicle?: { registrationNo: string; make?: string; model?: string };
    invoice?: {
      invoiceNumber: string;
      total: number;
      amountPaid: number;
      paymentStatus: string;
    } | null;
  }>;
  dealerGroups?: Array<{
    customerName: string;
    jobCount: number;
    totalAmount: number;
    totalEstimatedValue: number;
    jobs: JobsCategoryReport['jobs'];
  }>;
}

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultPeriod() {
  const now = new Date();
  return {
    from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toDateInput(now),
  };
}

interface AttendanceEmployeeReport {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  totalWorkHours: number;
  totalWorkFormatted: string;
  totalBreakFormatted: string;
  daysWorked: number;
  days: Array<{
    date: string;
    workFormatted: string;
    breakFormatted: string;
    workHours: number;
    events: Array<{ eventType: string; eventAt: string; clockOutReason?: string | null }>;
  }>;
}

interface AttendanceReport {
  from: string;
  to: string;
  employees: AttendanceEmployeeReport[];
}

export default function ReportsPage() {
  const { user } = useAuth();
  const canViewAttendance = user?.role === 'SUPER_ADMIN' || (user?.pages || []).includes('reports');

  const [jobCategory, setJobCategory] = useState('');
  const [monthlyRevenue, setMonthlyRevenue] = useState<{ month: number; revenue: number }[]>([]);
  const [jobsBySource, setJobsBySource] = useState<{ source: string; count: number }[]>([]);
  const [technicians, setTechnicians] = useState<{ firstName: string; lastName: string; completedJobs: number; activeJobs: number }[]>([]);
  const [outstanding, setOutstanding] = useState<{ invoiceNumber: string; total: number; customer?: { name: string } }[]>([]);
  const [invoiceSales, setInvoiceSales] = useState<InvoiceSalesReport | null>(null);
  const [jobsReport, setJobsReport] = useState<JobsCategoryReport | null>(null);
  const [salesFrom, setSalesFrom] = useState(defaultPeriod().from);
  const [salesTo, setSalesTo] = useState(defaultPeriod().to);
  const [loadingSales, setLoadingSales] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [attendanceFrom, setAttendanceFrom] = useState(defaultPeriod().from);
  const [attendanceTo, setAttendanceTo] = useState(defaultPeriod().to);
  const [attendanceReport, setAttendanceReport] = useState<AttendanceReport | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  const categoryParam = jobCategory || undefined;
  const categoryLabel = jobCategory
    ? formatJobCategory(jobCategory)
    : 'All job categories';

  const loadInvoiceSales = useCallback(() => {
    setLoadingSales(true);
    reportsApi.workshopSales({ from: salesFrom, to: salesTo, jobCategory: categoryParam })
      .then((res) => setInvoiceSales(res.data.data))
      .finally(() => setLoadingSales(false));
  }, [salesFrom, salesTo, categoryParam]);

  const loadJobsReport = useCallback(() => {
    setLoadingJobs(true);
    reportsApi.jobsReport({ from: salesFrom, to: salesTo, jobCategory: categoryParam })
      .then((res) => setJobsReport(res.data.data))
      .finally(() => setLoadingJobs(false));
  }, [salesFrom, salesTo, categoryParam]);

  const loadChartReports = useCallback(() => {
    setLoadingCharts(true);
    const year = new Date().getFullYear();
    Promise.all([
      reportsApi.monthlyRevenue(year, categoryParam),
      reportsApi.jobsBySource(categoryParam),
      reportsApi.technicianProductivity(categoryParam),
      reportsApi.outstandingInvoices(categoryParam),
    ])
      .then(([revenueRes, sourceRes, techRes, outstandingRes]) => {
        setMonthlyRevenue(revenueRes.data.data);
        setJobsBySource(sourceRes.data.data);
        setTechnicians(techRes.data.data);
        setOutstanding(outstandingRes.data.data);
      })
      .finally(() => setLoadingCharts(false));
  }, [categoryParam]);

  const loadAttendanceReport = () => {
    setLoadingAttendance(true);
    attendanceApi.report({ from: attendanceFrom, to: attendanceTo })
      .then((res) => setAttendanceReport(res.data.data))
      .finally(() => setLoadingAttendance(false));
  };

  const generatePeriodReports = () => {
    loadJobsReport();
    loadInvoiceSales();
  };

  const toPdfRows = (jobs: JobsCategoryReport['jobs']) =>
    jobs.map((job) => ({
      customerName: job.customerName || job.customer?.name || '—',
      dealerLabel: job.dealerLabel || (job.isDealer ? 'Dealer' : 'Non Dealer'),
      registrationNo: job.registrationNo || job.vehicle?.registrationNo || '—',
      createdAt: job.createdAt,
      status: job.status,
      description: job.description || '—',
      amount: job.amount ?? job.estimatedValue ?? 0,
    }));

  const handleDownloadJobsPdf = () => {
    if (!jobsReport) return;
    downloadJobsReportPdf({
      rows: toPdfRows(jobsReport.jobs),
      from: salesFrom,
      to: salesTo,
      categoryLabel,
      totalAmount: jobsReport.totalAmount ?? jobsReport.totalEstimatedValue,
    });
  };

  const handleDownloadDealerPdf = () => {
    if (!jobsReport?.dealerGroups?.length) return;
    downloadDealerWiseReportPdf({
      groups: jobsReport.dealerGroups.map((g) => ({
        customerName: g.customerName,
        jobCount: g.jobCount,
        totalAmount: g.totalAmount,
        jobs: toPdfRows(g.jobs),
      })),
      from: salesFrom,
      to: salesTo,
      totalAmount: jobsReport.dealerTotalAmount,
    });
  };

  useEffect(() => {
    loadJobsReport();
    loadInvoiceSales();
    loadChartReports();
  }, [loadJobsReport, loadInvoiceSales, loadChartReports]);

  useEffect(() => {
    if (canViewAttendance) loadAttendanceReport();
  }, []);

  const handleExport = async (type: string) => {
    const res = await reportsApi.export(type, 'csv');
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-export.csv`;
    a.click();
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const revenueChart = monthlyRevenue.map((m) => ({ name: monthNames[m.month - 1], revenue: m.revenue }));

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-gray-500">Invoice sales, revenue & productivity analytics</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="min-w-[200px]">
            <label className="label">Job Category</label>
            <select
              className="input"
              value={jobCategory}
              onChange={(e) => setJobCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {JOB_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            {['customers', 'jobs', 'invoices', 'leads'].map((type) => (
              <button key={type} onClick={() => handleExport(type)} className="btn-secondary flex items-center gap-1 text-sm">
                <Download className="w-4 h-4" /> {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {jobCategory && (
        <div className="bg-teal-50 text-teal-800 px-4 py-3 rounded-lg text-sm">
          Showing reports for <strong>{categoryLabel}</strong> jobs only — including jobs without invoices.
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h2 className="font-semibold text-lg">Jobs Report</h2>
            <p className="text-sm text-gray-500">
              Sorted by customer name{jobCategory ? ` · ${categoryLabel}` : ''} — download as PDF
            </p>
          </div>
          {jobsReport && jobsReport.jobs.length > 0 && (
            <button type="button" onClick={handleDownloadJobsPdf} className="btn-secondary flex items-center gap-2 text-sm">
              <FileDown className="w-4 h-4" /> Download PDF
            </button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={salesFrom} onChange={(e) => setSalesFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={salesTo} onChange={(e) => setSalesTo(e.target.value)} />
          </div>
          <div className="min-w-[180px]">
            <label className="label">Job Category</label>
            <select
              className="input"
              value={jobCategory}
              onChange={(e) => setJobCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {JOB_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={generatePeriodReports} disabled={loadingJobs || loadingSales} className="btn-primary">
            {(loadingJobs || loadingSales) ? 'Loading...' : 'Generate Report'}
          </button>
        </div>

        {jobsReport && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-700">Jobs</p>
                <p className="text-2xl font-bold text-blue-900">{jobsReport.jobCount}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-700">Invoiced</p>
                <p className="text-2xl font-bold text-green-900">{jobsReport.invoicedCount}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <p className="text-sm text-amber-700">Not Invoiced</p>
                <p className="text-2xl font-bold text-amber-900">{jobsReport.uninvoicedCount}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="text-xl font-bold">{formatCurrency(jobsReport.totalAmount ?? jobsReport.totalEstimatedValue)}</p>
              </div>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-left p-3">Dealer?</th>
                    <th className="text-left p-3">Rego</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Description</th>
                    <th className="text-right p-3">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsReport.jobs.length === 0 ? (
                    <tr><td colSpan={7} className="p-6 text-center text-gray-400">No jobs in this period</td></tr>
                  ) : (
                    jobsReport.jobs.map((job) => (
                      <tr key={job.id} className="border-t">
                        <td className="p-3 font-medium">{job.customerName || job.customer?.name || '—'}</td>
                        <td className="p-3">
                          <span className={`badge ${job.isDealer ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-700'}`}>
                            {job.dealerLabel || (job.isDealer ? 'Dealer' : 'Non Dealer')}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{job.registrationNo || job.vehicle?.registrationNo || '—'}</td>
                        <td className="p-3">{formatDate(job.createdAt)}</td>
                        <td className="p-3">{formatStatus(job.status)}</td>
                        <td className="p-3 text-gray-600 max-w-xs">{job.description || '—'}</td>
                        <td className="p-3 text-right font-medium">{formatCurrency(job.amount ?? job.estimatedValue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {jobsReport && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div>
              <h2 className="font-semibold text-lg">Dealer-wise Report</h2>
              <p className="text-sm text-gray-500">
                Dealer jobs grouped by customer · {(jobsReport.dealerJobCount ?? 0)} jobs · {formatCurrency(jobsReport.dealerTotalAmount ?? 0)}
              </p>
            </div>
            {(jobsReport.dealerGroups?.length || 0) > 0 && (
              <button type="button" onClick={handleDownloadDealerPdf} className="btn-secondary flex items-center gap-2 text-sm">
                <FileDown className="w-4 h-4" /> Download Dealer PDF
              </button>
            )}
          </div>

          {(jobsReport.dealerGroups?.length || 0) === 0 ? (
            <p className="text-sm text-gray-400">No dealer jobs in this period</p>
          ) : (
            <div className="space-y-4">
              {jobsReport.dealerGroups!.map((group) => (
                <div key={group.customerName} className="border rounded-lg overflow-hidden">
                  <div className="bg-teal-50 px-4 py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
                    <p className="font-semibold text-teal-900">{group.customerName}</p>
                    <p className="text-sm text-teal-800">
                      {group.jobCount} job{group.jobCount === 1 ? '' : 's'} · {formatCurrency(group.totalAmount)}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="text-left p-3">Rego</th>
                          <th className="text-left p-3">Date</th>
                          <th className="text-left p-3">Status</th>
                          <th className="text-left p-3">Description</th>
                          <th className="text-right p-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.jobs.map((job) => (
                          <tr key={job.id} className="border-t">
                            <td className="p-3 font-mono">{job.registrationNo || job.vehicle?.registrationNo || '—'}</td>
                            <td className="p-3">{formatDate(job.createdAt)}</td>
                            <td className="p-3">{formatStatus(job.status)}</td>
                            <td className="p-3 text-gray-600 max-w-xs">{job.description || '—'}</td>
                            <td className="p-3 text-right font-medium">{formatCurrency(job.amount ?? job.estimatedValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Invoice Sales Report</h2>
          <p className="text-sm text-gray-500">
            Invoices and amounts for the selected period{jobCategory ? ` · ${categoryLabel}` : ''}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={salesFrom} onChange={(e) => setSalesFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={salesTo} onChange={(e) => setSalesTo(e.target.value)} />
          </div>
          <div className="min-w-[180px]">
            <label className="label">Job Category</label>
            <select
              className="input"
              value={jobCategory}
              onChange={(e) => setJobCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {JOB_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={generatePeriodReports} disabled={loadingJobs || loadingSales} className="btn-primary">
            {(loadingJobs || loadingSales) ? 'Loading...' : 'Generate Report'}
          </button>
        </div>

        {invoiceSales && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 pt-2">
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-700">Total Invoiced</p>
                <p className="text-2xl font-bold text-green-900">{formatCurrency(invoiceSales.totalSales)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4">
                <p className="text-sm text-emerald-700">Amount Paid</p>
                <p className="text-2xl font-bold text-emerald-900">{formatCurrency(invoiceSales.amountPaid)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Subtotal</p>
                <p className="text-xl font-bold">{formatCurrency(invoiceSales.subtotal)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">GST</p>
                <p className="text-xl font-bold">{formatCurrency(invoiceSales.gst)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-700">Invoices</p>
                <p className="text-2xl font-bold text-blue-900">{invoiceSales.invoiceCount}</p>
              </div>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left p-3">Invoice</th>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-left p-3">Job</th>
                    <th className="text-left p-3">Category</th>
                    <th className="text-left p-3">Rego</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-right p-3">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceSales.invoices.length === 0 ? (
                    <tr><td colSpan={9} className="p-6 text-center text-gray-400">No invoices in this period</td></tr>
                  ) : (
                    invoiceSales.invoices.map((inv) => (
                      <tr key={inv.id} className="border-t">
                        <td className="p-3 font-mono">{inv.invoiceNumber}</td>
                        <td className="p-3">{inv.customer?.name || '—'}</td>
                        <td className="p-3">{inv.job?.jobNumber || '—'}</td>
                        <td className="p-3">{formatJobCategory(inv.job?.jobCategory)}</td>
                        <td className="p-3 font-mono">{inv.job?.vehicle?.registrationNo || '—'}</td>
                        <td className="p-3">{formatDate(inv.createdAt)}</td>
                        <td className="p-3">{inv.paymentStatus ? formatStatus(inv.paymentStatus) : '—'}</td>
                        <td className="p-3 text-right font-medium">{formatCurrency(Number(inv.total))}</td>
                        <td className="p-3 text-right">{formatCurrency(Number(inv.amountPaid || 0))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {canViewAttendance && (
        <div className="card space-y-4">
          <div>
            <h2 className="font-semibold text-lg">Employee Attendance Report</h2>
            <p className="text-sm text-gray-500">Working hours for mechanics and painters (clock in/out at workshop)</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={attendanceFrom} onChange={(e) => setAttendanceFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={attendanceTo} onChange={(e) => setAttendanceTo(e.target.value)} />
            </div>
            <button type="button" onClick={loadAttendanceReport} disabled={loadingAttendance} className="btn-primary">
              {loadingAttendance ? 'Loading...' : 'Generate Report'}
            </button>
          </div>

          {attendanceReport && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left p-3">Employee</th>
                    <th className="text-left p-3">Role</th>
                    <th className="text-right p-3">Days Worked</th>
                    <th className="text-right p-3">Total Hours</th>
                    <th className="text-right p-3">Break Time</th>
                    <th className="text-left p-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceReport.employees.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-400">No attendance records in this period</td></tr>
                  ) : (
                    attendanceReport.employees.map((emp) => (
                      <Fragment key={emp.userId}>
                        <tr className="border-t">
                          <td className="p-3 font-medium">{emp.firstName} {emp.lastName}</td>
                          <td className="p-3">{formatStatus(emp.role)}</td>
                          <td className="p-3 text-right">{emp.daysWorked}</td>
                          <td className="p-3 text-right font-medium">{emp.totalWorkFormatted}</td>
                          <td className="p-3 text-right text-gray-500">{emp.totalBreakFormatted}</td>
                          <td className="p-3">
                            {emp.days.length > 0 && (
                              <button
                                type="button"
                                className="text-brand-600 hover:underline text-xs"
                                onClick={() => setExpandedEmployee(expandedEmployee === emp.userId ? null : emp.userId)}
                              >
                                {expandedEmployee === emp.userId ? 'Hide' : 'View days'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedEmployee === emp.userId && emp.days.map((day) => (
                          <tr key={`${emp.userId}-${day.date}`} className="bg-gray-50 border-t">
                            <td colSpan={6} className="p-3 pl-8">
                              <div className="flex flex-wrap items-center gap-4 text-xs">
                                <span className="font-medium text-gray-700">{day.date}</span>
                                <span>Worked: {day.workFormatted}</span>
                                <span>Break: {day.breakFormatted}</span>
                                <span className="text-gray-500">
                                  {day.events.map((e) =>
                                    e.eventType === 'CLOCK_IN'
                                      ? `In ${formatDate(e.eventAt)}`
                                      : `Out ${formatDate(e.eventAt)}${e.clockOutReason === 'BREAK' ? ' (break)' : ''}`,
                                  ).join(' · ')}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="font-semibold">Monthly Invoice Revenue ({new Date().getFullYear()})</h2>
            {loadingCharts && <span className="text-xs text-gray-400">Updating...</span>}
          </div>
          <p className="text-xs text-gray-500 mb-3">{categoryLabel}</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={revenueChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="font-semibold">Jobs by Source</h2>
            {loadingCharts && <span className="text-xs text-gray-400">Updating...</span>}
          </div>
          <p className="text-xs text-gray-500 mb-3">{categoryLabel}</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={jobsBySource} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={100} label>
                {jobsBySource.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="font-semibold">Technician Productivity</h2>
            {loadingCharts && <span className="text-xs text-gray-400">Updating...</span>}
          </div>
          <p className="text-xs text-gray-500 mb-3">{categoryLabel}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="pb-2 text-left">Technician</th>
                <th className="pb-2 text-right">Completed</th>
                <th className="pb-2 text-right">Active</th>
              </tr>
            </thead>
            <tbody>
              {technicians.length === 0 ? (
                <tr><td colSpan={3} className="py-6 text-center text-gray-400">No technician data</td></tr>
              ) : (
                technicians.map((t, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2">{t.firstName} {t.lastName}</td>
                    <td className="py-2 text-right">{t.completedJobs}</td>
                    <td className="py-2 text-right">{t.activeJobs}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="font-semibold">Outstanding Invoices</h2>
            {loadingCharts && <span className="text-xs text-gray-400">Updating...</span>}
          </div>
          <p className="text-xs text-gray-500 mb-3">{categoryLabel}</p>
          {outstanding.length === 0 ? (
            <p className="text-gray-400 text-sm">No outstanding invoices</p>
          ) : (
            <div className="space-y-2">
              {outstanding.slice(0, 10).map((inv, i) => (
                <div key={i} className="flex justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm">{inv.customer?.name} · {inv.invoiceNumber}</span>
                  <span className="font-medium text-sm">{formatCurrency(Number(inv.total))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
