import prisma from '../utils/prisma';
import { generateCode, parsePagination, softDeleteFilter } from '../utils/helpers';
import { AppError } from '../utils/response';
import { CustomerType, BusinessCompany, Prisma } from '@prisma/client';

export class CustomerService {
  async list(query: { page?: string; limit?: string; search?: string; customerType?: CustomerType }) {
    const { page, limit, skip } = parsePagination(query);
    const where: Prisma.CustomerWhereInput = {
      ...softDeleteFilter(),
      ...(query.customerType && { customerType: query.customerType }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { companyName: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { customerCode: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { vehicles: true, jobs: true } } },
      }),
      prisma.customer.count({ where }),
    ]);

    return { customers, total, page, limit };
  }

  async getById(id: string) {
    const customer = await prisma.customer.findFirst({
      where: { id, ...softDeleteFilter() },
      include: {
        vehicles: { where: softDeleteFilter() },
        leads: {
          where: softDeleteFilter(),
          select: { id: true, leadCode: true, customerName: true, status: true, phone: true },
          orderBy: { createdAt: 'desc' },
        },
        jobs: {
          where: softDeleteFilter(),
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { vehicle: true },
        },
        invoices: { where: softDeleteFilter(), take: 10, orderBy: { createdAt: 'desc' } },
        insuranceClaims: { where: softDeleteFilter(), take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!customer) throw new AppError(404, 'Customer not found', 'NOT_FOUND');
    return customer;
  }

  async create(data: {
    name: string;
    company?: BusinessCompany;
    companyName?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    customerType: CustomerType;
    source?: string;
    notes?: string;
  }, userId?: string) {
    return prisma.customer.create({
      data: {
        ...data,
        company: data.company || 'CEYLON_AUTOMOBILE',
        customerCode: generateCode('CU'),
        createdById: userId,
      },
    });
  }

  async update(id: string, data: Prisma.CustomerUpdateInput, userId?: string) {
    await this.getById(id);
    return prisma.customer.update({
      where: { id },
      data: { ...data, updatedById: userId },
    });
  }

  async delete(id: string, userId?: string) {
    await this.getById(id);
    return prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }
}

export const customerService = new CustomerService();
