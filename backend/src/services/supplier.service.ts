import prisma from '../utils/prisma';
import { generateCode, parsePagination, softDeleteFilter } from '../utils/helpers';
import { AppError } from '../utils/response';
import { Prisma } from '@prisma/client';

export class SupplierService {
  async list(query: { page?: string; limit?: string; search?: string }) {
    const { page, limit, skip } = parsePagination(query);
    const where: Prisma.SupplierWhereInput = {
      ...softDeleteFilter(),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { contactPerson: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { supplierCode: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.supplier.count({ where }),
    ]);

    return { suppliers, total, page, limit };
  }

  async getById(id: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, ...softDeleteFilter() },
    });
    if (!supplier) throw new AppError(404, 'Supplier not found', 'NOT_FOUND');
    return supplier;
  }

  async create(data: {
    name: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  }, userId?: string) {
    return prisma.supplier.create({
      data: {
        supplierCode: generateCode('SU'),
        name: data.name.trim(),
        contactPerson: data.contactPerson?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
        notes: data.notes?.trim() || null,
        createdById: userId,
      },
    });
  }

  async update(id: string, data: {
    name?: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
  }, userId?: string) {
    await this.getById(id);
    return prisma.supplier.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.contactPerson !== undefined ? { contactPerson: data.contactPerson?.trim() || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
        ...(data.address !== undefined ? { address: data.address?.trim() || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        updatedById: userId,
      },
    });
  }

  async delete(id: string, userId?: string) {
    await this.getById(id);
    return prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }
}

export const supplierService = new SupplierService();
