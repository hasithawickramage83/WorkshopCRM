import prisma from '../utils/prisma';
import { generateCode, parsePagination, softDeleteFilter, toNumber } from '../utils/helpers';
import { AppError } from '../utils/response';
import { Prisma } from '@prisma/client';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  isActive: true,
} as const;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: { user: { select: typeof userSelect } } }>;

function mapEmployee(employee: EmployeeRow) {
  return {
    ...employee,
    hourlyRate: employee.hourlyRate == null ? null : toNumber(employee.hourlyRate),
  };
}

async function resolveUserId(userId?: string | null) {
  const id = userId?.trim() || '';
  if (!id) return null;
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw new AppError(400, 'Linked login user was not found', 'USER_NOT_FOUND');
  return user.id;
}

async function assertUserAvailable(userId: string | null, employeeId?: string) {
  if (!userId) return;
  const taken = await prisma.employee.findFirst({
    where: {
      userId,
      ...softDeleteFilter(),
      ...(employeeId ? { id: { not: employeeId } } : {}),
    },
    select: { name: true, employeeCode: true },
  });
  if (taken) {
    throw new AppError(400, `This login is already linked to ${taken.name} (${taken.employeeCode})`, 'USER_LINKED');
  }
}

export class EmployeeService {
  async listUsers() {
    const users = await prisma.user.findMany({
      where: { deletedAt: null, isActive: true },
      select: userSelect,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return { users };
  }

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
        include: { user: { select: userSelect } },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      prisma.employee.count({ where }),
    ]);

    return { employees: employees.map(mapEmployee), total, page, limit };
  }

  async getById(id: string) {
    const employee = await prisma.employee.findFirst({
      where: { id, ...softDeleteFilter() },
      include: { user: { select: userSelect } },
    });
    if (!employee) throw new AppError(404, 'Employee not found', 'NOT_FOUND');
    return mapEmployee(employee);
  }

  async create(data: {
    name: string;
    jobTitle?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    hourlyRate?: number | null;
    isActive?: boolean;
    userId?: string | null;
  }, userId?: string) {
    const linkedUserId = await resolveUserId(data.userId);
    await assertUserAvailable(linkedUserId);
    const employee = await prisma.employee.create({
      data: {
        employeeCode: generateCode('EM'),
        name: data.name.trim(),
        jobTitle: data.jobTitle?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        notes: data.notes?.trim() || null,
        hourlyRate: data.hourlyRate == null ? null : data.hourlyRate,
        isActive: data.isActive !== undefined ? !!data.isActive : true,
        userId: linkedUserId,
        createdById: userId,
      },
      include: { user: { select: userSelect } },
    });
    return mapEmployee(employee);
  }

  async update(id: string, data: {
    name?: string;
    jobTitle?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    hourlyRate?: number | null;
    isActive?: boolean;
    userId?: string | null;
  }, userId?: string) {
    await this.getById(id);
    const linkedUserId = data.userId === undefined ? undefined : await resolveUserId(data.userId);
    if (linkedUserId !== undefined) {
      await assertUserAvailable(linkedUserId, id);
    }
    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle?.trim() || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        ...(data.hourlyRate !== undefined ? { hourlyRate: data.hourlyRate } : {}),
        ...(data.isActive !== undefined ? { isActive: !!data.isActive } : {}),
        ...(linkedUserId !== undefined ? { userId: linkedUserId } : {}),
        updatedById: userId,
      },
      include: { user: { select: userSelect } },
    });
    return mapEmployee(employee);
  }

  async delete(id: string, userId?: string) {
    await this.getById(id);
    return prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), userId: null, updatedById: userId },
    });
  }
}

export const employeeService = new EmployeeService();
