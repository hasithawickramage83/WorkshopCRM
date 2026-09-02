import prisma from '../utils/prisma';
import { generateCode, parsePagination, softDeleteFilter, toNumber } from '../utils/helpers';
import { AppError } from '../utils/response';
import { LeadStatus, LeadSource, BusinessCompany, Prisma } from '@prisma/client';

function mapLead<T extends { estimatedPrice?: unknown }>(lead: T) {
  return {
    ...lead,
    estimatedPrice: lead.estimatedPrice == null ? null : toNumber(lead.estimatedPrice as never),
  };
}

export class LeadService {
  async list(query: {
    page?: string; limit?: string; search?: string;
    status?: LeadStatus; source?: LeadSource; assignedUserId?: string;
  }) {
    const { page, limit, skip } = parsePagination(query);
    const where: Prisma.LeadWhereInput = {
      ...softDeleteFilter(),
      ...(query.status && { status: query.status }),
      ...(query.source && { source: query.source }),
      ...(query.assignedUserId && { assignedUserId: query.assignedUserId }),
      ...(query.search && {
        OR: [
          { customerName: { contains: query.search, mode: 'insensitive' } },
          { companyName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedUser: { select: { id: true, firstName: true, lastName: true } },
          customer: { select: { id: true, name: true, customerCode: true } },
          followUps: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, description: true, nextDate: true, createdAt: true },
          },
          _count: { select: { followUps: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    return { leads: leads.map((l) => mapLead(l)), total, page, limit };
  }

  async getById(id: string) {
    const lead = await prisma.lead.findFirst({
      where: { id, ...softDeleteFilter() },
      include: {
        assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        followUps: {
          orderBy: { createdAt: 'desc' },
        },
        customer: true,
        _count: { select: { followUps: true } },
      },
    });
    if (!lead) throw new AppError(404, 'Lead not found', 'NOT_FOUND');
    return mapLead(lead);
  }

  async create(data: {
    customerName: string;
    company?: BusinessCompany;
    companyName?: string;
    phone?: string;
    email?: string;
    source: LeadSource;
    status?: LeadStatus;
    assignedUserId?: string;
    estimatedPrice?: number | null;
    notes?: string;
  }, userId?: string) {
    const lead = await prisma.lead.create({
      data: {
        customerName: data.customerName,
        company: data.company || 'CEYLON_AUTOMOBILE',
        companyName: data.companyName,
        phone: data.phone,
        email: data.email || undefined,
        source: data.source,
        status: data.status,
        assignedUserId: data.assignedUserId,
        estimatedPrice: data.estimatedPrice ?? null,
        notes: data.notes,
        leadCode: generateCode('LD'),
        createdById: userId,
      },
      include: { assignedUser: { select: { firstName: true, lastName: true } } },
    });
    const mapped = mapLead(lead);
    const { whatsappService } = await import('./whatsapp.service');
    whatsappService.notifyLeadCreated({
      leadCode: mapped.leadCode,
      customerName: mapped.customerName,
      phone: mapped.phone,
      source: mapped.source,
      estimatedPrice: mapped.estimatedPrice ?? null,
      notes: mapped.notes,
    });
    return mapped;
  }

  async update(id: string, data: {
    customerName?: string;
    company?: BusinessCompany;
    companyName?: string;
    phone?: string;
    email?: string;
    source?: LeadSource;
    status?: LeadStatus;
    assignedUserId?: string;
    customerId?: string | null;
    estimatedPrice?: number | null;
    notes?: string;
  }, userId?: string) {
    await this.getById(id);
    const lead = await prisma.lead.update({
      where: { id },
      data: {
        customerName: data.customerName,
        company: data.company,
        companyName: data.companyName,
        phone: data.phone,
        email: data.email === '' ? null : data.email,
        source: data.source,
        status: data.status,
        assignedUserId: data.assignedUserId,
        customerId: data.customerId === null ? null : data.customerId,
        estimatedPrice: data.estimatedPrice === undefined ? undefined : data.estimatedPrice,
        notes: data.notes,
        updatedById: userId,
      },
      include: {
        assignedUser: { select: { firstName: true, lastName: true } },
        customer: { select: { id: true, name: true, customerCode: true } },
      },
    });
    return mapLead(lead);
  }

  async addFollowUp(
    leadId: string,
    data: { status: LeadStatus; description: string; nextDate?: Date | null },
    userId?: string,
  ) {
    await this.getById(leadId);

    const [followUp] = await prisma.$transaction([
      prisma.leadFollowUp.create({
        data: {
          leadId,
          status: data.status,
          description: data.description.trim(),
          nextDate: data.nextDate || null,
          createdById: userId,
        },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: {
          status: data.status,
          updatedById: userId,
        },
      }),
    ]);

    return followUp;
  }

  async delete(id: string, userId?: string) {
    await this.getById(id);
    return prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }
}

export const leadService = new LeadService();
