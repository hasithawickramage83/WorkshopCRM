import { JobSubTaskType } from '@prisma/client';
import prisma from '../utils/prisma';
import { AppError } from '../utils/response';
import { softDeleteFilter } from '../utils/helpers';
import { canSelectAllLabours } from '../utils/pages';

type Actor = { userId?: string; role?: string; pages?: string[] };

function normalizeName(value?: string | null) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function linkedEmployees(userId?: string) {
  if (!userId) return [];
  const linked = await prisma.employee.findMany({
    where: { userId, ...softDeleteFilter(), isActive: true },
    orderBy: { name: 'asc' },
  });
  if (linked.length) return linked;

  const user = await prisma.user.findFirst({
    where: { id: userId, ...softDeleteFilter() },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!user) return [];

  const email = user.email.trim().toLowerCase();
  const fullName = normalizeName(`${user.firstName} ${user.lastName}`);
  const reverseName = normalizeName(`${user.lastName} ${user.firstName}`);

  const employees = await prisma.employee.findMany({
    where: { ...softDeleteFilter(), isActive: true },
    orderBy: { name: 'asc' },
  });

  return employees.filter((employee) => {
    if (employee.email?.trim().toLowerCase() === email) return true;
    const name = normalizeName(employee.name);
    return name === fullName || name === reverseName;
  });
}

async function allowedEmployeeIds(actor?: Actor) {
  if (canSelectAllLabours(actor?.role || '', actor?.pages || [])) {
    return null;
  }
  const linked = await linkedEmployees(actor?.userId);
  return new Set(linked.map((employee) => employee.id));
}

async function assertEmployeeAccess(employeeId: string, actor?: Actor) {
  const allowed = await allowedEmployeeIds(actor);
  if (!allowed) return;
  if (!allowed.has(employeeId)) {
    throw new AppError(403, 'You can only record tasks for your own labour record', 'FORBIDDEN');
  }
}

function parseWorkDate(value?: string) {
  const raw = value?.trim() || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError(400, 'Work date is required', 'WORK_DATE_REQUIRED');
  }
  return new Date(`${raw}T00:00:00.000Z`);
}

function durationFromTimes(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  let start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  const total = end - start;
  if (total <= 0) {
    throw new AppError(400, 'End time must be after start time', 'TIME_REQUIRED');
  }
  return total;
}

const jobInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  vehicle: { select: { id: true, registrationNo: true, make: true, model: true } },
} as const;

export class LabourTasksService {
  async listLabours(actor?: Actor) {
    const allowed = await allowedEmployeeIds(actor);
    if (!allowed) {
      const employees = await prisma.employee.findMany({
        where: { ...softDeleteFilter(), isActive: true },
        orderBy: { name: 'asc' },
      });
      return { employees, locked: false };
    }

    const employees = await prisma.employee.findMany({
      where: { id: { in: [...allowed] }, ...softDeleteFilter() },
      orderBy: { name: 'asc' },
    });
    return { employees, locked: true };
  }

  async list(employeeId?: string, workDate?: string, actor?: Actor) {
    if (!employeeId) {
      throw new AppError(400, 'Labour is required', 'EMPLOYEE_REQUIRED');
    }
    await assertEmployeeAccess(employeeId, actor);
    const date = parseWorkDate(workDate);
    const rows = await prisma.labourJobTask.findMany({
      where: { employeeId, workDate: date },
      include: { job: { include: jobInclude } },
      orderBy: [{ createdAt: 'asc' }],
    });

    const byJob = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byJob.get(row.jobId) || [];
      list.push(row);
      byJob.set(row.jobId, list);
    }

    const jobs = [...byJob.values()].map((tasks) => ({
      job: tasks[0].job,
      totalMinutes: tasks.reduce((sum, task) => sum + task.durationMinutes, 0),
      tasks: tasks.map((task) => ({
        id: task.id,
        taskType: task.taskType,
        otherLabel: task.otherLabel,
        description: task.description,
        startTime: task.startTime,
        endTime: task.endTime,
        durationMinutes: task.durationMinutes,
        workDate: task.workDate,
        createdAt: task.createdAt,
      })),
    }));

    return { employeeId, workDate: date, jobs };
  }

  async createBatch(
    data: {
      employeeId: string;
      jobId: string;
      workDate: string;
      tasks: { taskType: JobSubTaskType; otherLabel?: string | null; description?: string; startTime: string; endTime: string }[];
    },
    userId?: string,
    actor?: Actor,
  ) {
    await assertEmployeeAccess(data.employeeId, actor);
    const employee = await prisma.employee.findFirst({
      where: { id: data.employeeId, ...softDeleteFilter() },
    });
    if (!employee) throw new AppError(404, 'Labour not found', 'NOT_FOUND');
    if (!employee.isActive) throw new AppError(400, 'This labour is inactive', 'INACTIVE_EMPLOYEE');

    const job = await prisma.job.findFirst({
      where: { id: data.jobId, ...softDeleteFilter() },
      include: jobInclude,
    });
    if (!job) throw new AppError(404, 'Job not found', 'NOT_FOUND');

    const workDate = parseWorkDate(data.workDate);
    const created = await prisma.$transaction(
      data.tasks.map((task) =>
        prisma.labourJobTask.create({
          data: {
            employeeId: data.employeeId,
            jobId: data.jobId,
            taskType: task.taskType,
            otherLabel: task.taskType === 'OTHER' ? (task.otherLabel || '').trim() || null : null,
            description: (task.description || '').trim(),
            startTime: task.startTime,
            endTime: task.endTime,
            durationMinutes: durationFromTimes(task.startTime, task.endTime),
            workDate,
            createdById: userId,
            updatedById: userId,
          },
        }),
      ),
    );

    return {
      job,
      tasks: created,
      totalMinutes: created.reduce((sum, task) => sum + task.durationMinutes, 0),
    };
  }

  async update(
    id: string,
    data: { taskType: JobSubTaskType; otherLabel?: string | null; description?: string; startTime: string; endTime: string; workDate?: string },
    userId?: string,
    actor?: Actor,
  ) {
    const existing = await prisma.labourJobTask.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Task not found', 'NOT_FOUND');
    await assertEmployeeAccess(existing.employeeId, actor);

    return prisma.labourJobTask.update({
      where: { id },
      data: {
        taskType: data.taskType,
        otherLabel: data.taskType === 'OTHER' ? (data.otherLabel || '').trim() || null : null,
        description: (data.description || '').trim(),
        startTime: data.startTime,
        endTime: data.endTime,
        durationMinutes: durationFromTimes(data.startTime, data.endTime),
        ...(data.workDate ? { workDate: parseWorkDate(data.workDate) } : {}),
        updatedById: userId,
      },
    });
  }

  async delete(id: string, actor?: Actor) {
    const existing = await prisma.labourJobTask.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Task not found', 'NOT_FOUND');
    await assertEmployeeAccess(existing.employeeId, actor);
    await prisma.labourJobTask.delete({ where: { id } });
    return { id };
  }
}

export const labourTasksService = new LabourTasksService();
