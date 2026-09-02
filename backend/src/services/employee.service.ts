import prisma from '../utils/prisma';
import { generateCode, parsePagination, softDeleteFilter } from '../utils/helpers';
import { AppError } from '../utils/response';
import { Prisma } from '@prisma/client';

export class EmployeeService {
  async list(query: { page?: string; limit?: string; search?: string; activeOnly?: string }) {
    const { page, limit, skip } = parsePagination(query);
    const activeOnly = query.activeOnly === 'true' || query.activeOnly === '1';
    const where: Prisma.EmployeeWhereInput = {
      ...softDeleteFilter(),
      ...(activeOnly ? { isActive: true } : {}),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { jobTitle: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { employeeCode: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      prisma.employee.count({ where }),
    ]);

    return { employees, total, page, limit };
  }

  async getById(id: string) {
    const employee = await prisma.employee.findFirst({
      where: { id, ...softDeleteFilter() },
    });
    if (!employee) throw new AppError(404, 'Employee not found', 'NOT_FOUND');
    return employee;
  }

  async create(data: {
    name: string;
    jobTitle?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }, userId?: string) {
    return prisma.employee.create({
      data: {
        employeeCode: generateCode('EM'),
        name: data.name.trim(),
        jobTitle: data.jobTitle?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        notes: data.notes?.trim() || null,
        isActive: data.isActive !== undefined ? !!data.isActive : true,
        createdById: userId,
      },
    });
  }

  async update(id: string, data: {
    name?: string;
    jobTitle?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }, userId?: string) {
    await this.getById(id);
    return prisma.employee.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle?.trim() || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        ...(data.isActive !== undefined ? { isActive: !!data.isActive } : {}),
        updatedById: userId,
      },
    });
  }

  async delete(id: string, userId?: string) {
    await this.getById(id);
    return prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }
}

export const employeeService = new EmployeeService();
