export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: string;
  /** Effective page keys the user may access */
  pages?: string[];
  /** Explicit override; null means inherit from role */
  allowedPages?: string[] | null;
}

export interface DashboardStats {
  totalCustomers: number;
  activeJobs: number;
  insuranceClaims: number;
  pendingQuotes: number;
  revenue: number;
  profit: number;
  jobsCompleted: number;
  techniciansActive: number;
  outstandingInvoices: number;
  salesFrom?: string;
  salesTo?: string;
  invoiceCount?: number;
  invoiceAmountPaid?: number;
  totalJobValue?: number;
  periodJobValue?: number;
  jobCount?: number;
}

export interface Customer {
  id: string;
  customerCode: string;
  name: string;
  company?: string;
  companyName?: string;
  phone?: string;
  email?: string;
  customerType: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  supplierCode: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  jobTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  hourlyRate?: number | null;
  isActive?: boolean;
  createdAt: string;
}

export interface LabourHoursEmployee {
  id: string;
  employeeCode: string;
  name: string;
  jobTitle?: string | null;
  hourlyRate?: number | null;
  isActive?: boolean;
}

export interface LabourHoursEntry {
  id: string;
  employeeId: string;
  weekStart: string;
  hours: number;
  workedDays: number;
  hourlyRate: number;
  totalAmount: number;
  notes?: string | null;
  expenseId?: string | null;
}

export interface LabourHoursWeek {
  weekStart: string;
  weekEnd: string;
  employees: LabourHoursEmployee[];
  entries: LabourHoursEntry[];
}

export interface Job {
  id: string;
  jobNumber: string;
  status: string;
  company?: string;
  jobType?: string;
  jobCategory?: string | null;
  priority?: string;
  estimatedPrice?: number | string | null;
  addGst?: boolean;
  jobSource?: string;
  dueDate?: string | null;
  description?: string;
  internalNotes?: string;
  receivedDate: string;
  customerId?: string;
  vehicleId?: string;
  assignedTechnicianId?: string | null;
  customer?: { id?: string; name: string; phone?: string };
  vehicle?: { id?: string; registrationNo: string; make: string; model: string };
  assignedTechnician?: { id?: string; firstName: string; lastName: string };
  subTasks?: { price?: number | string | null }[];
}

export const BUSINESS_COMPANIES = [
  { value: 'CEYLON_AUTOMOBILE', label: 'Ceylon Automobile' },
  { value: 'WEST_PANEL_AND_TYRES', label: 'West Panel and Tyres' },
] as const;

export const formatCompany = (company?: string | null) =>
  BUSINESS_COMPANIES.find((c) => c.value === company)?.label || company || '—';

export const JOB_TYPES = [
  { value: 'PAINTING', label: 'Painting' },
  { value: 'MECHANICAL', label: 'Mechanical' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'PANEL_BEATING', label: 'Panel Beating' },
  { value: 'INSTALLATIONS', label: 'Installations' },
  { value: 'TYRES', label: 'Tyres' },
  { value: 'BODY_WORK', label: 'Body Work' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const JOB_CATEGORIES = [
  { value: 'DEALER', label: 'Dealer' },
  { value: 'NON_DEALER', label: 'Non Dealer' },
  { value: 'BUSINESS', label: 'Business' },
] as const;

export const JOB_SOURCES = [
  { value: 'WALK_IN', label: 'Walk In' },
  { value: 'INSURANCE_CLAIM', label: 'Insurance Claim' },
  { value: 'DEALER', label: 'Dealer' },
  { value: 'FLEET', label: 'Fleet' },
  { value: 'TRADE', label: 'Trade' },
  { value: 'EXISTING_CUSTOMER', label: 'Existing Customer' },
  { value: 'LEAD_CONVERSION', label: 'Lead Conversion' },
] as const;

export const PART_CATEGORIES = [
  { value: 'BODY_KIT', label: 'Body Kit' },
  { value: 'TAIL_LIGHTS', label: 'Tail Lights' },
  { value: 'BUMPER', label: 'Bumper' },
  { value: 'HEADLIGHTS', label: 'Headlights' },
  { value: 'MIRRORS', label: 'Mirrors' },
  { value: 'GRILLE', label: 'Grille' },
  { value: 'SPOILER', label: 'Spoiler' },
  { value: 'FENDER', label: 'Fender' },
  { value: 'BONNET', label: 'Bonnet' },
  { value: 'DOOR', label: 'Door' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const formatJobType = (type?: string | null) =>
  JOB_TYPES.find((t) => t.value === type)?.label || formatStatus(type || 'OTHER');

export const formatJobCategory = (category?: string | null) =>
  JOB_CATEGORIES.find((c) => c.value === category)?.label || formatStatus(category || 'OTHER');

export function isDealerJob(job?: { jobCategory?: string | null; jobSource?: string | null } | null) {
  if (!job) return false;
  return job.jobCategory === 'DEALER' || (!job.jobCategory && job.jobSource === 'DEALER');
}

/** Totals follow the job addGst flag (GST is optional for all categories, including Dealer). */
export function jobShouldAddGst(job?: {
  addGst?: boolean | null;
  jobCategory?: string | null;
  jobSource?: string | null;
} | null) {
  return !!job?.addGst;
}

export const JOB_SUB_TASK_TYPES = [
  { value: 'PAINTING', label: 'Painting' },
  { value: 'INSTALLATION', label: 'Installation' },
  { value: 'PARTS', label: 'Parts' },
  { value: 'PANEL_BEATING', label: 'Panel Beating' },
  { value: 'MECHANICAL', label: 'Mechanical' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'LABOUR', label: 'Labour' },
  { value: 'BODY_WORK', label: 'Body Work' },
  { value: 'TYRES', label: 'Tyres' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const formatSubTaskType = (type?: string | null) =>
  JOB_SUB_TASK_TYPES.find((t) => t.value === type)?.label || formatStatus(type || 'OTHER');

export const COMPANY_INVOICE = {
  name: 'CEYLON AUTOMOBILE',
  legalName: 'Ceylon Automobile Limited',
  tradingAs: 'West Panel, Paint & Tyres',
  services: 'Panel Beating | Spray Painting | Tyres | Auto Parts',
  phone: '021 2147160',
  email: 'admin@ceylonautomobile.co.nz',
  address: '6E Cartwright Road, Kelston',
  city: 'Auckland 0602',
  gstNumber: '140-970-549',
  nzbn: '9429051G79149',
  bankName: 'BNZ',
  bankAccountName: 'Ceylon Automobile Limited',
  bankAccountNumber: '02-0108-0857313-00',
  lines: ['6E Cartwright Road, Kelston', 'Auckland 0602', 'New Zealand'],
  fullAddress: '6E Cartwright Road, Kelston, Auckland 0602, New Zealand',
};

export const formatPartCategory = (cat?: string | null) =>
  PART_CATEGORIES.find((c) => c.value === cat)?.label || formatStatus(cat || 'OTHER');

export const JOB_TYPE_COLORS: Record<string, string> = {
  PAINTING: 'bg-pink-100 text-pink-800',
  MECHANICAL: 'bg-blue-100 text-blue-800',
  ELECTRICAL: 'bg-yellow-100 text-yellow-800',
  PANEL_BEATING: 'bg-orange-100 text-orange-800',
  INSTALLATIONS: 'bg-purple-100 text-purple-800',
  TYRES: 'bg-gray-100 text-gray-800',
  BODY_WORK: 'bg-indigo-100 text-indigo-800',
  OTHER: 'bg-gray-100 text-gray-600',
};

export const JOB_PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  NORMAL: 'bg-blue-100 text-blue-800',
  HIGH: 'bg-orange-100 text-orange-800',
  URGENT: 'bg-red-100 text-red-800',
};

export const JOB_STATUS_COLORS: Record<string, string> = {
  RECEIVED: 'bg-gray-100 text-gray-800',
  INSPECTION: 'bg-blue-100 text-blue-800',
  QUOTED: 'bg-purple-100 text-purple-800',
  AWAITING_APPROVAL: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
  PANEL_BEATING: 'bg-orange-100 text-orange-800',
  PAINTING: 'bg-pink-100 text-pink-800',
  QUALITY_CHECK: 'bg-teal-100 text-teal-800',
  READY_FOR_DELIVERY: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-green-100 text-green-800',
  INVOICED: 'bg-blue-100 text-blue-800',
  CLOSED: 'bg-gray-100 text-gray-600',
};

export const GST_RATE = 0.15;

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const toExGstAmount = (gross: number) => roundMoney(gross / (1 + GST_RATE));

export function calculateInvoiceGstTotals(
  enteredTotal: number,
  discount = 0,
  pricesIncludeGst = true,
) {
  if (pricesIncludeGst) {
    const total = roundMoney(Math.max(enteredTotal - discount, 0));
    const subtotal = toExGstAmount(total);
    const gst = roundMoney(total - subtotal);
    return { subtotal, gst, total };
  }
  const subtotal = roundMoney(Math.max(enteredTotal - discount, 0));
  const gst = roundMoney(subtotal * GST_RATE);
  const total = roundMoney(subtotal + gst);
  return { subtotal, gst, total };
}

export function jobEnteredTotal(
  subTasks?: { price?: number | string | null }[],
  estimatedPrice?: number | string | null,
) {
  if (subTasks?.length) {
    return subTasks.reduce((sum, t) => sum + Number(t.price || 0), 0);
  }
  return Number(estimatedPrice || 0);
}

/** addGst=true: entered prices are ex-GST; show total with GST added */
export function jobPriceSummary(
  subTasks?: { price?: number | string | null }[],
  estimatedPrice?: number | string | null,
  addGst = false,
) {
  const entered = jobEnteredTotal(subTasks, estimatedPrice);
  if (!addGst) return { entered, subtotal: entered, gst: 0, total: entered };
  const { subtotal, gst, total } = calculateInvoiceGstTotals(entered, 0, false);
  return { entered, subtotal, gst, total };
}

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(amount);

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatStatus = (status: string) =>
  status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
