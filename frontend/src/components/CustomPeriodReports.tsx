import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { reportsApi } from '../lib/api';
import { downloadCustomPeriodReportPdf } from '../lib/reportPdf';
import { formatCurrency, formatDate, formatStatus } from '../lib/types';

type ReportKind = 'vehicles' | 'completed' | 'allocated' | 'actual' | 'expense_summary' | 'collections';

interface VehicleRow {
  id: string;
  date?: string | null;
  jobNumber: string;
  customer: string;
  registrationNo: string;
  vehicle: string;
  status: string;
  jobType?: string;
  repairPrice: number;
  eventStatus?: string;
}

interface ExpenseRow {
  id: string;
  date?: string | null;
  category: string;
  materialType?: string | null;
  outsourceType?: string | null;
  otherType?: string | null;
  description: string;
  paymentMethod?: string | null;
  reference?: string | null;
  supplier?: string | null;
  supplierCode?: string | null;
  employee?: string | null;
  employeeCode?: string | null;
  isPayable: boolean;
  amount: number;
}

interface LabourRow {
  employeeId: string;
  name: string;
  code?: string | null;
  workedDays: number;
  hours: number;
  allocatedSalary: number;
  weekCount: number;
}

interface CollectionRow {
  id: string;
  date?: string | null;
  jobNumber: string;
  customer: string;
  registrationNo: string;
  description?: string | null;
  collectionType?: string | null;
  paymentMethod?: string | null;
  reference?: string | null;
  amount: number;
}

interface WorkshopPeriodReport {
  from: string;
  to: string;
  summary: {
    vehiclesIn: number;
    vehiclesInRepairTotal: number;
    vehiclesOut: number;
    vehiclesOutRepairTotal: number;
    vehiclesCompleted?: number;
    vehiclesCompletedOnly?: number;
    vehiclesClosed?: number;
    vehiclesCompletedRepairTotal?: number;
    labourPeople: number;
    labourDays: number;
    labourHours: number;
    allocatedLabourCost: number;
    otherExpensesPaid: number;
    otherExpensesPayable: number;
    totalExpenses: number;
    collectionsTotal?: number;
    cashCollected?: number;
    otherCollected?: number;
  };
  labour: LabourRow[];
  vehiclesIn: VehicleRow[];
  vehiclesOut: VehicleRow[];
  vehiclesCompleted?: VehicleRow[];
  expensesPaid: ExpenseRow[];
  expensesPayable: ExpenseRow[];
  collections?: CollectionRow[];
}

const REPORTS: { id: ReportKind; title: string; description: string }[] = [
  {
    id: 'vehicles',
    title: 'Vehicle summary',
    description: 'Vehicles in and out, with totals and a line-by-line list',
  },
  {
    id: 'completed',
    title: 'Completed & closed jobs',
    description: 'Jobs completed or closed in the period, using the completed or closed date',
  },
  {
    id: 'allocated',
    title: 'Allocated expense report',
    description: 'Allocated spend: labour and other payables, summary then detail',
  },
  {
    id: 'actual',
    title: 'Expense report',
    description: 'Actual paid expenses: labour and other, summary then detail',
  },
  {
    id: 'expense_summary',
    title: 'Expense summary',
    description: 'Paid expenses by category and payment method, such as Labour Cash and Materials Card',
  },
  {
    id: 'collections',
    title: 'Collection report',
    description: 'All collections: cash and other, summary then detail',
  },
];

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseInputDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function startOfDay(anchor: Date) {
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
}

function mondayOf(anchor: Date) {
  const start = startOfDay(anchor);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  return start;
}

function weekRangeContaining(anchor: Date) {
  const start = mondayOf(anchor);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: toDateInput(start), to: toDateInput(end) };
}

function shiftWeek(fromYmd: string, days: number) {
  const monday = mondayOf(parseInputDate(fromYmd));
  monday.setDate(monday.getDate() + days);
  return weekRangeContaining(monday);
}

function defaultPeriod() {
  return weekRangeContaining(new Date());
}

function moneySum(rows: { amount: number }[]) {
  return Math.round(rows.reduce((sum, row) => sum + (row.amount || 0), 0) * 100) / 100;
}

function isLabourExpense(row: ExpenseRow) {
  return row.category === 'LABOUR';
}

function formatHours(value: number) {
  const totalMinutes = Math.round(Math.max(0, value) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  if (minutes) return `${minutes}m`;
  return '0h';
}

function formatCategory(row: ExpenseRow) {
  const base = (row.category || '').replace(/_/g, ' ');
  const extra = row.materialType || row.otherType || row.outsourceType;
  return extra ? `${base} · ${extra.replace(/_/g, ' ')}` : (base || '—');
}

function formatParty(row: ExpenseRow) {
  if (row.employee) return row.employeeCode ? `${row.employee} (${row.employeeCode})` : row.employee;
  if (row.supplier) return row.supplierCode ? `${row.supplier} (${row.supplierCode})` : row.supplier;
  return '—';
}

function isCashCollection(row: CollectionRow) {
  return (row.paymentMethod || '').trim().toUpperCase() === 'CASH';
}

function formatMethod(method?: string | null) {
  if (!method) return '—';
  return method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPaymentLabel(method?: string | null) {
  if (!method) return 'Unspecified';
  return method
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const EXPENSE_CATEGORY_ORDER = ['LABOUR', 'MATERIAL', 'OUTSOURCE', 'OTHER'];
const PAYMENT_METHOD_ORDER = ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER', 'CREDIT'];

function timeValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function latestFirst<T>(items: T[] | undefined, dateOf: (item: T) => string | null | undefined) {
  return [...(items || [])].sort((a, b) => timeValue(dateOf(b)) - timeValue(dateOf(a)));
}

function expenseCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    LABOUR: 'Labour',
    MATERIAL: 'Materials',
    OUTSOURCE: 'Out source',
    OTHER: 'Other',
  };
  return labels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Other';
}

function expenseSummaryLines(rows: ExpenseRow[]) {
  const buckets = new Map<string, { category: string; method: string; amount: number }>();
  for (const row of rows) {
    const category = (row.category || 'OTHER').trim().toUpperCase() || 'OTHER';
    const method = (row.paymentMethod || '').trim().toUpperCase() || 'UNSPECIFIED';
    const key = `${category}|${method}`;
    const current = buckets.get(key);
    const amount = Math.round(((current?.amount || 0) + (row.amount || 0)) * 100) / 100;
    buckets.set(key, { category, method, amount });
  }

  const rank = (value: string, order: string[]) => {
    const index = order.indexOf(value);
    return index === -1 ? order.length : index;
  };

  return [...buckets.values()]
    .filter((row) => row.amount !== 0)
    .sort((a, b) => {
      const categoryDiff = rank(a.category, EXPENSE_CATEGORY_ORDER) - rank(b.category, EXPENSE_CATEGORY_ORDER);
      if (categoryDiff) return categoryDiff;
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      const methodDiff = rank(a.method, PAYMENT_METHOD_ORDER) - rank(b.method, PAYMENT_METHOD_ORDER);
      if (methodDiff) return methodDiff;
      return a.method.localeCompare(b.method);
    })
    .map((row) => ({
      category: expenseCategoryLabel(row.category),
      method: row.method === 'UNSPECIFIED' ? 'Unspecified' : formatPaymentLabel(row.method),
      amount: row.amount,
      label: `${expenseCategoryLabel(row.category)} ${row.method === 'UNSPECIFIED' ? 'Unspecified' : formatPaymentLabel(row.method)}`,
      value: formatCurrency(row.amount),
    }));
}

function formatCollectionType(type?: string | null) {
  const labels: Record<string, string> = {
    ADVANCE: 'Advance',
    SECOND: 'Second payment',
    FINAL: 'Final payment',
    OTHER: 'Other',
  };
  if (!type) return '—';
  return labels[type] || type.replace(/_/g, ' ');
}

function fileDates(from?: string, to?: string) {
  return {
    fromKey: (from || 'all').slice(0, 10),
    toKey: (to || 'all').slice(0, 10),
  };
}

function SummaryLines({ rows }: { rows: { label: string; value: string; emphasis?: boolean }[] }) {
  return (
    <div className="max-w-xl divide-y">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 py-2 text-sm">
          <span className={row.emphasis ? 'font-semibold text-gray-900' : 'text-gray-600'}>{row.label}</span>
          <span className={row.emphasis ? 'font-bold text-gray-900' : 'font-semibold text-gray-900'}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function VehicleTable({ title, rows, dateLabel, emptyLabel = 'No vehicles' }: { title: string; rows: VehicleRow[]; dateLabel: string; emptyLabel?: string }) {
  const total = moneySum(rows.map((r) => ({ amount: r.repairPrice })));
  return (
    <div className="overflow-x-auto border rounded-lg">
      <div className="px-3 py-2 bg-gray-50 text-sm font-semibold">
        {title} ({rows.length}) · {formatCurrency(total)}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="text-left p-2">{dateLabel}</th>
            <th className="text-left p-2">Job</th>
            <th className="text-left p-2">Customer</th>
            <th className="text-left p-2">Rego</th>
            <th className="text-left p-2">Vehicle</th>
            <th className="text-left p-2">Status</th>
            <th className="text-right p-2">Job value</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="p-4 text-center text-gray-400">{emptyLabel}</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
              <td className="p-2 font-mono">{row.jobNumber}</td>
              <td className="p-2">{row.customer}</td>
              <td className="p-2 font-mono">{row.registrationNo}</td>
              <td className="p-2">{row.vehicle}</td>
              <td className="p-2">{formatStatus(row.status)}</td>
              <td className="p-2 text-right font-medium">{row.repairPrice > 0 ? formatCurrency(row.repairPrice) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseTable({ title, rows, partyLabel, showMethod = false }: { title: string; rows: ExpenseRow[]; partyLabel: string; showMethod?: boolean }) {
  const colSpan = showMethod ? 7 : 6;
  return (
    <div className="overflow-x-auto border rounded-lg">
      <div className="px-3 py-2 bg-gray-50 text-sm font-semibold">
        {title} ({rows.length}) · {formatCurrency(moneySum(rows))}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="text-left p-2">Date</th>
            <th className="text-left p-2">Category</th>
            <th className="text-left p-2">{partyLabel}</th>
            <th className="text-left p-2">Description</th>
            <th className="text-left p-2">Reference</th>
            {showMethod && <th className="text-left p-2">Method</th>}
            <th className="text-right p-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={colSpan} className="p-4 text-center text-gray-400">No expenses</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
              <td className="p-2">{formatCategory(row)}</td>
              <td className="p-2">{formatParty(row)}</td>
              <td className="p-2">{row.description || '—'}</td>
              <td className="p-2">{row.reference || '—'}</td>
              {showMethod && <td className="p-2">{row.paymentMethod ? formatPaymentLabel(row.paymentMethod) : '—'}</td>}
              <td className="p-2 text-right font-medium">{formatCurrency(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function vehiclePdfRows(rows: VehicleRow[]) {
  return rows.map((r) => [
    r.date ? formatDate(r.date) : '—',
    r.jobNumber || '—',
    r.customer || '—',
    r.registrationNo || '—',
    r.vehicle || '—',
    formatStatus(r.status || ''),
    r.repairPrice > 0 ? formatCurrency(r.repairPrice) : '—',
  ]);
}

function expensePdfRows(rows: ExpenseRow[], includeMethod = false) {
  return rows.map((r) => {
    const cells = [
      r.date ? formatDate(r.date) : '—',
      formatCategory(r),
      formatParty(r),
      r.description || '—',
      r.reference || '—',
    ];
    if (includeMethod) cells.push(r.paymentMethod ? formatPaymentLabel(r.paymentMethod) : '—');
    cells.push(formatCurrency(r.amount));
    return cells;
  });
}

function CollectionTable({ title, rows }: { title: string; rows: CollectionRow[] }) {
  return (
    <div className="overflow-x-auto border rounded-lg">
      <div className="px-3 py-2 bg-gray-50 text-sm font-semibold">
        {title} ({rows.length}) · {formatCurrency(moneySum(rows))}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="text-left p-2">Date</th>
            <th className="text-left p-2">Job / Invoice</th>
            <th className="text-left p-2">Customer</th>
            <th className="text-left p-2">Rego</th>
            <th className="text-left p-2">Type</th>
            <th className="text-left p-2">Method</th>
            <th className="text-left p-2">Description</th>
            <th className="text-left p-2">Reference</th>
            <th className="text-right p-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="p-4 text-center text-gray-400">No collections</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
              <td className="p-2 font-mono">{row.jobNumber || '—'}</td>
              <td className="p-2">{row.customer || '—'}</td>
              <td className="p-2 font-mono">{row.registrationNo || '—'}</td>
              <td className="p-2">{formatCollectionType(row.collectionType)}</td>
              <td className="p-2">{formatMethod(row.paymentMethod)}</td>
              <td className="p-2">{row.description || '—'}</td>
              <td className="p-2">{row.reference || '—'}</td>
              <td className="p-2 text-right font-medium">{formatCurrency(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function collectionPdfRows(rows: CollectionRow[]) {
  return rows.map((r) => [
    r.date ? formatDate(r.date) : '—',
    r.jobNumber || '—',
    r.customer || '—',
    r.registrationNo || '—',
    formatCollectionType(r.collectionType),
    formatMethod(r.paymentMethod),
    r.description || '—',
    r.reference || '—',
    formatCurrency(r.amount),
  ]);
}

export default function CustomPeriodReports() {
  const initial = defaultPeriod();
  const [kind, setKind] = useState<ReportKind>('vehicles');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<WorkshopPeriodReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.workshopPeriod({ from, to });
      const data = res.data.data;
      setReport(data ? {
        ...data,
        vehiclesIn: latestFirst(data.vehiclesIn, (row) => row.date),
        vehiclesOut: latestFirst(data.vehiclesOut, (row) => row.date),
        vehiclesCompleted: latestFirst(data.vehiclesCompleted, (row) => row.date),
        expensesPaid: latestFirst(data.expensesPaid, (row) => row.date),
        expensesPayable: latestFirst(data.expensesPayable, (row) => row.date),
        collections: latestFirst(data.collections, (row) => row.date),
      } : data);
    } catch (err) {
      setReport(null);
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyWeek = (range: { from: string; to: string }) => {
    setFrom(range.from);
    setTo(range.to);
  };

  const allocatedOther = report?.expensesPayable.filter((row) => !isLabourExpense(row)) || [];
  const allocatedLabour = report?.summary.allocatedLabourCost || 0;
  const allocatedOtherTotal = moneySum(allocatedOther);
  const allocatedTotal = Math.round((allocatedLabour + allocatedOtherTotal) * 100) / 100;

  const paidLabour = report?.expensesPaid.filter(isLabourExpense) || [];
  const paidOther = report?.expensesPaid.filter((row) => !isLabourExpense(row)) || [];
  const paidLabourTotal = moneySum(paidLabour);
  const paidOtherTotal = moneySum(paidOther);
  const paidTotal = moneySum(report?.expensesPaid || []);
  const paidSummary = expenseSummaryLines(report?.expensesPaid || []);

  const collections = report?.collections || [];
  const cashCollections = collections.filter(isCashCollection);
  const otherCollections = collections.filter((row) => !isCashCollection(row));
  const cashTotal = report?.summary.cashCollected ?? moneySum(cashCollections);
  const otherCollectionTotal = report?.summary.otherCollected ?? moneySum(otherCollections);
  const collectionsTotal = report?.summary.collectionsTotal ?? moneySum(collections);

  const download = () => {
    if (!report) return;
    const { fromKey, toKey } = fileDates(from, to);
    const s = report.summary;

    if (kind === 'vehicles') {
      downloadCustomPeriodReportPdf({
        title: 'Vehicle summary',
        filename: `vehicle-summary-${fromKey}-to-${toKey}.pdf`,
        from,
        to,
        summaryLines: [
          { label: 'Total vehicles in (qty)', value: String(s.vehiclesIn) },
          { label: 'Total job value (in)', value: formatCurrency(s.vehiclesInRepairTotal) },
          { label: 'Total vehicles out (qty)', value: String(s.vehiclesOut) },
          { label: 'Total job value (out)', value: formatCurrency(s.vehiclesOutRepairTotal) },
        ],
        sections: [
          {
            heading: `Vehicles in (${report.vehiclesIn.length}) · ${formatCurrency(s.vehiclesInRepairTotal)}`,
            head: ['Date', 'Job', 'Customer', 'Rego', 'Vehicle', 'Status', 'Job value'],
            body: vehiclePdfRows(report.vehiclesIn),
            emptyLabel: 'No vehicles in',
          },
          {
            heading: `Vehicles out (${report.vehiclesOut.length}) · ${formatCurrency(s.vehiclesOutRepairTotal)}`,
            head: ['Out date', 'Job', 'Customer', 'Rego', 'Vehicle', 'Status', 'Job value'],
            body: vehiclePdfRows(report.vehiclesOut),
            emptyLabel: 'No vehicles out',
          },
        ],
      });
      return;
    }

    if (kind === 'completed') {
      const rows = report.vehiclesCompleted || [];
      const completedQty = s.vehiclesCompletedOnly ?? rows.filter((row) => row.eventStatus !== 'CLOSED').length;
      const closedQty = s.vehiclesClosed ?? rows.filter((row) => row.eventStatus === 'CLOSED').length;
      const totalValue = s.vehiclesCompletedRepairTotal ?? moneySum(rows.map((row) => ({ amount: row.repairPrice })));
      downloadCustomPeriodReportPdf({
        title: 'Completed and closed jobs',
        filename: `completed-closed-jobs-${fromKey}-to-${toKey}.pdf`,
        from,
        to,
        summaryLines: [
          { label: 'Total jobs', value: String(rows.length) },
          { label: 'Completed', value: String(completedQty) },
          { label: 'Closed', value: String(closedQty) },
          { label: 'Total job value', value: formatCurrency(totalValue) },
        ],
        sections: [
          {
            heading: `Completed and closed (${rows.length}) · ${formatCurrency(totalValue)}`,
            head: ['Completed / closed date', 'Job', 'Customer', 'Rego', 'Vehicle', 'Status', 'Job value'],
            body: vehiclePdfRows(rows),
            emptyLabel: 'No completed or closed jobs',
          },
        ],
      });
      return;
    }

    if (kind === 'allocated') {
      downloadCustomPeriodReportPdf({
        title: 'Allocated expense report',
        filename: `allocated-expenses-${fromKey}-to-${toKey}.pdf`,
        from,
        to,
        summaryLines: [
          { label: 'Total allocated expenditure', value: formatCurrency(allocatedTotal) },
          { label: 'Labour', value: formatCurrency(allocatedLabour) },
          { label: 'Others', value: formatCurrency(allocatedOtherTotal) },
        ],
        sections: [
          {
            heading: `Labour (${report.labour.length}) · ${formatHours(s.labourHours)} · ${formatCurrency(allocatedLabour)}`,
            head: ['Labour', 'Weeks', 'Working days', 'Hours', 'Allocated cost'],
            body: report.labour.map((row) => [
              row.code ? `${row.name} (${row.code})` : row.name,
              String(row.weekCount),
              String(row.workedDays),
              formatHours(row.hours),
              formatCurrency(row.allocatedSalary),
            ]),
            emptyLabel: 'No allocated labour',
          },
          {
            heading: `Others (${allocatedOther.length}) · ${formatCurrency(allocatedOtherTotal)}`,
            head: ['Date', 'Category', 'Payable to', 'Description', 'Reference', 'Amount'],
            body: expensePdfRows(allocatedOther),
            emptyLabel: 'No other allocated expenses',
          },
        ],
      });
      return;
    }

    if (kind === 'expense_summary') {
      downloadCustomPeriodReportPdf({
        title: 'Expense summary',
        filename: `expense-summary-${fromKey}-to-${toKey}.pdf`,
        from,
        to,
        summaryLines: [
          { label: 'Total actual expenses', value: formatCurrency(paidTotal) },
          ...paidSummary.map((row) => ({ label: row.label, value: row.value })),
        ],
        sections: [],
      });
      return;
    }

    if (kind === 'collections') {
      downloadCustomPeriodReportPdf({
        title: 'Collection report',
        filename: `collection-report-${fromKey}-to-${toKey}.pdf`,
        from,
        to,
        summaryLines: [
          { label: 'Total collections', value: formatCurrency(collectionsTotal) },
          { label: 'Cash', value: formatCurrency(cashTotal) },
          { label: 'Other', value: formatCurrency(otherCollectionTotal) },
        ],
        sections: [
          {
            heading: `Cash (${cashCollections.length}) · ${formatCurrency(cashTotal)}`,
            head: ['Date', 'Job / Invoice', 'Customer', 'Rego', 'Type', 'Method', 'Description', 'Reference', 'Amount'],
            body: collectionPdfRows(cashCollections),
            emptyLabel: 'No cash collections',
          },
          {
            heading: `Other (${otherCollections.length}) · ${formatCurrency(otherCollectionTotal)}`,
            head: ['Date', 'Job / Invoice', 'Customer', 'Rego', 'Type', 'Method', 'Description', 'Reference', 'Amount'],
            body: collectionPdfRows(otherCollections),
            emptyLabel: 'No other collections',
          },
        ],
      });
      return;
    }

    downloadCustomPeriodReportPdf({
      title: 'Expense report',
      filename: `expense-report-${fromKey}-to-${toKey}.pdf`,
      from,
      to,
      summaryLines: [
        { label: 'Total actual expenses', value: formatCurrency(paidTotal) },
        { label: 'Labour', value: formatCurrency(paidLabourTotal) },
        { label: 'Other', value: formatCurrency(paidOtherTotal) },
      ],
      sections: [
        {
          heading: `Labour (${paidLabour.length}) · ${formatCurrency(paidLabourTotal)}`,
          head: ['Date', 'Category', 'Paid to', 'Description', 'Reference', 'Method', 'Amount'],
          body: expensePdfRows(paidLabour, true),
          emptyLabel: 'No labour expenses',
        },
        {
          heading: `Other (${paidOther.length}) · ${formatCurrency(paidOtherTotal)}`,
          head: ['Date', 'Category', 'Paid to', 'Description', 'Reference', 'Method', 'Amount'],
          body: expensePdfRows(paidOther, true),
          emptyLabel: 'No other expenses',
        },
      ],
    });
  };

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold text-lg">Custom reports</h2>
        <p className="text-sm text-gray-500">Choose a report and a Monday–Sunday week, or a custom date range. The report refreshes when the period changes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {REPORTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setKind(item.id)}
            className={`text-left rounded-lg border p-4 ${kind === item.id ? 'border-brand-600 bg-blue-50 ring-1 ring-brand-600' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <p className="font-semibold text-gray-900">{item.title}</p>
            <p className="text-sm text-gray-500 mt-1">{item.description}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            className="btn-secondary px-2"
            aria-label="Previous week"
            onClick={() => applyWeek(shiftWeek(from, -7))}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <label className="label">Week starting</label>
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => {
                if (!e.target.value) return;
                applyWeek(weekRangeContaining(parseInputDate(e.target.value)));
              }}
            />
          </div>
          <button
            type="button"
            className="btn-secondary px-2"
            aria-label="Next week"
            onClick={() => applyWeek(shiftWeek(from, 7))}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <p className="text-sm text-gray-500 self-center">
            {formatDate(from)} – {formatDate(to)} · Mon–Sun
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button type="button" onClick={load} disabled={loading} className="btn-primary">
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!report}
            className="btn-secondary flex items-center gap-2"
          >
            <FileDown className="w-4 h-4" /> Download PDF
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {report && (
        <div className="space-y-4 pt-2">
          <p className="text-xs text-gray-500">
            {REPORTS.find((r) => r.id === kind)?.title} · {formatDate(from)} – {formatDate(to)}
          </p>

          {kind === 'vehicles' && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Summary</h3>
                <SummaryLines rows={[
                  { label: 'Total vehicles in (qty)', value: String(report.summary.vehiclesIn) },
                  { label: 'Total job value (in)', value: formatCurrency(report.summary.vehiclesInRepairTotal) },
                  { label: 'Total vehicles out (qty)', value: String(report.summary.vehiclesOut) },
                  { label: 'Total job value (out)', value: formatCurrency(report.summary.vehiclesOutRepairTotal) },
                ]} />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Detail</h3>
              <VehicleTable title="Vehicles in" rows={report.vehiclesIn} dateLabel="Date" />
              <VehicleTable title="Vehicles out" rows={report.vehiclesOut} dateLabel="Out date" />
            </>
          )}

          {kind === 'completed' && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Summary</h3>
                <SummaryLines rows={[
                  { label: 'Total jobs', value: String((report.vehiclesCompleted || []).length), emphasis: true },
                  { label: 'Completed', value: String(report.summary.vehiclesCompletedOnly ?? (report.vehiclesCompleted || []).filter((row) => row.eventStatus !== 'CLOSED').length) },
                  { label: 'Closed', value: String(report.summary.vehiclesClosed ?? (report.vehiclesCompleted || []).filter((row) => row.eventStatus === 'CLOSED').length) },
                  { label: 'Total job value', value: formatCurrency(report.summary.vehiclesCompletedRepairTotal ?? moneySum((report.vehiclesCompleted || []).map((row) => ({ amount: row.repairPrice })))) },
                ]} />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Detail</h3>
              <p className="text-xs text-gray-500">Dated by the job closed date when the job was closed, otherwise by the completed date.</p>
              <VehicleTable
                title="Completed and closed"
                rows={report.vehiclesCompleted || []}
                dateLabel="Completed / closed date"
                emptyLabel="No completed or closed jobs"
              />
            </>
          )}

          {kind === 'allocated' && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Summary</h3>
                <SummaryLines rows={[
                  { label: 'Total allocated expenditure', value: formatCurrency(allocatedTotal), emphasis: true },
                  { label: 'Labour', value: formatCurrency(allocatedLabour) },
                  { label: 'Others', value: formatCurrency(allocatedOtherTotal) },
                ]} />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Detail</h3>
              <div className="overflow-x-auto border rounded-lg">
                <div className="px-3 py-2 bg-gray-50 text-sm font-semibold">
                  Labour ({report.labour.length}) · {formatHours(report.summary.labourHours)} · {formatCurrency(allocatedLabour)}
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left p-2">Labour</th>
                      <th className="text-right p-2">Weeks</th>
                      <th className="text-right p-2">Working days</th>
                      <th className="text-right p-2">Hours</th>
                      <th className="text-right p-2">Allocated cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.labour.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-gray-400">No allocated labour</td></tr>
                    ) : (
                      <>
                        {report.labour.map((row) => (
                          <tr key={row.employeeId} className="border-t">
                            <td className="p-2 font-medium">
                              {row.name}
                              {row.code ? <span className="text-gray-500 font-normal"> ({row.code})</span> : null}
                            </td>
                            <td className="p-2 text-right">{row.weekCount}</td>
                            <td className="p-2 text-right">{row.workedDays}</td>
                            <td className="p-2 text-right">{formatHours(row.hours)}</td>
                            <td className="p-2 text-right font-semibold">{formatCurrency(row.allocatedSalary)}</td>
                          </tr>
                        ))}
                        <tr className="border-t bg-gray-50 font-semibold">
                          <td className="p-2">Total</td>
                          <td className="p-2" />
                          <td className="p-2 text-right">{report.summary.labourDays}</td>
                          <td className="p-2 text-right">{formatHours(report.summary.labourHours)}</td>
                          <td className="p-2 text-right">{formatCurrency(allocatedLabour)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
              <ExpenseTable title="Others" rows={allocatedOther} partyLabel="Payable to" />
            </>
          )}

          {kind === 'actual' && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Summary</h3>
                <SummaryLines rows={[
                  { label: 'Total actual expenses', value: formatCurrency(paidTotal), emphasis: true },
                  { label: 'Labour', value: formatCurrency(paidLabourTotal) },
                  { label: 'Other', value: formatCurrency(paidOtherTotal) },
                ]} />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Detail</h3>
              <ExpenseTable title="Labour" rows={paidLabour} partyLabel="Paid to" showMethod />
              <ExpenseTable title="Other" rows={paidOther} partyLabel="Paid to" showMethod />
            </>
          )}

          {kind === 'expense_summary' && (
            <div className="overflow-x-auto border rounded-lg max-w-xl">
              <div className="px-3 py-2 bg-gray-50 text-sm font-semibold">
                Expense summary · {formatCurrency(paidTotal)}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left p-2">Category</th>
                    <th className="text-left p-2">Method</th>
                    <th className="text-right p-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paidSummary.length === 0 ? (
                    <tr><td colSpan={3} className="p-4 text-center text-gray-400">No paid expenses</td></tr>
                  ) : (
                    <>
                      {paidSummary.map((row) => (
                        <tr key={row.label} className="border-t">
                          <td className="p-2">{row.category}</td>
                          <td className="p-2">{row.method}</td>
                          <td className="p-2 text-right font-medium">{row.value}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-gray-50 font-semibold">
                        <td className="p-2" colSpan={2}>Total actual expenses</td>
                        <td className="p-2 text-right">{formatCurrency(paidTotal)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {kind === 'collections' && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Summary</h3>
                <SummaryLines rows={[
                  { label: 'Total collections', value: formatCurrency(collectionsTotal), emphasis: true },
                  { label: 'Cash', value: formatCurrency(cashTotal) },
                  { label: 'Other', value: formatCurrency(otherCollectionTotal) },
                ]} />
              </div>
              <h3 className="text-sm font-semibold text-gray-800">Detail</h3>
              <CollectionTable title="Cash" rows={cashCollections} />
              <CollectionTable title="Other" rows={otherCollections} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
