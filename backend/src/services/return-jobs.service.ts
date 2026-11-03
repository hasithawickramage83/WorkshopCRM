import { JobReturnStatus, JobStatus, Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { AppError } from '../utils/response';
import { parsePagination, softDeleteFilter } from '../utils/helpers';

const FINISHED: JobStatus[] = ['COMPLETED', 'INVOICED', 'CLOSED'];

function parseReturnDate(value?: string) {
  const raw = value?.trim() || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError(400, 'Return date is required', 'RETURN_DATE_REQUIRED');
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

function ymd(value: Date) {
  return value.toISOString().slice(0, 10);
}

const jobSelect = {
  id: true,
  jobNumber: true,
  status: true,
  description: true,
  outDate: true,
  customer: { select: { id: true, name: true, phone: true } },
  vehicle: { select: { id: true, registrationNo: true, make: true, model: true } },
} satisfies Prisma.JobSelect;

function mapReturn(row: {
  id: string;
  jobId: string;
  returnedAt: Date;
  reason: string;
  notes: string | null;
  status: JobReturnStatus;
  createdAt: Date;
  job: {
    id: string;
    jobNumber: string;
    status: JobStatus;
    description: string | null;
    outDate: Date | null;
    customer: { id: string; name: string; phone: string | null };
    vehicle: { id: string; registrationNo: string; make: string; model: string };
  };
}) {
  return {
    id: row.id,
    jobId: row.jobId,
    returnedAt: ymd(row.returnedAt),
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt,
    job: {
      id: row.job.id,
      jobNumber: row.job.jobNumber,
      status: row.job.status,
      description: row.job.description,
      customer: row.job.customer,
      vehicle: row.job.vehicle,
    },
  };
}

export class ReturnJobsService {
  async list(query: { page?: string; limit?: string; search?: string; status?: string }) {
    const { page, limit, skip } = parsePagination(query);
    const search = query.search?.trim();
    const status = query.status === 'OPEN' || query.status === 'DONE' ? query.status : undefined;
    const where: Prisma.JobReturnWhereInput = {
      ...softDeleteFilter(),
      ...(status && { status }),
      ...(search && {
        OR: [
          { reason: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { job: { jobNumber: { contains: search, mode: 'insensitive' } } },
          { job: { customer: { name: { contains: search, mode: 'insensitive' } } } },
          { job: { vehicle: { registrationNo: { contains: search, mode: 'insensitive' } } } },
        ],
      }),
    };

    const [rows, total, open, done] = await Promise.all([
      prisma.jobReturn.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ returnedAt: 'desc' }, { createdAt: 'desc' }],
        include: { job: { select: jobSelect } },
      }),
      prisma.jobReturn.count({ where }),
      prisma.jobReturn.count({ where: { ...softDeleteFilter(), status: 'OPEN' } }),
      prisma.jobReturn.count({ where: { ...softDeleteFilter(), status: 'DONE' } }),
    ]);

    return {
      returns: rows.map(mapReturn),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary: { open, done },
    };
  }

  async create(
    data: { jobId: string; returnedAt: string; reason: string; notes?: string | null },
    userId?: string,
  ) {
    const job = await prisma.job.findFirst({
      where: { id: data.jobId, ...softDeleteFilter() },
      select: jobSelect,
    });
    if (!job) throw new AppError(404, 'Job not found', 'NOT_FOUND');

    const open = await prisma.jobReturn.findFirst({
      where: { jobId: job.id, status: 'OPEN', ...softDeleteFilter() },
    });
    if (open) {
      throw new AppError(400, 'This job already has an open return', 'RETURN_OPEN');
    }

    const reason = data.reason.trim();
    const returnedAt = parseReturnDate(data.returnedAt);
    const notes = data.notes?.trim() || null;
    const reopen = FINISHED.includes(job.status);

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.jobReturn.create({
        data: {
          jobId: job.id,
          returnedAt,
          reason,
          notes,
          status: 'OPEN',
          createdById: userId,
          updatedById: userId,
        },
        include: { job: { select: jobSelect } },
      });

      if (reopen || job.outDate) {
        await tx.job.update({
          where: { id: job.id },
          data: {
            ...(reopen ? { status: 'RECEIVED' } : {}),
            ...(job.outDate ? { outDate: null } : {}),
            updatedById: userId,
          },
        });
      }

      if (reopen) {
        await tx.jobStatusHistory.create({
          data: {
            jobId: job.id,
            fromStatus: job.status,
            toStatus: 'RECEIVED',
            notes: `Returned to workshop. ${reason}`,
            actionAt: new Date(`${ymd(returnedAt)}T12:00:00.000Z`),
            changedById: userId,
          },
        });
      }

      return row;
    });

    const fresh = await prisma.jobReturn.findUnique({
      where: { id: created.id },
      include: { job: { select: jobSelect } },
    });
    return mapReturn(fresh!);
  }

  async update(
    id: string,
    data: { returnedAt?: string; reason?: string; notes?: string | null; status?: JobReturnStatus },
    userId?: string,
  ) {
    const existing = await prisma.jobReturn.findFirst({
      where: { id, ...softDeleteFilter() },
    });
    if (!existing) throw new AppError(404, 'Return job not found', 'NOT_FOUND');

    const updated = await prisma.jobReturn.update({
      where: { id },
      data: {
        ...(data.returnedAt !== undefined ? { returnedAt: parseReturnDate(data.returnedAt) } : {}),
        ...(data.reason !== undefined ? { reason: data.reason.trim() } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedById: userId,
      },
      include: { job: { select: jobSelect } },
    });
    return mapReturn(updated);
  }

  async delete(id: string, userId?: string) {
    const existing = await prisma.jobReturn.findFirst({
      where: { id, ...softDeleteFilter() },
    });
    if (!existing) throw new AppError(404, 'Return job not found', 'NOT_FOUND');
    await prisma.jobReturn.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    return { id };
  }
}

export const returnJobsService = new ReturnJobsService();
