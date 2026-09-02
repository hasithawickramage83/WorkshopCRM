import prisma from '../utils/prisma';
import { generateCode, parsePagination, softDeleteFilter } from '../utils/helpers';
import { AppError } from '../utils/response';
import {
  JobStatus, JobSource, JobPriority, JobType, JobCategory,
  BusinessCompany, Prisma,
} from '@prisma/client';
import { SubTaskInput, sumSubTaskPrices } from '../utils/job-subtasks';

type JobInput = {
  customerId?: string;
  vehicleId?: string;
  jobSource?: JobSource;
  company?: BusinessCompany;
  jobType?: JobType;
  jobCategory?: JobCategory | null;
  dueDate?: string;
  assignedTechnicianId?: string | null;
  priority?: JobPriority;
  estimatedPrice?: number | null;
  addGst?: boolean;
  description?: string;
  internalNotes?: string;
  subTasks?: SubTaskInput[];
};

function mapJobData(data: JobInput): Prisma.JobUpdateInput {
  const mapped: Prisma.JobUpdateInput = {};
  if (data.customerId !== undefined) mapped.customer = { connect: { id: data.customerId } };
  if (data.vehicleId !== undefined) mapped.vehicle = { connect: { id: data.vehicleId } };
  if (data.jobSource !== undefined) mapped.jobSource = data.jobSource;
  if (data.company !== undefined) mapped.company = data.company;
  if (data.jobType !== undefined) mapped.jobType = data.jobType;
  if (data.jobCategory !== undefined) mapped.jobCategory = data.jobCategory;
  if (data.dueDate !== undefined) mapped.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.assignedTechnicianId !== undefined) {
    mapped.assignedTechnician = data.assignedTechnicianId
      ? { connect: { id: data.assignedTechnicianId } }
      : { disconnect: true };
  }
  if (data.priority !== undefined) mapped.priority = data.priority;
  if (data.estimatedPrice !== undefined) {
    mapped.estimatedPrice = data.estimatedPrice === null ? null : data.estimatedPrice;
  }
  if (data.addGst !== undefined) {
    mapped.addGst = data.addGst;
  }
  if (data.description !== undefined) mapped.description = data.description;
  if (data.internalNotes !== undefined) mapped.internalNotes = data.internalNotes;
  return mapped;
}

async function replaceSubTasks(jobId: string, subTasks: SubTaskInput[]) {
  await prisma.jobSubTask.deleteMany({ where: { jobId } });
  if (!subTasks.length) return;
  await prisma.jobSubTask.createMany({
    data: subTasks.map((task, index) => ({
      jobId,
      taskType: task.taskType,
      description: task.description.trim(),
      price: task.price ?? undefined,
      sortOrder: index,
    })),
  });
}

export class JobService {
  async list(query: {
    page?: string; limit?: string; search?: string;
    status?: JobStatus | 'ACTIVE' | 'DONE'; jobSource?: JobSource; assignedTechnicianId?: string; customerId?: string;
    priority?: JobPriority;
  }) {
    const { page, limit, skip } = parsePagination(query);
    const statusFilter = query.status === 'ACTIVE'
      ? { status: { notIn: ['COMPLETED', 'INVOICED', 'CLOSED'] as JobStatus[] } }
      : query.status === 'DONE'
        ? { status: { in: ['COMPLETED', 'INVOICED', 'CLOSED'] as JobStatus[] } }
        : query.status
          ? { status: query.status as JobStatus }
          : {};

    const where: Prisma.JobWhereInput = {
      ...softDeleteFilter(),
      ...statusFilter,
      ...(query.jobSource && { jobSource: query.jobSource }),
      ...(query.priority && { priority: query.priority }),
      ...(query.assignedTechnicianId && { assignedTechnicianId: query.assignedTechnicianId }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.search && {
        OR: [
          { jobNumber: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { customer: { name: { contains: query.search, mode: 'insensitive' } } },
          { customer: { phone: { contains: query.search, mode: 'insensitive' } } },
          { vehicle: { registrationNo: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          customer: { select: { id: true, name: true, phone: true, customerCode: true } },
          vehicle: { select: { id: true, registrationNo: true, make: true, model: true } },
          assignedTechnician: { select: { id: true, firstName: true, lastName: true } },
          subTasks: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    return { jobs, total, page, limit };
  }

  async getById(id: string) {
    const job = await prisma.job.findFirst({
      where: { id, ...softDeleteFilter() },
      include: {
        customer: true,
        vehicle: true,
        assignedTechnician: { select: { id: true, firstName: true, lastName: true, email: true } },
        subTasks: { orderBy: { sortOrder: 'asc' } },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          include: { changedBy: { select: { firstName: true, lastName: true } } },
        },
        insuranceClaim: true,
        quotations: { where: softDeleteFilter() },
        invoices: { where: softDeleteFilter() },
        photos: true,
      },
    });
    if (!job) throw new AppError(404, 'Job not found', 'NOT_FOUND');
    return job;
  }

  async create(data: JobInput & {
    customerId: string;
    vehicleId: string;
    jobSource: JobSource;
  }, userId?: string) {
    const subTasks = data.subTasks || [];
    const estimatedPrice = data.estimatedPrice ?? sumSubTaskPrices(subTasks) ?? undefined;

    const job = await prisma.job.create({
      data: {
        jobNumber: generateCode('JB'),
        customerId: data.customerId,
        vehicleId: data.vehicleId,
        jobSource: data.jobSource,
        company: data.company || 'CEYLON_AUTOMOBILE',
        jobType: data.jobType || 'OTHER',
        jobCategory: data.jobCategory ?? undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        assignedTechnicianId: data.assignedTechnicianId || undefined,
        priority: data.priority || 'NORMAL',
        estimatedPrice,
        addGst: data.addGst ?? false,
        description: data.description,
        internalNotes: data.internalNotes,
        createdById: userId,
      },
      include: {
        customer: true,
        vehicle: true,
        assignedTechnician: { select: { firstName: true, lastName: true } },
        subTasks: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (subTasks.length) {
      await replaceSubTasks(job.id, subTasks);
    }

    await prisma.jobStatusHistory.create({
      data: {
        jobId: job.id,
        toStatus: 'RECEIVED',
        notes: 'Job created',
        changedById: userId,
      },
    });

    const created = await this.getById(job.id);
    const { whatsappService } = await import('./whatsapp.service');
    whatsappService.notifyJobCreated(created);
    return created;
  }

  async updateStatus(id: string, status: JobStatus, notes: string, userId?: string) {
    const job = await this.getById(id);

    if (job.status === status) {
      throw new AppError(400, 'Job is already in this status', 'SAME_STATUS');
    }

    if (!notes?.trim()) {
      throw new AppError(400, 'Remark is required when changing job status', 'REMARK_REQUIRED');
    }

    const updated = await prisma.job.update({
      where: { id },
      data: { status, updatedById: userId },
      include: {
        customer: true,
        vehicle: true,
        assignedTechnician: { select: { firstName: true, lastName: true } },
      },
    });

    await prisma.jobStatusHistory.create({
      data: {
        jobId: id,
        fromStatus: job.status,
        toStatus: status,
        notes: notes.trim(),
        changedById: userId,
      },
    });

    return updated;
  }

  async update(id: string, data: JobInput, userId?: string) {
    await this.getById(id);

    const subTasks = data.subTasks;
    const estimatedPrice = data.estimatedPrice !== undefined
      ? data.estimatedPrice
      : subTasks
        ? sumSubTaskPrices(subTasks) ?? null
        : undefined;

    const updateData: JobInput = { ...data };
    if (estimatedPrice !== undefined) updateData.estimatedPrice = estimatedPrice;

    await prisma.job.update({
      where: { id },
      data: { ...mapJobData(updateData), updatedById: userId },
    });

    if (subTasks) {
      await replaceSubTasks(id, subTasks);
    }

    return this.getById(id);
  }

  async delete(id: string, remarks: string, userId?: string) {
    const job = await this.getById(id);
    const trimmed = remarks.trim();
    if (!trimmed) throw new AppError(400, 'Remarks are required to delete a job', 'REMARKS_REQUIRED');

    const updated = await prisma.job.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deleteRemarks: trimmed,
        updatedById: userId,
      },
    });

    await prisma.jobStatusHistory.create({
      data: {
        jobId: id,
        fromStatus: job.status,
        toStatus: job.status,
        notes: `Soft deleted · ${trimmed}`,
        changedById: userId,
      },
    });

    return {
      id: updated.id,
      jobNumber: updated.jobNumber,
      deletedAt: updated.deletedAt,
      deleteRemarks: updated.deleteRemarks,
    };
  }

  async permanentDelete(id: string) {
    const job = await prisma.job.findFirst({ where: { id } });
    if (!job) throw new AppError(404, 'Job not found', 'NOT_FOUND');

    await prisma.$transaction(async (tx) => {
      const invoices = await tx.invoice.findMany({ where: { jobId: id }, select: { id: true } });
      const invoiceIds = invoices.map((inv) => inv.id);
      if (invoiceIds.length) {
        await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await tx.invoice.deleteMany({ where: { jobId: id } });
      }
      await tx.quotation.updateMany({ where: { jobId: id }, data: { jobId: null } });
      await tx.insuranceClaim.updateMany({ where: { jobId: id }, data: { jobId: null } });
      await tx.vehiclePhoto.updateMany({ where: { jobId: id }, data: { jobId: null } });
      await tx.job.delete({ where: { id } });
    });

    return { deleted: true, jobNumber: job.jobNumber };
  }
}

export const jobService = new JobService();
