import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { AppError } from '../utils/response';
import { roundMoney, softDeleteFilter, toNumber } from '../utils/helpers';

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new AppError(400, 'Invalid date', 'INVALID_DATE');
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
}

function toYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mondayOf(value: string) {
  const date = parseDateOnly(value);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

function weekEndOf(weekStart: Date) {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

function formatNzDay(date: Date) {
  return date.toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function mapEmployee(employee: {
  id: string;
  employeeCode: string;
  name: string;
  jobTitle: string | null;
  hourlyRate: Prisma.Decimal | null;
  isActive: boolean;
}) {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    name: employee.name,
    jobTitle: employee.jobTitle,
    hourlyRate: employee.hourlyRate == null ? null : toNumber(employee.hourlyRate),
    isActive: employee.isActive,
  };
}

function mapEntry(row: {
  id: string;
  employeeId: string;
  weekStart: Date;
  hours: Prisma.Decimal;
  workedDays: number;
  hourlyRate: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  notes: string | null;
  expenseId: string | null;
}) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    weekStart: toYmd(row.weekStart),
    hours: toNumber(row.hours),
    workedDays: row.workedDays || 0,
    hourlyRate: toNumber(row.hourlyRate),
    totalAmount: toNumber(row.totalAmount),
    notes: row.notes,
    expenseId: row.expenseId,
  };
}

export class LabourHoursService {
  private async weekPayload(weekStart: Date) {
    const weekEnd = weekEndOf(weekStart);
    const [employees, entries] = await Promise.all([
      prisma.employee.findMany({
        where: { ...softDeleteFilter(), isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          jobTitle: true,
          hourlyRate: true,
          isActive: true,
        },
      }),
      prisma.labourWeeklyHours.findMany({
        where: { weekStart },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const employeeIds = new Set(employees.map((e) => e.id));
    const extraIds = entries.map((e) => e.employeeId).filter((id) => !employeeIds.has(id));
    const extraEmployees = extraIds.length
      ? await prisma.employee.findMany({
        where: { id: { in: extraIds }, ...softDeleteFilter() },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          jobTitle: true,
          hourlyRate: true,
          isActive: true,
        },
      })
      : [];

    return {
      weekStart: toYmd(weekStart),
      weekEnd: toYmd(weekEnd),
      employees: [...employees, ...extraEmployees].map(mapEmployee),
      entries: entries.map(mapEntry),
    };
  }

  async getWeek(weekStartRaw?: string) {
    const source = weekStartRaw?.trim()
      || new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
    return this.weekPayload(mondayOf(source));
  }

  async saveWeek(data: {
    weekStart: string;
    rows: Array<{
      employeeId: string;
      hours: number;
      workedDays?: number | null;
      hourlyRate?: number | null;
      notes?: string | null;
    }>;
  }, userId?: string) {
    const weekStart = mondayOf(data.weekStart);
    const weekEnd = weekEndOf(weekStart);
    const description = `Weekly hours · ${formatNzDay(weekStart)} – ${formatNzDay(weekEnd)}`;

    const employeeIds = [...new Set(data.rows.map((row) => row.employeeId))];
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, ...softDeleteFilter() },
    });
    const employeeById = new Map(employees.map((e) => [e.id, e]));
    if (employeeById.size !== employeeIds.length) {
      throw new AppError(400, 'One or more employees were not found', 'EMPLOYEE_NOT_FOUND');
    }

    await prisma.$transaction(async (tx) => {
      for (const row of data.rows) {
        const hours = roundMoney(row.hours);
        const workedDays = Math.max(0, Math.min(7, Math.round(row.workedDays || 0)));
        const hourlyRate = row.hourlyRate == null ? null : roundMoney(row.hourlyRate);
        const notes = row.notes?.trim() || null;
        const employee = employeeById.get(row.employeeId)!;

        if (hourlyRate != null) {
          await tx.employee.update({
            where: { id: employee.id },
            data: { hourlyRate, updatedById: userId },
          });
        }

        const existing = await tx.labourWeeklyHours.findUnique({
          where: { employeeId_weekStart: { employeeId: employee.id, weekStart } },
        });

        if (hours <= 0) {
          if (existing?.expenseId) {
            await tx.expense.updateMany({
              where: { id: existing.expenseId, deletedAt: null },
              data: { deletedAt: new Date() },
            });
          }
          if (existing) {
            await tx.labourWeeklyHours.delete({ where: { id: existing.id } });
          }
          continue;
        }

        const resolvedRate = hourlyRate ?? toNumber(employee.hourlyRate);
        if (!resolvedRate || resolvedRate <= 0) {
          throw new AppError(400, `Enter an hourly rate for ${employee.name}`, 'RATE_REQUIRED');
        }
        if (workedDays < 1) {
          throw new AppError(400, `Enter worked days for ${employee.name}`, 'WORKED_DAYS_REQUIRED');
        }

        const totalAmount = roundMoney(hours * resolvedRate);
        const expenseNotes = [
          `${workedDays} day${workedDays === 1 ? '' : 's'}`,
          `${hours}h × $${resolvedRate.toFixed(2)}/h`,
          notes,
        ].filter(Boolean).join(' · ');
        const reference = `LH-${employee.employeeCode}-${toYmd(weekStart).replace(/-/g, '')}`;

        let expenseId = existing?.expenseId || null;
        if (expenseId) {
          const expense = await tx.expense.findFirst({
            where: { id: expenseId, ...softDeleteFilter() },
          });
          if (expense) {
            await tx.expense.update({
              where: { id: expense.id },
              data: {
                category: 'LABOUR',
                employeeId: employee.id,
                description,
                amount: totalAmount,
                expenseDate: weekStart,
                notes: expenseNotes,
                reference,
              },
            });
          } else {
            expenseId = null;
          }
        }

        if (!expenseId) {
          const expense = await tx.expense.create({
            data: {
              employeeId: employee.id,
              category: 'LABOUR',
              description,
              amount: totalAmount,
              expenseDate: weekStart,
              isPayable: true,
              paymentMethod: 'CREDIT',
              reference,
              notes: expenseNotes,
              createdById: userId,
            },
          });
          expenseId = expense.id;
        }

        await tx.labourWeeklyHours.upsert({
          where: { employeeId_weekStart: { employeeId: employee.id, weekStart } },
          create: {
            employeeId: employee.id,
            weekStart,
            hours,
            workedDays,
            hourlyRate: resolvedRate,
            totalAmount,
            notes,
            expenseId,
            createdById: userId,
          },
          update: {
            hours,
            workedDays,
            hourlyRate: resolvedRate,
            totalAmount,
            notes,
            expenseId,
            updatedById: userId,
          },
        });
      }
    });

    return this.weekPayload(weekStart);
  }

  async deleteEntry(id: string) {
    const existing = await prisma.labourWeeklyHours.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Labour hours entry not found', 'NOT_FOUND');

    await prisma.$transaction(async (tx) => {
      if (existing.expenseId) {
        await tx.expense.updateMany({
          where: { id: existing.expenseId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
      }
      await tx.labourWeeklyHours.delete({ where: { id } });
    });

    return { id };
  }
}

export const labourHoursService = new LabourHoursService();
