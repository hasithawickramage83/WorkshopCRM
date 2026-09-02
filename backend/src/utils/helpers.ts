import { Decimal } from '@prisma/client/runtime/library';

export function generateCode(prefix: string): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}${y}${m}${d}${rand}`;
}

export function toNumber(value: Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

export const GST_RATE = 0.15;

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function toExGstAmount(gross: number, gstRate = GST_RATE) {
  return roundMoney(gross / (1 + gstRate));
}

/** pricesIncludeGst=true: entered amounts are GST-inclusive (118 → subtotal 102.61, gst 15.39, total 118) */
export function calculateInvoiceGstTotals(
  enteredTotal: number,
  discount: number,
  pricesIncludeGst: boolean,
  gstRate = GST_RATE,
) {
  if (pricesIncludeGst) {
    const total = roundMoney(Math.max(enteredTotal - discount, 0));
    const subtotal = toExGstAmount(total, gstRate);
    const gst = roundMoney(total - subtotal);
    return { subtotal, gst, total };
  }
  const subtotal = roundMoney(Math.max(enteredTotal - discount, 0));
  const gst = roundMoney(subtotal * gstRate);
  const total = roundMoney(subtotal + gst);
  return { subtotal, gst, total };
}

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

export function jobEnteredAmount(
  subTasks: { price?: unknown }[] | undefined,
  estimatedPrice?: unknown,
) {
  if (subTasks?.length) {
    return roundMoney(subTasks.reduce((s, t) => s + toNumber(t.price as never), 0));
  }
  return roundMoney(toNumber(estimatedPrice as never));
}

/** Display/collection total: entered + GST when addGst is enabled. */
export function jobAmountWithGst(
  subTasks: { price?: unknown }[] | undefined,
  estimatedPrice: unknown,
  job?: { addGst?: boolean | null; jobCategory?: string | null; jobSource?: string | null } | null,
) {
  const entered = jobEnteredAmount(subTasks, estimatedPrice);
  if (!jobShouldAddGst(job)) return entered;
  return calculateInvoiceGstTotals(entered, 0, false).total;
}

export function calculateQuotationTotals(
  labourCost: number,
  partsCost: number,
  paintCost: number,
  discount: number,
  gstRate = 0.15
) {
  const subtotal = labourCost + partsCost + paintCost;
  const afterDiscount = Math.max(0, subtotal - discount);
  const gst = afterDiscount * gstRate;
  const totalAmount = afterDiscount + gst;
  return { subtotal, gst, totalAmount };
}

export function parsePagination(query: { page?: string; limit?: string }) {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(500, Math.max(1, parseInt(query.limit || '20', 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function softDeleteFilter() {
  return { deletedAt: null };
}

const NZ_TIMEZONE = 'Pacific/Auckland';

export function getNzWorkDate(date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type AttendanceEventLike = {
  eventType: 'CLOCK_IN' | 'CLOCK_OUT';
  eventAt: Date;
};

export function calculateAttendanceHours(
  events: AttendanceEventLike[],
  asOf: Date = new Date(),
) {
  const sorted = [...events].sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());
  let workMs = 0;
  let breakMs = 0;
  let openIn: Date | null = null;
  let lastOut: Date | null = null;

  for (const event of sorted) {
    if (event.eventType === 'CLOCK_IN') {
      if (lastOut) {
        breakMs += event.eventAt.getTime() - lastOut.getTime();
        lastOut = null;
      }
      openIn = event.eventAt;
    } else if (event.eventType === 'CLOCK_OUT' && openIn) {
      workMs += event.eventAt.getTime() - openIn.getTime();
      openIn = null;
      lastOut = event.eventAt;
    }
  }

  if (openIn) {
    workMs += asOf.getTime() - openIn.getTime();
  }

  return {
    workMinutes: Math.round(workMs / 60000),
    breakMinutes: Math.round(breakMs / 60000),
    workHours: Math.round((workMs / 3600000) * 100) / 100,
    breakHours: Math.round((breakMs / 3600000) * 100) / 100,
  };
}
