import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Search, Trash2, X } from 'lucide-react';
import { customersApi, employeesApi, financeApi, suppliersApi } from '../lib/api';
import { downloadFinancePeriodReportPdf, downloadWorkshopReportPdf } from '../lib/reportPdf';
import CustomPeriodReports from '../components/CustomPeriodReports';
import { Customer, Employee, Supplier, formatCurrency, formatDate, formatStatus } from '../lib/types';

type Tab = 'weekly' | 'overview' | 'collections' | 'expenses' | 'report';
type CollectionMode = 'job' | 'additional';

interface PayablePartySummary {
  id: string;
  kind: 'labour' | 'salary' | 'supplier' | 'outsource' | 'other' | 'unassigned' | 'employee';
  name: string;
  code?: string | null;
  amount: number;
  originalAmount?: number;
  paidAmount?: number;
  count: number;
}

interface PayableTypeSummary {
  id: string;
  label: string;
  amount: number;
  count: number;
}

interface LabourHoursPerson {
  employeeId: string;
  name: string;
  code?: string | null;
  workedDays: number;
  hours: number;
  allocatedSalary: number;
  weekCount: number;
}

interface LabourHoursTotals {
  workedDays: number;
  hours: number;
  allocatedSalary: number;
}

interface WorkshopVehicleRow {
  id: string;
  date?: string | null;
  jobNumber: string;
  customer: string;
  registrationNo: string;
  vehicle: string;
  status: string;
  jobType: string;
  repairPrice: number;
}

interface WorkshopExpenseRow {
  id: string;
  date?: string | null;
  category: string;
  materialType?: string | null;
  outsourceType?: string | null;
  otherType?: string | null;
  description: string;
  paymentMethod?: string | null;
  supplier?: string | null;
  supplierCode?: string | null;
  employee?: string | null;
  employeeCode?: string | null;
  isPayable: boolean;
  amount: number;
}

interface WorkshopReport {
  from: string;
  to: string;
  summary: {
    vehiclesIn: number;
    vehiclesInRepairTotal: number;
    vehiclesOut: number;
    vehiclesOutRepairTotal: number;
    labourPeople: number;
    labourDays: number;
    labourHours: number;
    allocatedLabourCost: number;
    otherExpensesPaid: number;
    otherExpensesPayable: number;
    totalExpenses: number;
  };
  labour: LabourHoursPerson[];
  vehiclesIn: WorkshopVehicleRow[];
  vehiclesOut: WorkshopVehicleRow[];
  vehiclesCompleted?: WorkshopVehicleRow[];
  expensesPaid: WorkshopExpenseRow[];
  expensesPayable: WorkshopExpenseRow[];
  collections?: Array<{ date?: string | null }>;
}

interface WeeklySummary {
  from: string;
  to: string;
  jobsReceived: number;
  jobsOut: number;
  jobsCompleted: number;
  totalSales: number;
  invoiceCount: number;
  totalPaymentsReceived: number;
  cashCollected: number;
  otherPaymentsCollected: number;
  labourExpenses: number;
  materialExpenses: number;
  otherExpenses: number;
  totalExpenses: number;
  totalPayables: number;
  labourPayableDue?: number;
  otherPayablesDue?: number;
  payablesByParty?: PayablePartySummary[];
  payablesByType?: PayableTypeSummary[];
  paidByParty?: PayablePartySummary[];
  labourByEmployee?: LabourHoursPerson[];
  labourHoursTotals?: LabourHoursTotals;
  netProfit: number;
  isProfit: boolean;
}

type WeeklyMetric =
  | 'jobs_received'
  | 'jobs_out'
  | 'jobs_completed'
  | 'sales'
  | 'payments'
  | 'cash'
  | 'other_payments'
  | 'expenses'
  | 'labour_expenses'
  | 'material_expenses'
  | 'other_expenses'
  | 'payables'
  | 'paid_expenses'
  | 'labour_hours'
  | 'net_profit';

interface WeeklyDetailRow {
  id: string;
  date?: string;
  jobNumber?: string;
  invoiceNumber?: string;
  customer?: string;
  registrationNo?: string;
  status?: string;
  jobType?: string;
  collectionType?: string;
  paymentMethod?: string | null;
  category?: string;
  materialType?: string | null;
  outsourceType?: string | null;
  otherType?: string | null;
  description?: string;
  entryType?: string;
  detail?: string;
  notes?: string | null;
  reference?: string | null;
  isPayable?: boolean;
  supplier?: string | null;
  supplierCode?: string | null;
  employee?: string | null;
  employeeCode?: string | null;
  partyId?: string;
  amount?: number;
  hours?: number;
  workedDays?: number;
  amountPaid?: number;
  balance?: number;
  paymentStatus?: string;
  paymentLabel?: string;
}

interface WeeklyDetails {
  metric: string;
  title: string;
  from: string;
  to: string;
  columns: string[];
  rows: WeeklyDetailRow[];
  total?: number;
  paymentTotal?: number;
  expenseTotal?: number;
  taxTotal?: number;
  cashTotal?: number;
  receivableTotal?: number;
  labourHoursTotals?: LabourHoursTotals;
  byParty?: PayablePartySummary[];
  byType?: PayableTypeSummary[];
  partyId?: string | null;
  party?: {
    id: string;
    kind: string;
    name: string;
    code?: string | null;
    originalAmount?: number;
    paidAmount?: number;
    amount?: number;
  } | null;
}

interface CollectionJobOption {
  id: string;
  jobNumber: string;
  status: string;
  jobTotal: number;
  collected: number;
  amountPaid: number;
  balance: number;
  isPaid: boolean;
  paymentStatus: string;
  customer?: { id: string; name: string; phone?: string };
  vehicle?: { registrationNo: string; make?: string; model?: string };
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number;
    amountPaid: number;
    paymentStatus: string;
  } | null;
}

interface CollectionRow {
  id: string;
  amount: number;
  paymentMethod: string;
  collectionType: string;
  paidAt: string;
  createdAt?: string | null;
  reference?: string | null;
  notes?: string | null;
  job?: {
    jobNumber: string;
    customer?: { name: string };
    vehicle?: { registrationNo: string };
  } | null;
  invoice?: {
    invoiceNumber: string;
    notes?: string | null;
    customer?: { name: string };
    lineItems?: { description: string }[];
  } | null;
}

interface ExpenseRow {
  id: string;
  category: string;
  materialType?: string | null;
  outsourceType?: string | null;
  otherType?: string | null;
  description: string;
  amount: number;
  expenseDate: string;
  createdAt?: string | null;
  isPayable?: boolean;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
  jobId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
  job?: {
    id: string;
    jobNumber: string;
    customer?: { name: string } | null;
    vehicle?: { registrationNo: string } | null;
  } | null;
  supplier?: {
    id: string;
    supplierCode: string;
    name: string;
    phone?: string | null;
  } | null;
  employee?: {
    id: string;
    employeeCode: string;
    name: string;
    jobTitle?: string | null;
    phone?: string | null;
  } | null;
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
];

const COLLECTION_TYPES = [
  { value: 'ADVANCE', label: 'Advance' },
  { value: 'SECOND', label: 'Second payment' },
  { value: 'FINAL', label: 'Final payment' },
  { value: 'OTHER', label: 'Other' },
];

const EXPENSE_CATEGORIES = [
  { value: 'LABOUR', label: 'Labour' },
  { value: 'MATERIAL', label: 'Material' },
  { value: 'OUTSOURCE', label: 'Out source' },
  { value: 'OTHER', label: 'Other operating' },
];

const MATERIAL_TYPES = [
  { value: 'PAINT', label: 'Paint' },
  { value: 'PARTS', label: 'Parts' },
  { value: 'CONSUMABLES', label: 'Consumables' },
  { value: 'OTHER', label: 'Other' },
];

const OUTSOURCE_TYPES = [
  { value: 'MECHANIC', label: 'Mechanic' },
  { value: 'OTHER', label: 'Other' },
];

const OTHER_EXPENSE_TYPES = [
  { value: 'UTILITY', label: 'Utility' },
  { value: 'RENT', label: 'Rent' },
  { value: 'SALARY', label: 'Salary' },
  { value: 'GOOGLE', label: 'Google / Ads' },
  { value: 'FUEL', label: 'Fuel' },
  { value: 'INTERNET', label: 'Internet / Phone' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'SOFTWARE', label: 'Software / Subscriptions' },
  { value: 'BANK_FEES', label: 'Bank fees' },
  { value: 'OFFICE', label: 'Office supplies' },
  { value: 'OTHER', label: 'Other' },
];

type PeriodMode = 'week' | 'month' | 'custom';

function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseInputDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatInputDate(value: string) {
  return parseInputDate(value).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
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

/** Inclusive Monday–Sunday week containing the given calendar day. */
function weekRangeContaining(anchor: Date) {
  const start = mondayOf(anchor);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: toInputDate(start), to: toInputDate(end) };
}

function monthRangeContaining(anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: toInputDate(start), to: toInputDate(end) };
}

function currentWeekRange() {
  return weekRangeContaining(new Date());
}

function formatMethod(method?: string | null) {
  if (!method) return '—';
  return method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCollectionType(type: string) {
  const found = COLLECTION_TYPES.find((t) => t.value === type);
  return found?.label || type;
}

function isLabourParty(kind?: string) {
  return kind === 'labour' || kind === 'salary' || kind === 'employee';
}

function formatPayableKind(kind?: string) {
  switch (kind) {
    case 'labour':
    case 'employee':
      return 'Labour';
    case 'salary':
      return 'Salary';
    case 'outsource':
      return 'Out source';
    case 'supplier':
      return 'Supplier';
    case 'other':
      return 'Other';
    default:
      return 'Unassigned';
  }
}

function collectionSearchText(row: CollectionRow) {
  return [
    row.job?.jobNumber,
    row.invoice?.invoiceNumber,
    row.job?.customer?.name,
    row.invoice?.customer?.name,
    row.job?.vehicle?.registrationNo,
    row.invoice?.lineItems?.[0]?.description,
    row.notes,
    row.reference,
    formatCollectionType(row.collectionType),
    formatMethod(row.paymentMethod),
  ].filter(Boolean).join(' ').toLowerCase();
}

function expenseSearchText(row: ExpenseRow) {
  return [
    row.description,
    row.employee?.name,
    row.employee?.employeeCode,
    row.supplier?.name,
    row.supplier?.supplierCode,
    row.job?.jobNumber,
    row.job?.vehicle?.registrationNo,
    row.job?.customer?.name,
    row.notes,
    row.reference,
    formatCategory(row.category, row.materialType, row.otherType, row.outsourceType),
    formatMethod(row.paymentMethod),
    row.isPayable ? 'payable' : 'paid',
  ].filter(Boolean).join(' ').toLowerCase();
}

function formatCategory(
  category: string,
  materialType?: string | null,
  otherType?: string | null,
  outsourceType?: string | null,
) {
  const base = EXPENSE_CATEGORIES.find((c) => c.value === category)?.label || category;
  if (category === 'MATERIAL' && materialType) {
    const mat = MATERIAL_TYPES.find((m) => m.value === materialType)?.label || materialType;
    return `${base} · ${mat}`;
  }
  if (category === 'OUTSOURCE' && outsourceType) {
    const out = OUTSOURCE_TYPES.find((o) => o.value === outsourceType)?.label || outsourceType;
    return `${base} · ${out}`;
  }
  if (category === 'OTHER' && otherType) {
    const other = OTHER_EXPENSE_TYPES.find((o) => o.value === otherType)?.label || otherType;
    return `${base} · ${other}`;
  }
  return base;
}

function formatPayableParty(row: {
  employee?: string | null;
  employeeCode?: string | null;
  supplier?: string | null;
  supplierCode?: string | null;
  detail?: string | null;
}) {
  if (row.employee) {
    return row.employeeCode ? `${row.employee} (${row.employeeCode})` : row.employee;
  }
  if (row.supplier) {
    return row.supplierCode ? `${row.supplier} (${row.supplierCode})` : row.supplier;
  }
  return row.detail || '—';
}

function partyDueAmounts(party: PayablePartySummary) {
  const payable = party.originalAmount ?? party.amount;
  const paid = party.paidAmount ?? 0;
  const due = party.amount;
  return { payable, paid, due };
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

function LabourHoursSection({
  rows,
  totals,
  onViewAll,
}: {
  rows: LabourHoursPerson[];
  totals?: LabourHoursTotals;
  onViewAll?: () => void;
}) {
  if (!rows.length) return null;
  const summed = totals || {
    workedDays: rows.reduce((s, r) => s + r.workedDays, 0),
    hours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
    allocatedSalary: Math.round(rows.reduce((s, r) => s + r.allocatedSalary, 0) * 100) / 100,
  };
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Labour hours</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Working days, hours, and allocated salary (hours × rate) for weekly hours in this period
          </p>
        </div>
        {onViewAll ? (
          <button type="button" onClick={onViewAll} className="text-xs text-indigo-700 hover:underline">
            View weeks
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg bg-indigo-50 px-3 py-2">
          <p className="text-xs text-indigo-700">Working days</p>
          <p className="font-semibold text-indigo-900">{summed.workedDays}</p>
        </div>
        <div className="rounded-lg bg-indigo-50 px-3 py-2">
          <p className="text-xs text-indigo-700">Working hours</p>
          <p className="font-semibold text-indigo-900">{formatHours(summed.hours)}</p>
        </div>
        <div className="rounded-lg bg-indigo-50 px-3 py-2">
          <p className="text-xs text-indigo-700">Allocated salary</p>
          <p className="font-semibold text-indigo-900">{formatCurrency(summed.allocatedSalary)}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-2">Labour</th>
              <th className="text-right p-2">Weeks</th>
              <th className="text-right p-2">Working days</th>
              <th className="text-right p-2">Hours</th>
              <th className="text-right p-2">Allocated salary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId} className="border-t">
                <td className="p-2 font-medium">
                  {row.name}
                  {row.code ? <span className="text-gray-500 font-normal"> ({row.code})</span> : null}
                </td>
                <td className="p-2 text-right text-gray-600">{row.weekCount}</td>
                <td className="p-2 text-right">{row.workedDays}</td>
                <td className="p-2 text-right">{formatHours(row.hours)}</td>
                <td className="p-2 text-right font-semibold">{formatCurrency(row.allocatedSalary)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeriodOverviewDashboard({
  summary,
  from,
  to,
  onOpenDetails,
  onOpenPayableParty,
  onOpenPaidParty,
}: {
  summary: WeeklySummary;
  from: string;
  to: string;
  onOpenDetails: (metric: WeeklyMetric, party?: string) => void;
  onOpenPayableParty: (party: PayablePartySummary) => void;
  onOpenPaidParty: (party: PayablePartySummary) => void;
}) {
  const allocatedLabour = summary.labourHoursTotals?.allocatedSalary || 0;
  const labourDue = summary.labourPayableDue
    ?? (summary.payablesByParty || [])
      .filter((p) => isLabourParty(p.kind))
      .reduce((s, p) => s + (p.amount || 0), 0);
  const otherPayables = (summary.payablesByParty || []).filter((p) => !isLabourParty(p.kind));
  const otherDue = summary.otherPayablesDue
    ?? otherPayables.reduce((s, p) => s + (p.amount || 0), 0);
  const paidByParty = summary.paidByParty || [];
  const paidTotal = paidByParty.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-xs text-gray-500">Selected period</p>
        <p className="text-lg font-semibold text-gray-900">{formatDate(from)} – {formatDate(to)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button type="button" onClick={() => onOpenDetails('jobs_received')} className="bg-blue-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-blue-300 transition">
          <p className="text-sm text-blue-700">In vehicles</p>
          <p className="text-2xl font-bold text-blue-900">{summary.jobsReceived}</p>
          <p className="text-xs text-blue-700 mt-1">Jobs received in this period</p>
        </button>
        <button type="button" onClick={() => onOpenDetails('jobs_out')} className="bg-green-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-green-300 transition">
          <p className="text-sm text-green-700">Out vehicles</p>
          <p className="text-2xl font-bold text-green-900">{summary.jobsOut ?? 0}</p>
          <p className="text-xs text-green-700 mt-1">Jobs out in this period</p>
        </button>
        <button type="button" onClick={() => onOpenDetails('payments')} className="bg-teal-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-teal-300 transition">
          <p className="text-sm text-teal-700">Collections</p>
          <p className="text-2xl font-bold text-teal-900">{formatCurrency(summary.totalPaymentsReceived)}</p>
          <p className="text-xs text-teal-700 mt-1">
            Cash {formatCurrency(summary.cashCollected)} · Other {formatCurrency(summary.otherPaymentsCollected)}
          </p>
        </button>
        <button type="button" onClick={() => onOpenDetails('labour_hours')} className="bg-indigo-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-indigo-300 transition">
          <p className="text-sm text-indigo-700">Allocated labour (payable)</p>
          <p className="text-2xl font-bold text-indigo-900">{formatCurrency(allocatedLabour)}</p>
          <p className="text-xs text-indigo-700 mt-1">Hours × rate · labour due {formatCurrency(labourDue)}</p>
        </button>
        <button type="button" onClick={() => onOpenDetails('payables')} className="bg-orange-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-orange-300 transition">
          <p className="text-sm text-orange-700">Other parties payables</p>
          <p className="text-2xl font-bold text-orange-900">{formatCurrency(otherDue)}</p>
          <p className="text-xs text-orange-700 mt-1">Suppliers, out source, other</p>
        </button>
        <button type="button" onClick={() => onOpenDetails('paid_expenses')} className="bg-amber-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-amber-300 transition">
          <p className="text-sm text-amber-700">Paid expenses</p>
          <p className="text-2xl font-bold text-amber-900">{formatCurrency(paidTotal || summary.totalExpenses)}</p>
          <p className="text-xs text-amber-700 mt-1">Paid in this period, by party</p>
        </button>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Collections</h2>
            <p className="text-xs text-gray-500 mt-0.5">Money received in the selected period</p>
          </div>
          <button type="button" onClick={() => onOpenDetails('payments')} className="text-xs text-teal-700 hover:underline">
            View all
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button type="button" onClick={() => onOpenDetails('payments')} className="rounded-lg bg-teal-50 px-3 py-2 text-left">
            <p className="text-xs text-teal-700">Total collection</p>
            <p className="font-semibold text-teal-900">{formatCurrency(summary.totalPaymentsReceived)}</p>
          </button>
          <button type="button" onClick={() => onOpenDetails('cash')} className="rounded-lg bg-lime-50 px-3 py-2 text-left">
            <p className="text-xs text-lime-700">Cash</p>
            <p className="font-semibold text-lime-900">{formatCurrency(summary.cashCollected)}</p>
          </button>
          <button type="button" onClick={() => onOpenDetails('other_payments')} className="rounded-lg bg-sky-50 px-3 py-2 text-left">
            <p className="text-xs text-sky-700">Other payments</p>
            <p className="font-semibold text-sky-900">{formatCurrency(summary.otherPaymentsCollected)}</p>
          </button>
        </div>
      </div>

      <LabourHoursSection
        rows={summary.labourByEmployee || []}
        totals={summary.labourHoursTotals}
        onViewAll={() => onOpenDetails('labour_hours')}
      />

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Other parties payables</h2>
            <p className="text-xs text-gray-500 mt-0.5">Due for suppliers, out source, and other parties (not labour)</p>
          </div>
          <button type="button" onClick={() => onOpenDetails('payables')} className="text-xs text-orange-700 hover:underline">
            View all
          </button>
        </div>
        {otherPayables.length === 0 ? (
          <p className="text-sm text-gray-400">No other-party payables for this period end date.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left p-2">Party</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-right p-2">Items</th>
                  <th className="text-right p-2">Payable</th>
                  <th className="text-right p-2">Paid</th>
                  <th className="text-right p-2">Due</th>
                </tr>
              </thead>
              <tbody>
                {otherPayables.map((party) => {
                  const { payable, paid, due } = partyDueAmounts(party);
                  return (
                    <tr
                      key={party.id}
                      className="border-t hover:bg-orange-50/70 cursor-pointer"
                      onClick={() => onOpenPayableParty(party)}
                    >
                      <td className="p-2 font-medium text-orange-900 underline-offset-2 hover:underline">
                        {party.name}
                        {party.code ? <span className="text-gray-500 font-normal"> ({party.code})</span> : null}
                      </td>
                      <td className="p-2 text-gray-600">{formatPayableKind(party.kind)}</td>
                      <td className="p-2 text-right text-gray-600">{party.count}</td>
                      <td className="p-2 text-right">{formatCurrency(payable)}</td>
                      <td className="p-2 text-right">{formatCurrency(paid)}</td>
                      <td className="p-2 text-right font-semibold text-orange-900">{formatCurrency(due)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50 font-medium">
                  <td className="p-2" colSpan={5}>Total due</td>
                  <td className="p-2 text-right text-orange-900">{formatCurrency(otherDue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Paid expenses by party</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cash and other paid expenses in the selected period</p>
          </div>
          <button type="button" onClick={() => onOpenDetails('paid_expenses')} className="text-xs text-amber-700 hover:underline">
            View all
          </button>
        </div>
        {paidByParty.length === 0 ? (
          <p className="text-sm text-gray-400">No paid expenses in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left p-2">Party</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-right p-2">Items</th>
                  <th className="text-right p-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {paidByParty.map((party) => (
                  <tr
                    key={party.id}
                    className="border-t hover:bg-amber-50/70 cursor-pointer"
                    onClick={() => onOpenPaidParty(party)}
                  >
                    <td className="p-2 font-medium text-amber-900 underline-offset-2 hover:underline">
                      {party.name}
                      {party.code ? <span className="text-gray-500 font-normal"> ({party.code})</span> : null}
                    </td>
                    <td className="p-2 text-gray-600">{formatPayableKind(party.kind)}</td>
                    <td className="p-2 text-right text-gray-600">{party.count}</td>
                    <td className="p-2 text-right font-semibold">{formatCurrency(party.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50 font-medium">
                  <td className="p-2" colSpan={3}>Total paid</td>
                  <td className="p-2 text-right">{formatCurrency(paidTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function moneySum(rows: { amount: number }[]) {
  return Math.round(rows.reduce((sum, row) => sum + (row.amount || 0), 0) * 100) / 100;
}

function timeValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Latest dated row first; same calendar moment keeps the most recently created row first. */
function latestFirst<T>(
  items: T[],
  dateOf: (item: T) => string | null | undefined,
  createdOf?: (item: T) => string | null | undefined,
) {
  return [...items].sort((a, b) => {
    const dateDiff = timeValue(dateOf(b)) - timeValue(dateOf(a));
    if (dateDiff !== 0) return dateDiff;
    if (!createdOf) return 0;
    return timeValue(createdOf(b)) - timeValue(createdOf(a));
  });
}

function isLabourExpense(row: WorkshopExpenseRow) {
  return row.category === 'LABOUR';
}

function isMaterialExpense(row: WorkshopExpenseRow) {
  return row.category === 'MATERIAL';
}

function isRentExpense(row: WorkshopExpenseRow) {
  return row.category === 'OTHER' && row.otherType === 'RENT';
}

function rollupByLabel(rows: WorkshopExpenseRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const label = formatCategory(row.category, row.materialType, row.otherType, row.outsourceType);
    map.set(label, Math.round(((map.get(label) || 0) + row.amount) * 100) / 100);
  }
  return Array.from(map.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function periodSummary(report: WorkshopReport) {
  const allocated = report.expensesPayable.filter((row) => !isLabourExpense(row));
  const allocatedOther = rollupByLabel(allocated.filter((row) => !isRentExpense(row)));
  const paidLabour = report.expensesPaid.filter(isLabourExpense);
  const paidMaterials = report.expensesPaid.filter(isMaterialExpense);
  const paidRent = report.expensesPaid.filter(isRentExpense);
  const paidOther = report.expensesPaid.filter((row) => !isLabourExpense(row) && !isMaterialExpense(row) && !isRentExpense(row));
  return {
    allocated,
    allocatedTotal: moneySum(allocated),
    allocatedLines: [
      { label: 'Rent', amount: moneySum(allocated.filter(isRentExpense)) },
      ...(allocatedOther.length ? allocatedOther : [{ label: 'Other', amount: 0 }]),
    ],
    paidTotal: moneySum(report.expensesPaid),
    paidLines: [
      { label: 'Labour', amount: moneySum(paidLabour) },
      { label: 'Materials', amount: moneySum(paidMaterials) },
      { label: 'Rent', amount: moneySum(paidRent) },
      { label: 'Others', amount: moneySum(paidOther) },
    ],
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

function WorkshopReportView({ report }: { report: WorkshopReport }) {
  const s = report.summary;
  const grouped = periodSummary(report);
  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        Finance report · {formatDate(report.from)} – {formatDate(report.to)}
      </p>

      <div className="card space-y-5">
        <h2 className="font-semibold">Summary</h2>

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Vehicles</h3>
          <SummaryLines rows={[
            { label: 'Total vehicles in (qty)', value: String(s.vehiclesIn) },
            { label: 'Total job value (in)', value: formatCurrency(s.vehiclesInRepairTotal) },
            { label: 'Total vehicles out (qty)', value: String(s.vehiclesOut) },
            { label: 'Total job value (out)', value: formatCurrency(s.vehiclesOutRepairTotal) },
          ]} />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Allocated labour</h3>
          <SummaryLines rows={[
            { label: 'Total allocated labour hours', value: formatHours(s.labourHours) },
            { label: 'Labour cost', value: formatCurrency(s.allocatedLabourCost) },
            { label: 'No. of labours worked', value: String(s.labourPeople) },
          ]} />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Allocated expenses (except labour)</h3>
          <SummaryLines rows={[
            { label: 'Total allocated expenses', value: formatCurrency(grouped.allocatedTotal), emphasis: true },
            ...grouped.allocatedLines.map((row) => ({ label: row.label, value: formatCurrency(row.amount) })),
          ]} />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Paid expenses</h3>
          <SummaryLines rows={[
            { label: 'Total paid expenses', value: formatCurrency(grouped.paidTotal), emphasis: true },
            ...grouped.paidLines.map((row) => ({ label: row.label, value: formatCurrency(row.amount) })),
          ]} />
        </div>
      </div>

      <h2 className="font-semibold text-gray-900">Breakdown</h2>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">
          Vehicles in ({report.vehiclesIn.length}) · {formatCurrency(s.vehiclesInRepairTotal)}
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Job</th>
              <th className="text-left p-2">Customer</th>
              <th className="text-left p-2">Rego</th>
              <th className="text-left p-2">Vehicle</th>
              <th className="text-left p-2">Status</th>
              <th className="text-right p-2">Job value</th>
            </tr>
          </thead>
          <tbody>
            {report.vehiclesIn.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-center text-gray-400">No vehicles in</td></tr>
            ) : report.vehiclesIn.map((row) => (
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

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">
          Vehicles out ({report.vehiclesOut.length}) · {formatCurrency(s.vehiclesOutRepairTotal)}
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-2">Out date</th>
              <th className="text-left p-2">Job</th>
              <th className="text-left p-2">Customer</th>
              <th className="text-left p-2">Rego</th>
              <th className="text-left p-2">Vehicle</th>
              <th className="text-left p-2">Status</th>
              <th className="text-right p-2">Job value</th>
            </tr>
          </thead>
          <tbody>
            {report.vehiclesOut.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-center text-gray-400">No vehicles out</td></tr>
            ) : report.vehiclesOut.map((row) => (
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

      <div className="card overflow-x-auto space-y-3">
        <div>
          <h2 className="font-semibold">Labour who worked</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Hours and allocated cost (hours × rate) for weekly labour in this period
          </p>
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
              <tr><td colSpan={5} className="p-4 text-center text-gray-400">No labour hours</td></tr>
            ) : (
              <>
                {report.labour.map((row) => (
                  <tr key={row.employeeId} className="border-t">
                    <td className="p-2 font-medium">
                      {row.name}
                      {row.code ? <span className="text-gray-500 font-normal"> ({row.code})</span> : null}
                    </td>
                    <td className="p-2 text-right text-gray-600">{row.weekCount}</td>
                    <td className="p-2 text-right">{row.workedDays}</td>
                    <td className="p-2 text-right">{formatHours(row.hours)}</td>
                    <td className="p-2 text-right font-semibold">{formatCurrency(row.allocatedSalary)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-gray-50 font-semibold">
                  <td className="p-2">Total</td>
                  <td className="p-2" />
                  <td className="p-2 text-right">{s.labourDays}</td>
                  <td className="p-2 text-right">{formatHours(s.labourHours)}</td>
                  <td className="p-2 text-right">{formatCurrency(s.allocatedLabourCost)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">
          Allocated expenses except labour ({grouped.allocated.length}) · {formatCurrency(grouped.allocatedTotal)}
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Category</th>
              <th className="text-left p-2">Payable to</th>
              <th className="text-left p-2">Description</th>
              <th className="text-right p-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {grouped.allocated.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-gray-400">No allocated expenses</td></tr>
            ) : grouped.allocated.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                <td className="p-2">{formatCategory(row.category, row.materialType, row.otherType, row.outsourceType)}</td>
                <td className="p-2">{formatPayableParty(row)}</td>
                <td className="p-2">{row.description || '—'}</td>
                <td className="p-2 text-right font-medium">{formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">
          Paid expenses ({report.expensesPaid.length}) · {formatCurrency(grouped.paidTotal)}
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Category</th>
              <th className="text-left p-2">Paid to</th>
              <th className="text-left p-2">Description</th>
              <th className="text-left p-2">Method</th>
              <th className="text-right p-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {report.expensesPaid.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-gray-400">No paid expenses</td></tr>
            ) : report.expensesPaid.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                <td className="p-2">{formatCategory(row.category, row.materialType, row.otherType, row.outsourceType)}</td>
                <td className="p-2">{formatPayableParty(row)}</td>
                <td className="p-2">{row.description || '—'}</td>
                <td className="p-2">{formatMethod(row.paymentMethod)}</td>
                <td className="p-2 text-right font-medium">{formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FinancePage() {
  const week = useMemo(() => currentWeekRange(), []);
  const [tab, setTab] = useState<Tab>('weekly');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('week');
  const [from, setFrom] = useState(week.from);
  const [to, setTo] = useState(week.to);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [expensesTotalCount, setExpensesTotalCount] = useState(0);
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionTypeFilter, setCollectionTypeFilter] = useState('');
  const [collectionMethodFilter, setCollectionMethodFilter] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('');
  const [expenseStatusFilter, setExpenseStatusFilter] = useState('');
  const [expenseMethodFilter, setExpenseMethodFilter] = useState('');
  const [collectionJobs, setCollectionJobs] = useState<CollectionJobOption[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [collectionMode, setCollectionMode] = useState<CollectionMode>('job');
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editingCollectionJobLabel, setEditingCollectionJobLabel] = useState('');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [collectionForm, setCollectionForm] = useState({
    amount: '',
    paymentMethod: 'CASH',
    collectionType: 'FINAL',
    paidAt: toInputDate(new Date()),
    reference: '',
    notes: '',
    customerId: '',
    description: '',
    addGst: false,
  });
  const [jobSearch, setJobSearch] = useState('');
  const [backfilling, setBackfilling] = useState(false);

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    category: 'LABOUR',
    materialType: 'PARTS',
    outsourceType: 'MECHANIC',
    otherType: 'UTILITY',
    description: '',
    amount: '',
    expenseDate: toInputDate(new Date()),
    isPayable: false,
    paymentMethod: 'CASH',
    reference: '',
    notes: '',
    jobId: '',
    supplierId: '',
    employeeId: '',
  });
  const [expenseJobSearch, setExpenseJobSearch] = useState('');
  const [expenseJobOptions, setExpenseJobOptions] = useState<CollectionJobOption[]>([]);
  const [expenseSelectedJobLabel, setExpenseSelectedJobLabel] = useState('');
  const [supplierOptions, setSupplierOptions] = useState<Supplier[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<Employee[]>([]);

  const [detailMetric, setDetailMetric] = useState<WeeklyMetric | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [details, setDetails] = useState<WeeklyDetails | null>(null);
  const [periodReport, setPeriodReport] = useState<{
    from: string;
    to: string;
    summary: WeeklySummary;
    jobsReceived: WeeklyDetailRow[];
    jobsOut: WeeklyDetailRow[];
    collections: WeeklyDetailRow[];
    expenses: WeeklyDetailRow[];
    payables: WeeklyDetailRow[];
  } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [workshopReport, setWorkshopReport] = useState<WorkshopReport | null>(null);
  const [workshopLoading, setWorkshopLoading] = useState(false);
  const [reportView, setReportView] = useState<'period' | 'collections' | 'custom'>('period');

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await financeApi.weeklySummary({ from, to });
      setSummary(res.data.data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to load weekly summary');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const openWeeklyDetails = async (metric: WeeklyMetric, party?: string) => {
    setDetailMetric(metric);
    setDetailLoading(true);
    setDetails(null);
    setError('');
    try {
      const res = await financeApi.weeklyDetails({ metric, from, to, party });
      const data = res.data.data;
      setDetails(data?.rows
        ? { ...data, rows: latestFirst(data.rows, (row: WeeklyDetailRow) => row.date) }
        : data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to load details');
      setDetailMetric(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openPayablePartyDetails = (party: PayablePartySummary) => {
    void openWeeklyDetails('payables', party.id);
  };

  const closeWeeklyDetails = () => {
    setDetailMetric(null);
    setDetails(null);
  };

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await financeApi.listCollections({ from, to, limit: '10000' });
      setCollections(latestFirst(res.data.data.collections || [], (row) => row.paidAt, (row) => row.createdAt));
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await financeApi.listExpenses({ from, to, limit: '10000' });
      setExpenses(latestFirst(res.data.data.expenses || [], (row) => row.expenseDate, (row) => row.createdAt));
      setExpensesTotalCount(res.data.data.total ?? res.data.data.expenses?.length ?? 0);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const loadPeriodReport = useCallback(async () => {
    setReportLoading(true);
    setError('');
    try {
      const res = await financeApi.periodReport({ from, to });
      const data = res.data.data;
      setPeriodReport(data ? {
        ...data,
        jobsReceived: latestFirst(data.jobsReceived || [], (row) => row.date),
        jobsOut: latestFirst(data.jobsOut || [], (row) => row.date),
        collections: latestFirst(data.collections || [], (row) => row.date),
        expenses: latestFirst(data.expenses || [], (row) => row.date),
        payables: latestFirst(data.payables || [], (row) => row.date),
      } : data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to load finance report');
      setPeriodReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [from, to]);

  const loadWorkshopReport = useCallback(async () => {
    setWorkshopLoading(true);
    setError('');
    try {
      const res = await financeApi.workshopReport({ from, to });
      const data = res.data.data as (WorkshopReport & {
        vehiclesCompleted?: WorkshopVehicleRow[];
        collections?: Array<{ date?: string | null }>;
      }) | null;
      setWorkshopReport(data ? {
        ...data,
        vehiclesIn: latestFirst(data.vehiclesIn || [], (row) => row.date),
        vehiclesOut: latestFirst(data.vehiclesOut || [], (row) => row.date),
        vehiclesCompleted: latestFirst(data.vehiclesCompleted || [], (row) => row.date),
        expensesPaid: latestFirst(data.expensesPaid || [], (row) => row.date),
        expensesPayable: latestFirst(data.expensesPayable || [], (row) => row.date),
        collections: latestFirst(data.collections || [], (row) => row.date),
      } : data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to load workshop report');
      setWorkshopReport(null);
    } finally {
      setWorkshopLoading(false);
    }
  }, [from, to]);

  const loadCollectionJobs = useCallback(async (search?: string) => {
    const res = await financeApi.listCollectionJobs({
      limit: '300',
      ...(search ? { search } : {}),
    });
    setCollectionJobs(res.data.data.jobs || []);
  }, []);

  useEffect(() => {
    if (tab === 'weekly' || tab === 'overview') loadSummary();
    if (tab === 'collections') loadCollections();
    if (tab === 'expenses') loadExpenses();
    if (tab === 'report' && reportView === 'period') loadWorkshopReport();
    if (tab === 'report' && reportView === 'collections') loadPeriodReport();
  }, [tab, reportView, loadSummary, loadCollections, loadExpenses, loadPeriodReport, loadWorkshopReport]);

  useEffect(() => {
    if (!showCollectionForm || editingCollectionId) return;
    if (collectionMode === 'job') loadCollectionJobs(jobSearch.trim() || undefined);
    if (collectionMode === 'additional') {
      customersApi.list({ limit: '300' }).then((res) => setCustomers(res.data.data.customers || []));
    }
  }, [showCollectionForm, editingCollectionId, collectionMode, loadCollectionJobs]);

  const filteredCollectionJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    const list = [...collectionJobs].sort((a, b) => {
      const ap = a.isPaid ? 1 : 0;
      const bp = b.isPaid ? 1 : 0;
      if (ap !== bp) return ap - bp;
      return a.customer?.name?.localeCompare(b.customer?.name || '') || 0;
    });
    if (!q) return list;
    return list.filter((job) =>
      [
        job.jobNumber,
        job.customer?.name,
        job.customer?.phone,
        job.vehicle?.registrationNo,
        job.invoice?.invoiceNumber,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [collectionJobs, jobSearch]);

  const selectedJobs = useMemo(
    () => collectionJobs.filter((job) => selectedJobIds.includes(job.id) && !job.isPaid),
    [collectionJobs, selectedJobIds],
  );

  const selectedBalanceTotal = useMemo(
    () => Math.round(selectedJobs.reduce((s, job) => s + job.balance, 0) * 100) / 100,
    [selectedJobs],
  );

  const toggleJob = (job: CollectionJobOption) => {
    if (job.isPaid) return;
    setSelectedJobIds((prev) => {
      const next = prev.includes(job.id) ? prev.filter((id) => id !== job.id) : [...prev, job.id];
      const selected = collectionJobs.filter((j) => next.includes(j.id) && !j.isPaid);
      const total = Math.round(selected.reduce((s, j) => s + j.balance, 0) * 100) / 100;
      setCollectionForm((form) => ({
        ...form,
        amount: total > 0 ? String(total) : '',
      }));
      return next;
    });
  };

  const selectAllUnpaidJobs = () => {
    const unpaid = filteredCollectionJobs.filter((job) => !job.isPaid);
    const ids = unpaid.map((j) => j.id);
    setSelectedJobIds(ids);
    const total = Math.round(unpaid.reduce((s, j) => s + j.balance, 0) * 100) / 100;
    setCollectionForm((form) => ({ ...form, amount: total > 0 ? String(total) : '' }));
  };

  const clearJobSelection = () => {
    setSelectedJobIds([]);
    setCollectionForm((form) => ({ ...form, amount: '' }));
  };

  const openCollectionForm = () => {
    setEditingCollectionId(null);
    setEditingCollectionJobLabel('');
    setCollectionMode('job');
    setCollectionForm({
      amount: '',
      paymentMethod: 'CASH',
      collectionType: 'FINAL',
      paidAt: toInputDate(new Date()),
      reference: '',
      notes: '',
      customerId: '',
      description: '',
      addGst: false,
    });
    setSelectedJobIds([]);
    setJobSearch('');
    setShowCollectionForm(true);
  };

  const openCollectionEdit = (row: CollectionRow) => {
    setEditingCollectionId(row.id);
    setEditingCollectionJobLabel(
      [
        row.job?.jobNumber,
        row.invoice?.invoiceNumber,
        row.job?.customer?.name || row.invoice?.customer?.name,
        row.job?.vehicle?.registrationNo,
      ].filter(Boolean).join(' · ') || 'Collection',
    );
    setCollectionForm({
      amount: String(row.amount),
      paymentMethod: row.paymentMethod || 'CASH',
      collectionType: row.collectionType || 'OTHER',
      paidAt: row.paidAt.slice(0, 10),
      reference: row.reference || '',
      notes: row.notes || '',
      customerId: '',
      description: '',
      addGst: false,
    });
    setSelectedJobIds([]);
    setJobSearch('');
    setShowCollectionForm(true);
  };

  const submitCollection = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      amount: Number(collectionForm.amount),
      paymentMethod: collectionForm.paymentMethod,
      collectionType: collectionForm.collectionType,
      paidAt: collectionForm.paidAt,
      reference: collectionForm.reference || null,
      notes: collectionForm.notes || null,
    };
    try {
      if (editingCollectionId) {
        await financeApi.updateCollection(editingCollectionId, payload);
        setToast('Collection updated');
      } else if (collectionMode === 'job') {
        if (!selectedJobIds.length) {
          setError('Select at least one unpaid job');
          return;
        }
        await financeApi.createBulkJobCollection({
          jobIds: selectedJobIds,
          amount: payload.amount,
          paymentMethod: payload.paymentMethod,
          collectionType: payload.collectionType,
          paidAt: payload.paidAt,
          reference: payload.reference || undefined,
          notes: payload.notes || undefined,
        });
        setToast(
          selectedJobIds.length > 1
            ? `Payment recorded across ${selectedJobIds.length} jobs`
            : 'Payment recorded',
        );
      } else {
        if (!collectionForm.customerId) {
          setError('Select a customer');
          return;
        }
        if (!collectionForm.description.trim()) {
          setError('Enter a description (e.g. Part purchase)');
          return;
        }
        await financeApi.createAdditionalCollection({
          customerId: collectionForm.customerId,
          description: collectionForm.description.trim(),
          amount: payload.amount,
          addGst: collectionForm.addGst,
          paymentMethod: payload.paymentMethod,
          collectionType: payload.collectionType || 'OTHER',
          paidAt: payload.paidAt,
          reference: payload.reference,
          notes: payload.notes,
        });
        setToast('Additional payment recorded');
      }
      setShowCollectionForm(false);
      setEditingCollectionId(null);
      loadCollections();
      loadCollectionJobs();
      if (tab === 'weekly') loadSummary();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to save payment');
    }
  };

  const runBackfill = async () => {
    if (!confirm('Import already-paid invoices into Finance collections? This adds missing collection records (e.g. INV2607097566).')) return;
    setBackfilling(true);
    setError('');
    try {
      const res = await financeApi.backfillCollectionsFromInvoices();
      const data = res.data.data as { collectionsCreated: number };
      setToast(
        data.collectionsCreated
          ? `Imported ${data.collectionsCreated} paid invoice(s) into collections`
          : 'No missing paid invoices to import',
      );
      loadCollections();
      loadCollectionJobs();
      loadSummary();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  const deleteCollection = async (id: string) => {
    if (!confirm('Delete this payment collection?')) return;
    await financeApi.deleteCollection(id);
    setToast('Collection deleted');
    loadCollections();
  };

  const loadExpenseJobs = useCallback(async (search?: string) => {
    const res = await financeApi.listCollectionJobs({
      limit: '50',
      ...(search ? { search } : {}),
    });
    setExpenseJobOptions(res.data.data.jobs || []);
  }, []);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await suppliersApi.list({ limit: '300' });
      setSupplierOptions(res.data.data.suppliers || []);
    } catch {
      setSupplierOptions([]);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await employeesApi.list({ limit: '300', activeOnly: 'true' });
      setEmployeeOptions(res.data.data.employees || []);
    } catch {
      setEmployeeOptions([]);
    }
  }, []);

  const needsWageEmployee = (category: string, otherType: string) =>
    category === 'LABOUR' || (category === 'OTHER' && otherType === 'SALARY');

  const formatExpenseJobLabel = (job: {
    jobNumber: string;
    customer?: { name: string } | null;
    vehicle?: { registrationNo: string } | null;
  }) => [
    job.jobNumber,
    job.customer?.name,
    job.vehicle?.registrationNo,
  ].filter(Boolean).join(' · ');

  const openExpenseCreate = () => {
    setEditingExpenseId(null);
    setExpenseForm({
      category: 'OTHER',
      materialType: 'PARTS',
      outsourceType: 'MECHANIC',
      otherType: 'UTILITY',
      description: '',
      amount: '',
      expenseDate: toInputDate(new Date()),
      isPayable: false,
      paymentMethod: 'CASH',
      reference: '',
      notes: '',
      jobId: '',
      supplierId: '',
      employeeId: '',
    });
    setExpenseJobSearch('');
    setExpenseSelectedJobLabel('');
    setExpenseJobOptions([]);
    setShowExpenseForm(true);
    loadExpenseJobs();
    loadSuppliers();
    loadEmployees();
  };

  const openExpenseEdit = (row: ExpenseRow) => {
    setEditingExpenseId(row.id);
    setExpenseForm({
      category: row.category,
      materialType: row.materialType || 'PARTS',
      outsourceType: row.outsourceType || 'MECHANIC',
      otherType: row.otherType || 'UTILITY',
      description: row.description,
      amount: String(row.amount),
      expenseDate: row.expenseDate.slice(0, 10),
      isPayable: !!row.isPayable,
      paymentMethod: row.isPayable ? (row.paymentMethod || 'CREDIT') : (row.paymentMethod || 'CASH'),
      reference: row.reference || '',
      notes: row.notes || '',
      jobId: row.jobId || row.job?.id || '',
      supplierId: row.supplierId || row.supplier?.id || '',
      employeeId: row.employeeId || row.employee?.id || '',
    });
    setExpenseJobSearch('');
    setExpenseSelectedJobLabel(row.job ? formatExpenseJobLabel(row.job) : '');
    setExpenseJobOptions([]);
    setShowExpenseForm(true);
    loadExpenseJobs();
    loadSuppliers();
    loadEmployees();
  };

  const submitExpense = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const isWage = needsWageEmployee(expenseForm.category, expenseForm.otherType);
    if (expenseForm.isPayable && !isWage && !expenseForm.supplierId) {
      setError('Select a supplier for payable expenses');
      return;
    }
    if (isWage && !expenseForm.employeeId) {
      setError('Select the employee / labour to pay wages to');
      return;
    }
    const payload = {
      category: expenseForm.category,
      materialType: expenseForm.category === 'MATERIAL' ? expenseForm.materialType : null,
      outsourceType: expenseForm.category === 'OUTSOURCE' ? expenseForm.outsourceType : null,
      otherType: expenseForm.category === 'OTHER' ? expenseForm.otherType : null,
      description: expenseForm.description,
      amount: Number(expenseForm.amount),
      expenseDate: expenseForm.expenseDate,
      isPayable: expenseForm.isPayable,
      paymentMethod: expenseForm.isPayable ? (expenseForm.paymentMethod || 'CREDIT') : (expenseForm.paymentMethod || null),
      reference: expenseForm.reference || null,
      notes: expenseForm.notes || null,
      jobId: expenseForm.jobId || null,
      supplierId: isWage ? null : (expenseForm.supplierId || null),
      employeeId: isWage ? (expenseForm.employeeId || null) : null,
    };
    try {
      if (editingExpenseId) {
        await financeApi.updateExpense(editingExpenseId, payload);
        setToast('Expense updated');
      } else {
        await financeApi.createExpense(payload);
        setToast('Expense recorded');
      }
      setShowExpenseForm(false);
      loadExpenses();
      if (tab === 'weekly') loadSummary();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to save expense');
    }
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    await financeApi.deleteExpense(id);
    setToast('Expense deleted');
    loadExpenses();
  };

  const downloadReportPdf = () => {
    if (!periodReport) return;
    downloadFinancePeriodReportPdf({
      from: periodReport.from || from,
      to: periodReport.to || to,
      summary: periodReport.summary,
      jobsReceived: periodReport.jobsReceived,
      jobsOut: periodReport.jobsOut,
      collections: periodReport.collections.map((r) => ({
        ...r,
        amount: r.amount || 0,
      })),
      expenses: periodReport.expenses.map((r) => ({
        ...r,
        amount: r.amount || 0,
      })),
      payables: (periodReport.payables || []).map((r) => ({
        ...r,
        amount: r.amount || 0,
        amountPaid: r.amountPaid || 0,
        balance: r.balance ?? r.amount ?? 0,
      })),
    });
    setToast('Finance report PDF downloaded');
  };

  const downloadWorkshopPdf = () => {
    if (!workshopReport) return;
    const grouped = periodSummary(workshopReport);
    const s = workshopReport.summary;
    downloadWorkshopReportPdf({
      ...workshopReport,
      expensesPayable: grouped.allocated,
      allocatedExpenseTotal: grouped.allocatedTotal,
      paidExpenseTotal: grouped.paidTotal,
      summaryLines: [
        { label: 'Total vehicles in (qty)', value: String(s.vehiclesIn) },
        { label: 'Total job value (in)', value: formatCurrency(s.vehiclesInRepairTotal) },
        { label: 'Total vehicles out (qty)', value: String(s.vehiclesOut) },
        { label: 'Total job value (out)', value: formatCurrency(s.vehiclesOutRepairTotal) },
        { label: 'Total allocated labour hours', value: formatHours(s.labourHours) },
        { label: 'Labour cost', value: formatCurrency(s.allocatedLabourCost) },
        { label: 'No. of labours worked', value: String(s.labourPeople) },
        { label: 'Total allocated expenses (except labour)', value: formatCurrency(grouped.allocatedTotal) },
        ...grouped.allocatedLines.map((row) => ({ label: `  ${row.label}`, value: formatCurrency(row.amount) })),
        { label: 'Total paid expenses', value: formatCurrency(grouped.paidTotal) },
        ...grouped.paidLines.map((row) => ({ label: `  ${row.label}`, value: formatCurrency(row.amount) })),
      ],
    });
    setToast('Finance report PDF downloaded');
  };

  const filteredCollections = useMemo(() => {
    const q = collectionSearch.trim().toLowerCase();
    return collections.filter((row) => {
      if (collectionTypeFilter && row.collectionType !== collectionTypeFilter) return false;
      if (collectionMethodFilter && row.paymentMethod !== collectionMethodFilter) return false;
      if (q && !collectionSearchText(row).includes(q)) return false;
      return true;
    });
  }, [collections, collectionSearch, collectionTypeFilter, collectionMethodFilter]);

  const filteredExpenses = useMemo(() => {
    const q = expenseSearch.trim().toLowerCase();
    return expenses.filter((row) => {
      if (expenseCategoryFilter && row.category !== expenseCategoryFilter) return false;
      if (expenseStatusFilter === 'PAID' && row.isPayable) return false;
      if (expenseStatusFilter === 'PAYABLE' && !row.isPayable) return false;
      if (expenseMethodFilter && (row.paymentMethod || '') !== expenseMethodFilter) return false;
      if (q && !expenseSearchText(row).includes(q)) return false;
      return true;
    });
  }, [expenses, expenseSearch, expenseCategoryFilter, expenseStatusFilter, expenseMethodFilter]);

  const collectionFilterTotal = useMemo(
    () => filteredCollections.reduce((s, r) => s + (r.amount || 0), 0),
    [filteredCollections],
  );
  const expenseFilterTotal = useMemo(
    () => filteredExpenses.reduce((s, r) => s + (r.amount || 0), 0),
    [filteredExpenses],
  );
  const collectionFiltersActive = !!(collectionSearch.trim() || collectionTypeFilter || collectionMethodFilter);
  const expenseFiltersActive = !!(expenseSearch.trim() || expenseCategoryFilter || expenseStatusFilter || expenseMethodFilter);

  const clearCollectionFilters = () => {
    setCollectionSearch('');
    setCollectionTypeFilter('');
    setCollectionMethodFilter('');
  };
  const clearExpenseFilters = () => {
    setExpenseSearch('');
    setExpenseCategoryFilter('');
    setExpenseStatusFilter('');
    setExpenseMethodFilter('');
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'weekly', label: 'Dashboard' },
    { key: 'overview', label: 'Overview' },
    { key: 'collections', label: 'Collections' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'report', label: 'Report' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <p className="text-sm text-gray-500">
          Weekly performance, job payment collections, and workshop expenses
        </p>
      </div>

      {toast && (
        <div className="bg-green-50 text-green-800 border border-green-200 rounded-lg px-4 py-2 text-sm">{toast}</div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2 text-sm">{error}</div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-wrap gap-2 border-b pb-3">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tab === t.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!(tab === 'report' && reportView === 'custom') && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'week', label: 'Weekly' },
              { key: 'month', label: 'Monthly' },
              { key: 'custom', label: 'Custom range' },
            ] as { key: PeriodMode; label: string }[]).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setPeriodMode(opt.key);
                  if (opt.key === 'week') {
                    const range = weekRangeContaining(new Date());
                    setFrom(range.from);
                    setTo(range.to);
                  }
                  if (opt.key === 'month') {
                    const range = monthRangeContaining(parseInputDate(from));
                    setFrom(range.from);
                    setTo(range.to);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  periodMode === opt.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <p className="text-sm text-gray-500 self-center">
              {formatInputDate(from)} – {formatInputDate(to)}
              {periodMode === 'week' ? ' · Mon–Sun' : ''}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
          {periodMode === 'week' && (
            <>
              <button
                type="button"
                className="btn-secondary px-2"
                aria-label="Previous week"
                onClick={() => {
                  const anchor = parseInputDate(from);
                  anchor.setDate(anchor.getDate() - 7);
                  const range = weekRangeContaining(anchor);
                  setFrom(range.from);
                  setTo(range.to);
                }}
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
                    const range = weekRangeContaining(parseInputDate(e.target.value));
                    setFrom(range.from);
                    setTo(range.to);
                  }}
                />
              </div>
              <button
                type="button"
                className="btn-secondary px-2"
                aria-label="Next week"
                onClick={() => {
                  const anchor = parseInputDate(from);
                  anchor.setDate(anchor.getDate() + 7);
                  const range = weekRangeContaining(anchor);
                  setFrom(range.from);
                  setTo(range.to);
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          {periodMode === 'month' && (
            <>
              <button
                type="button"
                className="btn-secondary px-2"
                aria-label="Previous month"
                onClick={() => {
                  const anchor = parseInputDate(from);
                  const range = monthRangeContaining(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
                  setFrom(range.from);
                  setTo(range.to);
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div>
                <label className="label">Month</label>
                <input
                  type="month"
                  className="input"
                  value={from.slice(0, 7)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const [y, m] = e.target.value.split('-').map(Number);
                    const range = monthRangeContaining(new Date(y, m - 1, 1));
                    setFrom(range.from);
                    setTo(range.to);
                  }}
                />
              </div>
              <button
                type="button"
                className="btn-secondary px-2"
                aria-label="Next month"
                onClick={() => {
                  const anchor = parseInputDate(from);
                  const range = monthRangeContaining(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
                  setFrom(range.from);
                  setTo(range.to);
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          {periodMode === 'custom' && (
            <>
              <div>
                <label className="label">From</label>
                <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">To</label>
                <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={loading || reportLoading || workshopLoading}
            onClick={() => {
              if (tab === 'weekly' || tab === 'overview') loadSummary();
              if (tab === 'collections') loadCollections();
              if (tab === 'expenses') loadExpenses();
              if (tab === 'report' && reportView === 'period') loadWorkshopReport();
              if (tab === 'report' && reportView === 'collections') loadPeriodReport();
            }}
          >
            {loading || reportLoading || workshopLoading ? 'Loading...' : 'Refresh'}
          </button>
          {tab === 'report' && reportView === 'period' && (
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              disabled={!workshopReport || workshopLoading}
              onClick={downloadWorkshopPdf}
            >
              <Download className="w-4 h-4" /> Download PDF
            </button>
          )}
          {tab === 'report' && reportView === 'collections' && (
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              disabled={!periodReport || reportLoading}
              onClick={downloadReportPdf}
            >
              <Download className="w-4 h-4" /> Download PDF
            </button>
          )}
          {tab === 'collections' && (
            <>
              <button type="button" className="btn-secondary flex items-center gap-2" onClick={openCollectionForm}>
                <Plus className="w-4 h-4" /> Record Payment
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={backfilling}
                onClick={runBackfill}
                title="Import invoices already marked paid into Finance collections"
              >
                {backfilling ? 'Importing...' : 'Import paid invoices'}
              </button>
            </>
          )}
          {tab === 'expenses' && (
            <button type="button" className="btn-secondary flex items-center gap-2" onClick={openExpenseCreate}>
              <Plus className="w-4 h-4" /> Add Expense
            </button>
          )}
          </div>
        </div>
        )}
      </div>

      {tab === 'weekly' && summary && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Week dashboard · {formatDate(from)} – {formatDate(to)}. Click a widget for details.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button type="button" onClick={() => openWeeklyDetails('jobs_received')} className="bg-blue-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-blue-300 transition">
              <p className="text-sm text-blue-700">Jobs received</p>
              <p className="text-2xl font-bold text-blue-900">{summary.jobsReceived}</p>
            </button>
            <button type="button" onClick={() => openWeeklyDetails('jobs_out')} className="bg-green-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-green-300 transition">
              <p className="text-sm text-green-700">Jobs out</p>
              <p className="text-2xl font-bold text-green-900">{summary.jobsOut ?? 0}</p>
            </button>
            <button type="button" onClick={() => openWeeklyDetails('payments')} className="bg-teal-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-teal-300 transition">
              <p className="text-sm text-teal-700">Total collection</p>
              <p className="text-2xl font-bold text-teal-900">{formatCurrency(summary.totalPaymentsReceived)}</p>
            </button>
            <button type="button" onClick={() => openWeeklyDetails('expenses')} className="bg-amber-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-amber-300 transition">
              <p className="text-sm text-amber-700">Total expenses</p>
              <p className="text-2xl font-bold text-amber-900">{formatCurrency(summary.totalExpenses)}</p>
            </button>
            <button type="button" onClick={() => openWeeklyDetails('payables')} className="bg-orange-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-orange-300 transition">
              <p className="text-sm text-orange-700">Total due</p>
              <p className="text-2xl font-bold text-orange-900">{formatCurrency(summary.totalPayables || 0)}</p>
              <p className="text-xs text-orange-700 mt-1">Payable − paid, by party</p>
            </button>
          </div>

          {(summary.payablesByParty?.length || 0) > 0 && (
            <div className="card space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Payables by party</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Due = payable − paid for each party (up to the selected end date). Stored expense amounts are not changed.</p>
                </div>
                <button
                  type="button"
                  onClick={() => openWeeklyDetails('payables')}
                  className="text-xs text-orange-700 hover:underline"
                >
                  View all
                </button>
              </div>
              {(summary.payablesByType?.length || 0) > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {summary.payablesByType!.map((row) => (
                    <div key={row.id} className="rounded-lg bg-orange-50 px-3 py-2">
                      <p className="text-xs text-orange-700">{row.label}</p>
                      <p className="font-semibold text-orange-900">{formatCurrency(row.amount)}</p>
                      <p className="text-[11px] text-orange-700">{row.count} item(s)</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left p-2">Party</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-right p-2">Items</th>
                      <th className="text-right p-2">Payable</th>
                      <th className="text-right p-2">Paid</th>
                      <th className="text-right p-2">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.payablesByParty!.map((party) => {
                      const { payable, paid, due } = partyDueAmounts(party);
                      return (
                      <tr
                        key={party.id}
                        className="border-t hover:bg-orange-50/70 cursor-pointer"
                        onClick={() => openPayablePartyDetails(party)}
                        title="View breakdown"
                      >
                        <td className="p-2 font-medium text-orange-900 underline-offset-2 hover:underline">
                          {party.name}
                          {party.code ? <span className="text-gray-500 font-normal"> ({party.code})</span> : null}
                        </td>
                        <td className="p-2 text-gray-600">{formatPayableKind(party.kind)}</td>
                        <td className="p-2 text-right text-gray-600">{party.count}</td>
                        <td className="p-2 text-right text-gray-700">{formatCurrency(payable)}</td>
                        <td className="p-2 text-right text-gray-700">{formatCurrency(paid)}</td>
                        <td className="p-2 text-right font-semibold text-orange-900">{formatCurrency(due)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <LabourHoursSection
            rows={summary.labourByEmployee || []}
            totals={summary.labourHoursTotals}
            onViewAll={() => openWeeklyDetails('labour_hours')}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button type="button" onClick={() => openWeeklyDetails('jobs_completed')} className="bg-indigo-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-indigo-300 transition">
              <p className="text-sm text-indigo-700">Jobs completed</p>
              <p className="text-xl font-bold text-indigo-900">{summary.jobsCompleted}</p>
            </button>
            <button type="button" onClick={() => openWeeklyDetails('sales')} className="bg-emerald-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-emerald-300 transition">
              <p className="text-sm text-emerald-700">Total sales / revenue</p>
              <p className="text-xl font-bold text-emerald-900">{formatCurrency(summary.totalSales)}</p>
              <p className="text-xs text-emerald-700 mt-1">{summary.invoiceCount} invoice(s)</p>
            </button>
            <button type="button" onClick={() => openWeeklyDetails('cash')} className="bg-lime-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-lime-300 transition">
              <p className="text-sm text-lime-700">Cash collected</p>
              <p className="text-xl font-bold text-lime-900">{formatCurrency(summary.cashCollected)}</p>
            </button>
            <button type="button" onClick={() => openWeeklyDetails('other_payments')} className="bg-sky-50 rounded-lg p-4 text-left hover:ring-2 hover:ring-sky-300 transition">
              <p className="text-sm text-sky-700">Other payments</p>
              <p className="text-xl font-bold text-sky-900">{formatCurrency(summary.otherPaymentsCollected)}</p>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => openWeeklyDetails('net_profit')}
              className={`rounded-lg p-4 text-left hover:ring-2 transition sm:col-span-2 ${
                summary.isProfit ? 'bg-lime-50 hover:ring-lime-300' : 'bg-rose-50 hover:ring-rose-300'
              }`}
            >
              <p className={`text-sm ${summary.isProfit ? 'text-lime-700' : 'text-rose-700'}`}>
                Net {summary.isProfit ? 'profit' : 'loss'}
              </p>
              <p className={`text-2xl font-bold ${summary.isProfit ? 'text-lime-900' : 'text-rose-900'}`}>
                {formatCurrency(summary.netProfit)}
              </p>
              <p className="text-xs mt-1 text-gray-600">Collections − paid expenses (excludes payables)</p>
            </button>
          </div>

          <div className="card">
            <h2 className="font-semibold mb-3">Expense breakdown</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button type="button" onClick={() => openWeeklyDetails('labour_expenses')} className="text-left rounded-lg p-2 -m-2 hover:bg-gray-50">
                <p className="text-sm text-gray-500">Labour</p>
                <p className="text-lg font-semibold">{formatCurrency(summary.labourExpenses)}</p>
              </button>
              <button type="button" onClick={() => openWeeklyDetails('material_expenses')} className="text-left rounded-lg p-2 -m-2 hover:bg-gray-50">
                <p className="text-sm text-gray-500">Materials</p>
                <p className="text-lg font-semibold">{formatCurrency(summary.materialExpenses)}</p>
              </button>
              <button type="button" onClick={() => openWeeklyDetails('other_expenses')} className="text-left rounded-lg p-2 -m-2 hover:bg-gray-50">
                <p className="text-sm text-gray-500">Other operating</p>
                <p className="text-lg font-semibold">{formatCurrency(summary.otherExpenses)}</p>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              Period: {formatDate(summary.from)} – {formatDate(summary.to)}
            </p>
          </div>
        </div>
      )}

      {tab === 'overview' && summary && (
        <PeriodOverviewDashboard
          summary={summary}
          from={from}
          to={to}
          onOpenDetails={openWeeklyDetails}
          onOpenPayableParty={openPayablePartyDetails}
          onOpenPaidParty={(party) => { void openWeeklyDetails('paid_expenses', party.id); }}
        />
      )}

      {(detailMetric || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold">{details?.title || 'Details'}</h2>
                <p className="text-xs text-gray-500">
                  {formatDate(from)} – {formatDate(to)}
                  {details?.total != null ? ` · Total ${formatCurrency(details.total)}` : ''}
                  {details?.rows ? ` · ${details.rows.length} row(s)` : ''}
                </p>
                {details?.metric === 'net_profit' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Payments {formatCurrency(details.paymentTotal || 0)} − Expenses {formatCurrency(details.expenseTotal || 0)}
                  </p>
                )}
                {details?.metric === 'jobs_out' && (
                  <p className="text-xs text-gray-600 mt-1">
                    Tax invoice {formatCurrency(details.taxTotal || 0)}
                    {' · '}
                    Cash {formatCurrency(details.cashTotal || 0)}
                  </p>
                )}
                {details?.metric === 'paid_expenses' && details.partyId && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-amber-700 hover:underline"
                      onClick={() => openWeeklyDetails('paid_expenses')}
                    >
                      ← Back to all paid expenses
                    </button>
                    {details.party && (
                      <span className="text-xs text-gray-600">
                        {formatPayableKind(details.party.kind)}
                        {details.party.code ? ` · ${details.party.code}` : ''}
                        {details.total != null ? ` · ${formatCurrency(details.total)}` : ''}
                      </span>
                    )}
                  </div>
                )}
                {details?.metric === 'payables' && details.partyId && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-orange-700 hover:underline"
                      onClick={() => openWeeklyDetails('payables')}
                    >
                      ← Back to all payables
                    </button>
                    {details.party && (
                      <span className="text-xs text-gray-600">
                        {formatPayableKind(details.party.kind)}
                        {details.party.code ? ` · ${details.party.code}` : ''}
                        {details.party.originalAmount != null
                          ? ` · payable ${formatCurrency(details.party.originalAmount)} − paid ${formatCurrency(details.party.paidAmount || 0)} = due ${formatCurrency(details.party.amount ?? details.total ?? 0)}`
                          : details.total != null ? ` · ${formatCurrency(details.total)}` : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button type="button" onClick={closeWeeklyDetails} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              {details?.metric === 'paid_expenses' && !details.partyId && (details.byParty?.length || 0) > 0 && (
                <div className="mb-4 overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left p-2">Party</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-right p-2">Items</th>
                        <th className="text-right p-2">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.byParty!.map((party) => (
                        <tr
                          key={party.id}
                          className="border-t hover:bg-amber-50/70 cursor-pointer"
                          onClick={() => { void openWeeklyDetails('paid_expenses', party.id); }}
                        >
                          <td className="p-2 text-amber-900 underline-offset-2 hover:underline">
                            {party.name}
                            {party.code ? <span className="text-gray-500"> ({party.code})</span> : null}
                          </td>
                          <td className="p-2 text-gray-600">{formatPayableKind(party.kind)}</td>
                          <td className="p-2 text-right">{party.count}</td>
                          <td className="p-2 text-right font-semibold">{formatCurrency(party.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {details?.metric === 'payables' && !details.partyId && (details.byParty?.length || 0) > 0 && (
                <div className="mb-4 space-y-3">
                  {(details.byType?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {details.byType!.map((row) => (
                        <div key={row.id} className="rounded-lg bg-orange-50 px-3 py-1.5 text-xs">
                          <span className="text-orange-700">{row.label}: </span>
                          <span className="font-semibold text-orange-900">{formatCurrency(row.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="text-left p-2">Party</th>
                          <th className="text-left p-2">Type</th>
                          <th className="text-right p-2">Items</th>
                          <th className="text-right p-2">Payable</th>
                          <th className="text-right p-2">Paid</th>
                          <th className="text-right p-2">Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.byParty!.map((party) => {
                          const { payable, paid, due } = partyDueAmounts(party);
                          return (
                          <tr
                            key={party.id}
                            className="border-t hover:bg-orange-50/70 cursor-pointer"
                            onClick={() => openPayablePartyDetails(party)}
                          >
                            <td className="p-2 text-orange-900 underline-offset-2 hover:underline">
                              {party.name}
                              {party.code ? <span className="text-gray-500"> ({party.code})</span> : null}
                            </td>
                            <td className="p-2 text-gray-600">{formatPayableKind(party.kind)}</td>
                            <td className="p-2 text-right">{party.count}</td>
                            <td className="p-2 text-right">{formatCurrency(payable)}</td>
                            <td className="p-2 text-right">{formatCurrency(paid)}</td>
                            <td className="p-2 text-right font-semibold text-orange-900">{formatCurrency(due)}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {detailLoading ? (
                <p className="text-sm text-gray-500 py-8 text-center">Loading details...</p>
              ) : !details?.rows.length ? (
                <p className="text-sm text-gray-400 py-8 text-center">No records in this period</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      {details.columns.map((col) => (
                        <th key={col} className={`p-2 ${['Amount', 'Price', 'Paid', 'Payable', 'Allocated', 'Due', 'Days', 'Hours', 'Allocated salary'].includes(col) ? 'text-right' : 'text-left'}`}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {details.rows.map((row) => (
                      <tr key={row.id} className="border-t">
                        {details.metric === 'jobs_received' || details.metric === 'jobs_completed' ? (
                          <>
                            <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                            <td className="p-2 font-mono">{row.jobNumber || '—'}</td>
                            <td className="p-2">{row.customer || '—'}</td>
                            <td className="p-2 font-mono">{row.registrationNo || '—'}</td>
                            <td className="p-2">{formatStatus(row.status || '')}</td>
                            <td className="p-2">{formatStatus(String(row.jobType || ''))}</td>
                            {details.metric === 'jobs_received' && (
                              <td className="p-2 text-right font-medium">
                                {(row.amount || 0) > 0 ? formatCurrency(row.amount || 0) : '—'}
                              </td>
                            )}
                          </>
                        ) : details.metric === 'jobs_out' ? (
                          <>
                            <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                            <td className="p-2 font-mono">{row.jobNumber || '—'}</td>
                            <td className="p-2">{row.customer || '—'}</td>
                            <td className="p-2 font-mono">{row.registrationNo || '—'}</td>
                            <td className="p-2">{row.detail || '—'}</td>
                            <td className="p-2">{formatStatus(row.status || '')}</td>
                            <td className="p-2 text-right font-medium">
                              {(row.amount || 0) > 0 ? formatCurrency(row.amount || 0) : '—'}
                            </td>
                            <td className="p-2 text-right font-medium">
                              {formatCurrency(row.amountPaid || 0)}
                            </td>
                          </>
                        ) : details.metric === 'sales' ? (
                          <>
                            <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                            <td className="p-2 font-mono">{row.invoiceNumber || '—'}</td>
                            <td className="p-2 font-mono">{row.jobNumber || '—'}</td>
                            <td className="p-2">{row.customer || '—'}</td>
                            <td className="p-2 font-mono">{row.registrationNo || '—'}</td>
                            <td className="p-2">{formatStatus(row.status || '')}</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(row.amount || 0)}</td>
                          </>
                        ) : details.metric === 'payments' || details.metric === 'cash' || details.metric === 'other_payments' ? (
                          <>
                            <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                            <td className="p-2 font-mono">{row.jobNumber || '—'}</td>
                            <td className="p-2">{row.customer || '—'}</td>
                            <td className="p-2 font-mono">{row.registrationNo || '—'}</td>
                            <td className="p-2">{formatCollectionType(row.collectionType || '')}</td>
                            <td className="p-2">{formatMethod(row.paymentMethod)}</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(row.amount || 0)}</td>
                          </>
                        ) : details.metric === 'paid_expenses' ? (
                          <>
                            <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                            <td className="p-2">{formatCategory(row.category || '', row.materialType, row.otherType, row.outsourceType)}</td>
                            <td className="p-2">{formatPayableParty(row)}</td>
                            <td className="p-2">{row.description || '—'}</td>
                            <td className="p-2">{formatMethod(row.paymentMethod)}</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(row.amount || 0)}</td>
                          </>
                        ) : details.metric === 'labour_expenses' ? (
                          <>
                            <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                            <td className="p-2">{formatCategory(row.category || '', row.materialType, row.otherType, row.outsourceType)}</td>
                            <td className="p-2">{row.employee || '—'}</td>
                            <td className="p-2">{row.description || '—'}</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(row.amount || 0)}</td>
                          </>
                        ) : details.metric === 'expenses' || details.metric === 'material_expenses' || details.metric === 'other_expenses' ? (
                          <>
                            <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                            <td className="p-2">{formatCategory(row.category || '', row.materialType, row.otherType, row.outsourceType)}</td>
                            <td className="p-2">{row.description || '—'}</td>
                            <td className="p-2">{formatMethod(row.paymentMethod)}</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(row.amount || 0)}</td>
                          </>
                        ) : details.metric === 'labour_hours' ? (
                          <>
                            <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                            <td className="p-2">{formatPayableParty(row)}</td>
                            <td className="p-2 text-right">{row.workedDays ?? 0}</td>
                            <td className="p-2 text-right">{formatHours(row.hours || 0)}</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(row.amount || 0)}</td>
                          </>
                        ) : details.metric === 'payables' ? (
                          <>
                            <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                            <td className="p-2">{formatCategory(row.category || '', row.materialType, row.otherType, row.outsourceType)}</td>
                            <td className="p-2">{formatPayableParty(row)}</td>
                            <td className="p-2">{row.description || '—'}</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(row.amount || 0)}</td>
                            <td className="p-2 text-right">{formatCurrency(row.amountPaid || 0)}</td>
                            <td className="p-2 text-right font-semibold text-orange-900">{formatCurrency(row.balance || 0)}</td>
                          </>
                        ) : (
                          <>
                            <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                            <td className="p-2">{row.entryType || '—'}</td>
                            <td className="p-2">{row.detail || '—'}</td>
                            <td className={`p-2 text-right font-medium ${(row.amount || 0) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {formatCurrency(row.amount || 0)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {details?.metric === 'jobs_out' && !!details.rows.length && (
                <div className="mt-4 border-t pt-3 flex flex-wrap gap-4 justify-end text-sm">
                  <div className="bg-blue-50 rounded-lg px-4 py-2">
                    <p className="text-xs text-blue-700">Tax invoice total</p>
                    <p className="font-bold text-blue-900">{formatCurrency(details.taxTotal || 0)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg px-4 py-2">
                    <p className="text-xs text-amber-700">Cash total</p>
                    <p className="font-bold text-amber-900">{formatCurrency(details.cashTotal || 0)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg px-4 py-2">
                    <p className="text-xs text-green-700">All out total</p>
                    <p className="font-bold text-green-900">{formatCurrency(details.total || 0)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'report' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReportView('period')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${reportView === 'period' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Period summary
            </button>
            <button
              type="button"
              onClick={() => setReportView('collections')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${reportView === 'collections' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Collections
            </button>
            <button
              type="button"
              onClick={() => setReportView('custom')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${reportView === 'custom' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Custom reports
            </button>
          </div>
          {reportView === 'custom' ? (
            <CustomPeriodReports />
          ) : reportView === 'period' ? (
            workshopLoading && !workshopReport ? (
              <p className="text-sm text-gray-500 py-8 text-center">Loading report...</p>
            ) : !workshopReport ? (
              <p className="text-sm text-gray-400 py-8 text-center">No report data. Choose dates and click Refresh.</p>
            ) : (
              <WorkshopReportView report={workshopReport} />
            )
          ) : reportLoading && !periodReport ? (
            <p className="text-sm text-gray-500 py-8 text-center">Loading report...</p>
          ) : !periodReport ? (
            <p className="text-sm text-gray-400 py-8 text-center">No report data. Choose dates and click Refresh.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                Finance report · {formatDate(from)} – {formatDate(to)}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-700">Jobs received</p>
                  <p className="text-2xl font-bold text-blue-900">{periodReport.summary.jobsReceived}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-700">Jobs out</p>
                  <p className="text-2xl font-bold text-green-900">{periodReport.summary.jobsOut}</p>
                </div>
                <div className="bg-teal-50 rounded-lg p-4">
                  <p className="text-sm text-teal-700">Total collection</p>
                  <p className="text-2xl font-bold text-teal-900">{formatCurrency(periodReport.summary.totalPaymentsReceived)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-sm text-amber-700">Total expenses</p>
                  <p className="text-2xl font-bold text-amber-900">{formatCurrency(periodReport.summary.totalExpenses)}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-orange-700">Total due</p>
                  <p className="text-2xl font-bold text-orange-900">{formatCurrency(periodReport.summary.totalPayables || 0)}</p>
                  <p className="text-xs text-orange-700 mt-1">Payable − paid, by party</p>
                </div>
              </div>

              {(periodReport.summary.payablesByParty?.length || 0) > 0 && (
                <div className="card space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">Payables by party</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Due = payable − paid for each party (up to the selected end date). Stored expense amounts are not changed.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openWeeklyDetails('payables')}
                      className="text-xs text-orange-700 hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  {(periodReport.summary.payablesByType?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {periodReport.summary.payablesByType!.map((row) => (
                        <div key={row.id} className="rounded-lg bg-orange-50 px-3 py-2 text-sm">
                          <span className="text-orange-700">{row.label}: </span>
                          <span className="font-semibold text-orange-900">{formatCurrency(row.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="text-left p-2">Party</th>
                          <th className="text-left p-2">Type</th>
                          <th className="text-right p-2">Items</th>
                          <th className="text-right p-2">Payable</th>
                          <th className="text-right p-2">Paid</th>
                          <th className="text-right p-2">Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {periodReport.summary.payablesByParty!.map((party) => {
                          const { payable, paid, due } = partyDueAmounts(party);
                          return (
                          <tr
                            key={party.id}
                            className="border-t hover:bg-orange-50/70 cursor-pointer"
                            onClick={() => openPayablePartyDetails(party)}
                            title="View breakdown"
                          >
                            <td className="p-2 font-medium text-orange-900 underline-offset-2 hover:underline">
                              {party.name}
                              {party.code ? <span className="text-gray-500 font-normal"> ({party.code})</span> : null}
                            </td>
                            <td className="p-2 text-gray-600">{formatPayableKind(party.kind)}</td>
                            <td className="p-2 text-right text-gray-600">{party.count}</td>
                            <td className="p-2 text-right text-gray-700">{formatCurrency(payable)}</td>
                            <td className="p-2 text-right text-gray-700">{formatCurrency(paid)}</td>
                            <td className="p-2 text-right font-semibold text-orange-900">{formatCurrency(due)}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <LabourHoursSection
                rows={periodReport.summary.labourByEmployee || []}
                totals={periodReport.summary.labourHoursTotals}
                onViewAll={() => openWeeklyDetails('labour_hours')}
              />

              <div className="card overflow-x-auto">
                <h2 className="font-semibold mb-3">Jobs received ({periodReport.jobsReceived.length})</h2>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Job</th>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Rego</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-right p-2">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodReport.jobsReceived.length === 0 ? (
                      <tr><td colSpan={6} className="p-4 text-center text-gray-400">No jobs received</td></tr>
                    ) : periodReport.jobsReceived.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                        <td className="p-2 font-mono">{row.jobNumber || '—'}</td>
                        <td className="p-2">{row.customer || '—'}</td>
                        <td className="p-2 font-mono">{row.registrationNo || '—'}</td>
                        <td className="p-2">{formatStatus(row.status || '')}</td>
                        <td className="p-2 text-right font-medium">
                          {(row.amount || 0) > 0 ? formatCurrency(row.amount || 0) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card overflow-x-auto">
                <h2 className="font-semibold mb-3">Jobs out ({periodReport.jobsOut.length})</h2>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left p-2">Out date</th>
                      <th className="text-left p-2">Job</th>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Rego</th>
                      <th className="text-left p-2">Invoice</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-right p-2">Price</th>
                      <th className="text-right p-2">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodReport.jobsOut.length === 0 ? (
                      <tr><td colSpan={8} className="p-4 text-center text-gray-400">No jobs out</td></tr>
                    ) : periodReport.jobsOut.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                        <td className="p-2 font-mono">{row.jobNumber || '—'}</td>
                        <td className="p-2">{row.customer || '—'}</td>
                        <td className="p-2 font-mono">{row.registrationNo || '—'}</td>
                        <td className="p-2">{row.detail || '—'}</td>
                        <td className="p-2">{formatStatus(row.status || '')}</td>
                        <td className="p-2 text-right font-medium">
                          {(row.amount || 0) > 0 ? formatCurrency(row.amount || 0) : '—'}
                        </td>
                        <td className="p-2 text-right font-medium">
                          {formatCurrency(row.amountPaid || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card overflow-x-auto">
                <h2 className="font-semibold mb-3">
                  Collections ({periodReport.collections.length}) · {formatCurrency(periodReport.summary.totalPaymentsReceived)}
                </h2>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Job / Inv</th>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Rego</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Method</th>
                      <th className="text-right p-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodReport.collections.length === 0 ? (
                      <tr><td colSpan={7} className="p-4 text-center text-gray-400">No collections</td></tr>
                    ) : periodReport.collections.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                        <td className="p-2 font-mono">{row.jobNumber || '—'}</td>
                        <td className="p-2">{row.customer || '—'}</td>
                        <td className="p-2 font-mono">{row.registrationNo || '—'}</td>
                        <td className="p-2">{formatCollectionType(row.collectionType || '')}</td>
                        <td className="p-2">{formatMethod(row.paymentMethod)}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(row.amount || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card overflow-x-auto">
                <h2 className="font-semibold mb-3">
                  Expenses ({periodReport.expenses.length}) · {formatCurrency(periodReport.summary.totalExpenses)}
                </h2>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Category</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-left p-2">Method</th>
                      <th className="text-right p-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodReport.expenses.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-gray-400">No expenses</td></tr>
                    ) : periodReport.expenses.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                        <td className="p-2">{formatCategory(row.category || '', row.materialType, row.otherType, row.outsourceType)}</td>
                        <td className="p-2">{row.description || '—'}</td>
                        <td className="p-2">{formatMethod(row.paymentMethod)}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(row.amount || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card overflow-x-auto">
                <h2 className="font-semibold mb-3">
                  Payables ({(periodReport.payables || []).length}) · due {formatCurrency(periodReport.summary.totalPayables || 0)}
                </h2>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Category</th>
                      <th className="text-left p-2">Payable to</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2">Payable</th>
                      <th className="text-right p-2">Allocated</th>
                      <th className="text-right p-2">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(periodReport.payables || []).length === 0 ? (
                      <tr><td colSpan={7} className="p-4 text-center text-gray-400">No payables</td></tr>
                    ) : (periodReport.payables || []).map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">{row.date ? formatDate(row.date) : '—'}</td>
                        <td className="p-2">{formatCategory(row.category || '', row.materialType, row.otherType, row.outsourceType)}</td>
                        <td className="p-2">{formatPayableParty(row)}</td>
                        <td className="p-2">{row.description || '—'}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(row.amount || 0)}</td>
                        <td className="p-2 text-right">{formatCurrency(row.amountPaid || 0)}</td>
                        <td className="p-2 text-right font-medium text-orange-800">{formatCurrency(row.balance ?? row.amount ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card">
                <h2 className="font-semibold mb-3">End summary</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm max-w-xl">
                  <p className="text-gray-600">Jobs received</p>
                  <p className="font-semibold text-right">{periodReport.summary.jobsReceived}</p>
                  <p className="text-gray-600">Jobs out</p>
                  <p className="font-semibold text-right">{periodReport.summary.jobsOut}</p>
                  <p className="text-gray-600">Total collection</p>
                  <p className="font-semibold text-right">{formatCurrency(periodReport.summary.totalPaymentsReceived)}</p>
                  <p className="text-gray-600">Total expenses</p>
                  <p className="font-semibold text-right">{formatCurrency(periodReport.summary.totalExpenses)}</p>
                  <p className="text-gray-600">Total due</p>
                  <p className="font-semibold text-right text-orange-800">{formatCurrency(periodReport.summary.totalPayables || 0)}</p>
                  <p className={`pt-2 border-t ${periodReport.summary.isProfit ? 'text-lime-700' : 'text-rose-700'}`}>
                    {periodReport.summary.isProfit ? 'Profit' : 'Loss'}
                  </p>
                  <p className={`pt-2 border-t font-bold text-right text-lg ${periodReport.summary.isProfit ? 'text-lime-800' : 'text-rose-800'}`}>
                    {formatCurrency(periodReport.summary.netProfit)}
                  </p>
                </div>
                <p className="text-xs text-gray-400 mt-3">Profit = total collection − paid expenses (payables excluded)</p>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'collections' && (
        <div className="card overflow-x-auto space-y-3">
          <div className="p-3 pb-0 space-y-2">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  className="input pl-9"
                  placeholder="Search job, invoice, customer, rego, notes..."
                  value={collectionSearch}
                  onChange={(e) => setCollectionSearch(e.target.value)}
                />
              </div>
              <select
                className="input md:w-48"
                value={collectionTypeFilter}
                onChange={(e) => setCollectionTypeFilter(e.target.value)}
              >
                <option value="">All types</option>
                {COLLECTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <select
                className="input md:w-48"
                value={collectionMethodFilter}
                onChange={(e) => setCollectionMethodFilter(e.target.value)}
              >
                <option value="">All methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              {collectionFiltersActive && (
                <button type="button" className="btn-secondary text-sm whitespace-nowrap" onClick={clearCollectionFilters}>
                  Clear filters
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {filteredCollections.length} of {collections.length} collection{collections.length !== 1 ? 's' : ''}
              {' · '}
              {formatCurrency(collectionFilterTotal)}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Job / Invoice</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Rego / Item</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Method</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-left p-3">Notes</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-gray-400">No collections in this period</td></tr>
              ) : filteredCollections.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-gray-400">No collections match these filters</td></tr>
              ) : filteredCollections.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">{formatDate(row.paidAt)}</td>
                  <td className="p-3 font-mono">
                    {row.job?.jobNumber || row.invoice?.invoiceNumber || '—'}
                  </td>
                  <td className="p-3">{row.job?.customer?.name || row.invoice?.customer?.name || '—'}</td>
                  <td className="p-3 font-mono text-xs">
                    {row.job?.vehicle?.registrationNo
                      || row.invoice?.lineItems?.[0]?.description
                      || '—'}
                  </td>
                  <td className="p-3">{formatCollectionType(row.collectionType)}</td>
                  <td className="p-3">{formatMethod(row.paymentMethod)}</td>
                  <td className="p-3 text-right font-medium">{formatCurrency(row.amount)}</td>
                  <td className="p-3 text-gray-600 max-w-xs">{row.notes || row.reference || '—'}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button type="button" className="text-brand-600 hover:underline text-xs mr-3" onClick={() => openCollectionEdit(row)}>
                      Edit
                    </button>
                    <button type="button" className="text-red-600 hover:text-red-800 inline-flex" onClick={() => deleteCollection(row.id)} title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="card overflow-x-auto space-y-3">
          <div className="p-3 pb-0 space-y-2">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  className="input pl-9"
                  placeholder="Search description, employee, supplier, job..."
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                />
              </div>
              <select
                className="input md:w-44"
                value={expenseCategoryFilter}
                onChange={(e) => setExpenseCategoryFilter(e.target.value)}
              >
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <select
                className="input md:w-36"
                value={expenseStatusFilter}
                onChange={(e) => setExpenseStatusFilter(e.target.value)}
              >
                <option value="">All status</option>
                <option value="PAID">Paid</option>
                <option value="PAYABLE">Payable</option>
              </select>
              <select
                className="input md:w-44"
                value={expenseMethodFilter}
                onChange={(e) => setExpenseMethodFilter(e.target.value)}
              >
                <option value="">All methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
                <option value="CREDIT">Credit</option>
              </select>
              {expenseFiltersActive && (
                <button type="button" className="btn-secondary text-sm whitespace-nowrap" onClick={clearExpenseFilters}>
                  Clear filters
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {filteredExpenses.length} of {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
              {expensesTotalCount > expenses.length ? ` (showing latest ${expenses.length} of ${expensesTotalCount})` : ''}
              {' · '}
              {formatCurrency(expenseFilterTotal)}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Category</th>
                <th className="text-left p-3">Description</th>
                <th className="text-left p-3">Paid to</th>
                <th className="text-left p-3">Supplier</th>
                <th className="text-left p-3">Job</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Method</th>
                <th className="text-right p-3">Amount</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr><td colSpan={10} className="p-6 text-center text-gray-400">No expenses in this period</td></tr>
              ) : filteredExpenses.length === 0 ? (
                <tr><td colSpan={10} className="p-6 text-center text-gray-400">No expenses match these filters</td></tr>
              ) : filteredExpenses.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">{formatDate(row.expenseDate)}</td>
                  <td className="p-3">{formatCategory(row.category, row.materialType, row.otherType, row.outsourceType)}</td>
                  <td className="p-3">{row.description}</td>
                  <td className="p-3">{row.employee?.name || '—'}</td>
                  <td className="p-3">{row.supplier?.name || '—'}</td>
                  <td className="p-3">
                    {row.job ? (
                      <span>
                        <span className="font-mono">{row.job.jobNumber}</span>
                        {row.job.vehicle?.registrationNo ? (
                          <span className="block text-xs text-gray-500">{row.job.vehicle.registrationNo}</span>
                        ) : null}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    {row.isPayable ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">Payable</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">Paid</span>
                    )}
                  </td>
                  <td className="p-3">{formatMethod(row.paymentMethod)}</td>
                  <td className={`p-3 text-right font-medium ${row.isPayable ? 'text-orange-800' : ''}`}>{formatCurrency(row.amount)}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button type="button" className="text-brand-600 hover:underline text-xs mr-3" onClick={() => openExpenseEdit(row)}>
                      Edit
                    </button>
                    <button type="button" className="text-red-600 hover:text-red-800 inline-flex" onClick={() => deleteExpense(row.id)} title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCollectionForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={submitCollection} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">
                  {editingCollectionId ? 'Edit collection' : 'Record payment'}
                </h2>
                <p className="text-xs text-gray-500">
                  {editingCollectionId
                    ? editingCollectionJobLabel
                    : 'Job payment or additional (e.g. part purchase)'}
                </p>
              </div>
              <button type="button" onClick={() => { setShowCollectionForm(false); setEditingCollectionId(null); }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {!editingCollectionId && (
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'job', label: 'Job payment' },
                  { key: 'additional', label: 'Additional (parts etc.)' },
                ] as const).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    className={`px-3 py-1.5 rounded-lg text-sm border ${
                      collectionMode === m.key
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setCollectionMode(m.key);
                      setSelectedJobIds([]);
                      setCollectionForm((f) => ({
                        ...f,
                        amount: '',
                        collectionType: m.key === 'additional' ? 'OTHER' : f.collectionType,
                        description: m.key === 'additional' ? f.description || 'Part purchase' : f.description,
                      }));
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {!editingCollectionId && collectionMode === 'job' && (
              <div>
                <label className="label">Search jobs</label>
                <input
                  className="input mb-2"
                  placeholder="Job no, customer, phone, rego, invoice..."
                  value={jobSearch}
                  onChange={(e) => {
                    setJobSearch(e.target.value);
                    loadCollectionJobs(e.target.value.trim() || undefined);
                  }}
                />
                <div className="flex flex-wrap gap-2 mb-2">
                  <button type="button" className="btn-secondary text-xs" onClick={selectAllUnpaidJobs}>
                    Select all unpaid (filtered)
                  </button>
                  <button type="button" className="btn-secondary text-xs" onClick={clearJobSelection}>
                    Clear selection
                  </button>
                  <span className="text-xs text-gray-500 self-center">
                    {selectedJobIds.length} selected · Balance {formatCurrency(selectedBalanceTotal)}
                  </span>
                </div>
                <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
                  {filteredCollectionJobs.length === 0 ? (
                    <p className="p-4 text-sm text-gray-400 text-center">No jobs found</p>
                  ) : (
                    filteredCollectionJobs.map((job) => {
                      const paid = job.isPaid;
                      const selected = selectedJobIds.includes(job.id);
                      return (
                        <label
                          key={job.id}
                          className={`flex items-start gap-3 p-3 text-sm ${
                            paid
                              ? 'bg-green-50 text-green-900 cursor-not-allowed'
                              : selected
                                ? 'bg-brand-50 cursor-pointer'
                                : 'hover:bg-gray-50 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            disabled={paid}
                            checked={selected && !paid}
                            onChange={() => toggleJob(job)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono font-medium">{job.jobNumber}</span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                paid
                                  ? 'bg-green-200 text-green-900'
                                  : job.paymentStatus === 'PARTIALLY_PAID'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-gray-100 text-gray-700'
                              }`}>
                                {formatStatus(job.paymentStatus)}
                              </span>
                            </div>
                            <p className="text-gray-700">
                              {job.customer?.name || '—'}
                              {job.vehicle?.registrationNo ? ` · ${job.vehicle.registrationNo}` : ''}
                              {job.invoice?.invoiceNumber ? ` · ${job.invoice.invoiceNumber}` : ''}
                            </p>
                            <p className={paid ? 'text-green-800' : 'text-gray-500'}>
                              Total {formatCurrency(job.jobTotal)}
                              {' · '}Paid {formatCurrency(job.amountPaid)}
                              {' · '}Balance {formatCurrency(job.balance)}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {!editingCollectionId && collectionMode === 'additional' && (
              <div className="space-y-3">
                <div>
                  <label className="label">Customer *</label>
                  <select
                    className="input"
                    required
                    value={collectionForm.customerId}
                    onChange={(e) => setCollectionForm({ ...collectionForm, customerId: e.target.value })}
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.phone ? ` · ${c.phone}` : ''} ({c.customerCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Description *</label>
                  <input
                    className="input"
                    required
                    placeholder="e.g. Part purchase — brake pads"
                    value={collectionForm.description}
                    onChange={(e) => setCollectionForm({ ...collectionForm, description: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Creates an invoice and records the payment in Finance collections.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={collectionForm.addGst}
                    onChange={(e) => setCollectionForm({ ...collectionForm, addGst: e.target.checked })}
                  />
                  Add GST (15%) — amount entered is ex-GST
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input"
                  required
                  value={collectionForm.amount}
                  onChange={(e) => setCollectionForm({ ...collectionForm, amount: e.target.value })}
                />
                {!editingCollectionId && collectionMode !== 'additional' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Defaults to selected balances (editable).
                  </p>
                )}
              </div>
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={collectionForm.paidAt}
                  onChange={(e) => setCollectionForm({ ...collectionForm, paidAt: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Payment type</label>
                <select
                  className="input"
                  value={collectionForm.collectionType}
                  onChange={(e) => setCollectionForm({ ...collectionForm, collectionType: e.target.value })}
                >
                  {COLLECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Method</label>
                <select
                  className="input"
                  value={collectionForm.paymentMethod}
                  onChange={(e) => setCollectionForm({ ...collectionForm, paymentMethod: e.target.value })}
                >
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Reference</label>
              <input
                className="input"
                value={collectionForm.reference}
                onChange={(e) => setCollectionForm({ ...collectionForm, reference: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                className="input"
                rows={2}
                value={collectionForm.notes}
                onChange={(e) => setCollectionForm({ ...collectionForm, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowCollectionForm(false); setEditingCollectionId(null); }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  !editingCollectionId
                  && (
                    (collectionMode === 'job' && !selectedJobIds.length)
                    || (collectionMode === 'additional' && (!collectionForm.customerId || !collectionForm.description.trim()))
                  )
                }
              >
                {editingCollectionId
                  ? 'Update collection'
                  : collectionMode === 'additional'
                    ? 'Save additional payment'
                    : `Save payment${
                      selectedJobIds.length > 1 ? ` (${selectedJobIds.length} jobs)` : ''
                    }`}
              </button>
            </div>
          </form>
        </div>
      )}

      {showExpenseForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={submitExpense} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">{editingExpenseId ? 'Edit expense' : 'Add expense'}</h2>
              <button type="button" onClick={() => setShowExpenseForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <select
                  className="input"
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({
                    ...expenseForm,
                    category: e.target.value,
                    employeeId: needsWageEmployee(e.target.value, expenseForm.otherType)
                      ? expenseForm.employeeId
                      : '',
                    supplierId: needsWageEmployee(e.target.value, expenseForm.otherType)
                      ? ''
                      : expenseForm.supplierId,
                  })}
                >
                  {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              {expenseForm.category === 'MATERIAL' && (
                <div>
                  <label className="label">Material type</label>
                  <select
                    className="input"
                    value={expenseForm.materialType}
                    onChange={(e) => setExpenseForm({ ...expenseForm, materialType: e.target.value })}
                  >
                    {MATERIAL_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              )}
              {expenseForm.category === 'OUTSOURCE' && (
                <div>
                  <label className="label">Expense type</label>
                  <select
                    className="input"
                    value={expenseForm.outsourceType}
                    onChange={(e) => setExpenseForm({ ...expenseForm, outsourceType: e.target.value })}
                  >
                    {OUTSOURCE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              {expenseForm.category === 'OTHER' && (
                <div>
                  <label className="label">Expense type</label>
                    <select
                      className="input"
                      value={expenseForm.otherType}
                      onChange={(e) => setExpenseForm({
                        ...expenseForm,
                        otherType: e.target.value,
                        employeeId: needsWageEmployee(expenseForm.category, e.target.value)
                          ? expenseForm.employeeId
                          : '',
                        supplierId: needsWageEmployee(expenseForm.category, e.target.value)
                          ? ''
                          : expenseForm.supplierId,
                      })}
                    >
                      {OTHER_EXPENSE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
              )}
            </div>
            <div>
              <label className="label">Description</label>
              <input
                className="input"
                required
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder="e.g. Power bill, Google Ads, fuel for tow"
              />
            </div>
            <div>
              <label className="label">Related job (optional)</label>
              {expenseForm.jobId && expenseSelectedJobLabel ? (
                <div className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2 bg-brand-50 text-sm">
                  <span className="min-w-0 truncate">{expenseSelectedJobLabel}</span>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline shrink-0"
                    onClick={() => {
                      setExpenseForm((f) => ({ ...f, jobId: '' }));
                      setExpenseSelectedJobLabel('');
                      setExpenseJobSearch('');
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className="input mb-2"
                    placeholder="Search job no, customer, rego..."
                    value={expenseJobSearch}
                    onChange={(e) => {
                      const q = e.target.value;
                      setExpenseJobSearch(q);
                      loadExpenseJobs(q.trim() || undefined);
                    }}
                  />
                  <div className="border rounded-lg max-h-40 overflow-y-auto divide-y">
                    {expenseJobOptions.length === 0 ? (
                      <p className="p-3 text-xs text-gray-400 text-center">No jobs found</p>
                    ) : expenseJobOptions.slice(0, 20).map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={() => {
                          setExpenseForm((f) => ({ ...f, jobId: job.id }));
                          setExpenseSelectedJobLabel(formatExpenseJobLabel(job));
                          setExpenseJobSearch('');
                        }}
                      >
                        <span className="font-mono font-medium">{job.jobNumber}</span>
                        <span className="text-gray-600">
                          {' · '}{job.customer?.name || '—'}
                          {job.vehicle?.registrationNo ? ` · ${job.vehicle.registrationNo}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="text-xs text-gray-500 mt-1">Link this expense to a job when it relates to one.</p>
            </div>
            {needsWageEmployee(expenseForm.category, expenseForm.otherType) && (
              <div>
                <label className="label">
                  Paid to (employee / labour) <span className="text-rose-600">*</span>
                </label>
                <select
                  className="input"
                  required
                  value={expenseForm.employeeId}
                  onChange={(e) => setExpenseForm({ ...expenseForm, employeeId: e.target.value })}
                >
                  <option value="">Select employee...</option>
                  {employeeOptions.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                      {emp.jobTitle ? ` · ${emp.jobTitle}` : ''}
                      {emp.employeeCode ? ` (${emp.employeeCode})` : ''}
                    </option>
                  ))}
                </select>
                {employeeOptions.length === 0 && (
                  <p className="text-xs text-rose-700 mt-1">No active employees — register one under Employees first.</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input"
                  required
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Date (week)</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={expenseForm.expenseDate}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={expenseForm.isPayable}
                onChange={(e) => {
                  const isPayable = e.target.checked;
                  setExpenseForm({
                    ...expenseForm,
                    isPayable,
                    paymentMethod: isPayable ? 'CREDIT' : (expenseForm.paymentMethod === 'CREDIT' ? 'CASH' : expenseForm.paymentMethod),
                  });
                }}
              />
              <span>
                <span className="block text-sm font-medium text-orange-900">Mark as payable (credit)</span>
                <span className="block text-xs text-orange-700 mt-0.5">
                  Not paid yet — still counted in this week’s payables, excluded from cash expenses / profit.
                </span>
              </span>
            </label>
            {!needsWageEmployee(expenseForm.category, expenseForm.otherType) && (
            <div>
              <label className="label">
                Supplier {expenseForm.isPayable ? <span className="text-rose-600">*</span> : <span className="text-gray-400 font-normal">(optional)</span>}
              </label>
              <select
                className="input"
                required={expenseForm.isPayable && !needsWageEmployee(expenseForm.category, expenseForm.otherType)}
                value={expenseForm.supplierId}
                onChange={(e) => setExpenseForm({ ...expenseForm, supplierId: e.target.value })}
              >
                <option value="">Select supplier...</option>
                {supplierOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.supplierCode ? ` (${s.supplierCode})` : ''}
                  </option>
                ))}
              </select>
              {expenseForm.isPayable && supplierOptions.length === 0 && (
                <p className="text-xs text-orange-700 mt-1">No suppliers yet — register one under Suppliers first.</p>
              )}
            </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{expenseForm.isPayable ? 'Due / method' : 'Paid by'}</label>
                <select
                  className="input"
                  value={expenseForm.paymentMethod}
                  onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                >
                  {expenseForm.isPayable && <option value="CREDIT">Credit</option>}
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Reference</label>
                <input
                  className="input"
                  value={expenseForm.reference}
                  onChange={(e) => setExpenseForm({ ...expenseForm, reference: e.target.value })}
                  placeholder={expenseForm.isPayable ? 'Supplier invoice / PO' : ''}
                />
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                className="input"
                rows={2}
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowExpenseForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary">{editingExpenseId ? 'Update' : 'Save expense'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
