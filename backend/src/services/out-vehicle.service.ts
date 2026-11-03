import { JobStatus, OutInvoiceType, Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { AppError } from '../utils/response';
import { jobAmountWithGst, softDeleteFilter, toNumber } from '../utils/helpers';

function parseDateOnly(value: string, endOfDay = false) {
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(400, 'Invalid date', 'INVALID_DATE');
  }
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

const jobSelect = {
  id: true,
  jobNumber: true,
  status: true,
  jobType: true,
  jobCategory: true,
  jobSource: true,
  addGst: true,
  receivedDate: true,
  dueDate: true,
  description: true,
  estimatedPrice: true,
  outDate: true,
  outInvoiceType: true,
  outInvoiceNumber: true,
  outNotes: true,
  customer: { select: { id: true, name: true, phone: true } },
  vehicle: {
    select: {
      id: true,
      registrationNo: true,
      make: true,
      model: true,
      year: true,
      colour: true,
    },
  },
  subTasks: { select: { price: true } },
  invoices: {
    where: softDeleteFilter(),
    select: { id: true, invoiceNumber: true, total: true, paymentStatus: true },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
  statusHistory: {
    where: { toStatus: 'CLOSED' as const },
    orderBy: [{ actionAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 1,
    select: { actionAt: true, createdAt: true },
  },
};

function toYmd(value?: Date | string | null) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseClosedDate(value?: string | null) {
  const raw = value?.trim() || '';
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError(400, 'Invalid job closed date', 'INVALID_DATE');
  }
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

async function applyJobClosed(
  tx: Prisma.TransactionClient,
  job: { id: string; status: string },
  closedDate: Date,
  userId?: string,
  notes?: string,
) {
  if (job.status !== 'CLOSED') {
    await tx.job.update({
      where: { id: job.id },
      data: { status: 'CLOSED', updatedById: userId },
    });
  }

  const existing = await tx.jobStatusHistory.findFirst({
    where: { jobId: job.id, toStatus: 'CLOSED' },
    orderBy: [{ actionAt: 'desc' }, { createdAt: 'desc' }],
  });

  const remark = notes || 'Job closed from Out Vehicles';
  if (existing) {
    await tx.jobStatusHistory.update({
      where: { id: existing.id },
      data: { actionAt: closedDate, notes: remark },
    });
    return;
  }

  await tx.jobStatusHistory.create({
    data: {
      jobId: job.id,
      fromStatus: job.status as JobStatus,
      toStatus: 'CLOSED',
      notes: remark,
      actionAt: closedDate,
      changedById: userId,
    },
  });
}

function mapJob(job: {
  estimatedPrice?: unknown;
  addGst?: boolean;
  jobCategory?: string | null;
  jobSource?: string | null;
  outDate?: Date | null;
  subTasks: { price?: unknown }[];
  invoices: { id: string; invoiceNumber: string; total: unknown; paymentStatus: string }[];
  statusHistory?: { actionAt?: Date | null; createdAt: Date }[];
}) {
  const { invoices, estimatedPrice, subTasks, statusHistory, ...rest } = job;
  const invoice = invoices[0] || null;
  const closed = statusHistory?.[0];
  const jobAmount = invoice
    ? toNumber(invoice.total as never)
    : jobAmountWithGst(subTasks, estimatedPrice, job);

  return {
    ...rest,
    estimatedPrice: toNumber(estimatedPrice as never),
    jobAmount,
    isOut: !!rest.outDate,
    jobClosedDate: toYmd(closed?.actionAt || closed?.createdAt || null),
    invoice: invoice
      ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          total: toNumber(invoice.total as never),
          paymentStatus: invoice.paymentStatus,
        }
      : null,
  };
}

function buildSearchFilter(search?: string): Prisma.JobWhereInput | undefined {
  if (!search?.trim()) return undefined;
  const q = search.trim();
  return {
    OR: [
      { jobNumber: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { phone: { contains: q, mode: 'insensitive' } } },
      { vehicle: { registrationNo: { contains: q, mode: 'insensitive' } } },
      { outInvoiceNumber: { contains: q, mode: 'insensitive' } },
    ],
  };
}

function buildDateFilter(
  status: 'in' | 'out' | 'all',
  from?: string,
  to?: string,
): Prisma.JobWhereInput {
  if (!from && !to) return {};
  const range = {
    ...(from ? { gte: parseDateOnly(from) } : {}),
    ...(to ? { lte: parseDateOnly(to, true) } : {}),
  };
  // Out view filters by out date; all/in use received date
  if (status === 'out') return { outDate: { not: null, ...range } };
  return { receivedDate: range };
}

export class OutVehicleService {
  async list(query: {
    page?: string;
    limit?: string;
    search?: string;
    status?: 'in' | 'out' | 'all';
    from?: string;
    to?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    const status = query.status || 'all';
    const searchFilter = buildSearchFilter(query.search);

    // Summary always reflects full period/search (all jobs), not the view filter
    const summaryWhere: Prisma.JobWhereInput = {
      ...softDeleteFilter(),
      ...buildDateFilter('all', query.from, query.to),
      ...(searchFilter || {}),
    };

    const listWhere: Prisma.JobWhereInput = {
      ...softDeleteFilter(),
      ...(status === 'in' ? { outDate: null } : {}),
      ...(status === 'out' ? { outDate: { not: null } } : {}),
      ...buildDateFilter(status, query.from, query.to),
      ...(searchFilter || {}),
    };

    const [jobs, listTotal, summaryRows] = await Promise.all([
      prisma.job.findMany({
        where: listWhere,
        select: jobSelect,
        orderBy: status === 'out'
          ? [{ outDate: 'desc' }, { updatedAt: 'desc' }]
          : [{ receivedDate: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.job.count({ where: listWhere }),
      prisma.job.findMany({
        where: summaryWhere,
        select: {
          outDate: true,
          estimatedPrice: true,
          addGst: true,
          jobCategory: true,
          jobSource: true,
          subTasks: { select: { price: true } },
          invoices: {
            where: softDeleteFilter(),
            select: { total: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    const totalJobValue = Math.round(
      summaryRows.reduce((sum, job) => {
        const invoice = job.invoices[0];
        const amount = invoice
          ? toNumber(invoice.total)
          : jobAmountWithGst(job.subTasks, job.estimatedPrice, job);
        return sum + amount;
      }, 0) * 100,
    ) / 100;
    const outCount = summaryRows.filter((j) => j.outDate).length;
    const totalPages = Math.max(1, Math.ceil(listTotal / limit));

    return {
      jobs: jobs.map((j) => mapJob(j)),
      total: listTotal,
      page,
      limit,
      totalPages,
      status,
      summary: {
        totalJobs: summaryRows.length,
        totalJobValue,
        outCount,
        inCount: summaryRows.length - outCount,
      },
    };
  }

  async markOut(jobId: string, data: {
    outDate: string;
    outInvoiceType: OutInvoiceType;
    outInvoiceNumber?: string | null;
    outNotes?: string | null;
    markCompleted?: boolean;
    jobClosedDate?: string | null;
  }, userId?: string) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, ...softDeleteFilter() },
    });
    if (!job) throw new AppError(404, 'Job not found', 'NOT_FOUND');
    if (job.outDate) {
      throw new AppError(400, 'Vehicle is already marked out. Use update instead.', 'ALREADY_OUT');
    }

    const outDate = parseDateOnly(data.outDate);
    const closedAt = parseClosedDate(data.jobClosedDate);
    const shouldComplete = !closedAt
      && data.markCompleted !== false
      && !['COMPLETED', 'INVOICED', 'CLOSED'].includes(job.status);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: jobId },
        data: {
          outDate,
          outInvoiceType: data.outInvoiceType,
          outInvoiceNumber: data.outInvoiceNumber?.trim() || null,
          outNotes: data.outNotes?.trim() || null,
          ...(shouldComplete ? { status: 'COMPLETED' } : {}),
          updatedById: userId,
        },
      });

      if (closedAt) {
        await applyJobClosed(
          tx,
          job,
          closedAt,
          userId,
          `Job closed from Out Vehicles · ${data.outInvoiceType} invoice${data.outInvoiceNumber ? ` ${data.outInvoiceNumber}` : ''}`,
        );
      } else if (shouldComplete) {
        await tx.jobStatusHistory.create({
          data: {
            jobId,
            fromStatus: job.status,
            toStatus: 'COMPLETED',
            notes: `Vehicle out · ${data.outInvoiceType} invoice${data.outInvoiceNumber ? ` ${data.outInvoiceNumber}` : ''}`,
            changedById: userId,
          },
        });
      }

      return tx.job.findFirstOrThrow({ where: { id: jobId }, select: jobSelect });
    });

    const mapped = mapJob(updated);
    const { whatsappService } = await import('./whatsapp.service');
    whatsappService.notifyVehicleOut(mapped);
    return mapped;
  }

  async updateOut(jobId: string, data: {
    outDate?: string;
    outInvoiceType?: OutInvoiceType;
    outInvoiceNumber?: string | null;
    outNotes?: string | null;
    clearOut?: boolean;
    jobClosedDate?: string | null;
  }, userId?: string) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, ...softDeleteFilter() },
    });
    if (!job) throw new AppError(404, 'Job not found', 'NOT_FOUND');

    if (data.clearOut) {
      const cleared = await prisma.job.update({
        where: { id: jobId },
        data: {
          outDate: null,
          outInvoiceType: null,
          outInvoiceNumber: null,
          outNotes: null,
          updatedById: userId,
        },
        select: jobSelect,
      });
      return mapJob(cleared);
    }

    if (!job.outDate && !data.outDate) {
      throw new AppError(400, 'Vehicle is not marked out yet', 'NOT_OUT');
    }

    const closedAt = parseClosedDate(data.jobClosedDate);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: jobId },
        data: {
          outDate: data.outDate ? parseDateOnly(data.outDate) : undefined,
          outInvoiceType: data.outInvoiceType,
          outInvoiceNumber: data.outInvoiceNumber === undefined
            ? undefined
            : (data.outInvoiceNumber?.trim() || null),
          outNotes: data.outNotes === undefined ? undefined : (data.outNotes?.trim() || null),
          updatedById: userId,
        },
      });

      if (closedAt) {
        await applyJobClosed(
          tx,
          job,
          closedAt,
          userId,
          'Job closed from Out Vehicles',
        );
      }

      return tx.job.findFirstOrThrow({ where: { id: jobId }, select: jobSelect });
    });

    return mapJob(updated);
  }
}

export const outVehicleService = new OutVehicleService();
