import { AttendanceEventType, ClockOutReason, Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { AppError } from '../utils/response';
import { config } from '../utils/config';
import {
  calculateAttendanceHours,
  getNzWorkDate,
  haversineDistanceMeters,
  softDeleteFilter,
} from '../utils/helpers';
import { resolveEffectivePages } from '../utils/pages';

type AttendanceStatus = 'NOT_STARTED' | 'WORKING' | 'ON_BREAK' | 'FINISHED';

function validateGeofence(latitude: number, longitude: number) {
  const { latitude: wLat, longitude: wLng, radiusMeters } = config.workshop;
  const distanceMeters = haversineDistanceMeters(latitude, longitude, wLat, wLng);
  const withinGeofence = distanceMeters <= radiusMeters;
  return { distanceMeters, withinGeofence };
}

function deriveStatus(
  events: { eventType: AttendanceEventType; clockOutReason: ClockOutReason | null }[],
): AttendanceStatus {
  if (events.length === 0) return 'NOT_STARTED';
  const last = events[events.length - 1];
  if (last.eventType === 'CLOCK_IN') return 'WORKING';
  if (last.clockOutReason === 'END_OF_DAY') return 'FINISHED';
  return 'ON_BREAK';
}

function formatHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

class AttendanceService {
  private async ensureAttendanceUser(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, isActive: true, ...softDeleteFilter() },
      include: { role: true },
    });
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    const pages = resolveEffectivePages(user.role.name, user.role.permissions, user.allowedPages);
    if (!pages.includes('attendance')) {
      throw new AppError(403, 'You do not have access to attendance', 'FORBIDDEN');
    }
    return user;
  }

  private async getTodayEvents(userId: string, workDate = getNzWorkDate()) {
    return prisma.attendanceEvent.findMany({
      where: { userId, workDate },
      orderBy: { eventAt: 'asc' },
    });
  }

  async getStatus(userId: string) {
    await this.ensureAttendanceUser(userId);
    const workDate = getNzWorkDate();
    const events = await this.getTodayEvents(userId, workDate);
    const status = deriveStatus(events);
    const hours = calculateAttendanceHours(events);
    const lastEvent = events[events.length - 1] ?? null;

    return {
      status,
      workDate: workDate.toISOString().slice(0, 10),
      today: {
        ...hours,
        workFormatted: formatHours(hours.workMinutes),
        breakFormatted: formatHours(hours.breakMinutes),
      },
      lastEvent: lastEvent
        ? {
            id: lastEvent.id,
            eventType: lastEvent.eventType,
            eventAt: lastEvent.eventAt,
            clockOutReason: lastEvent.clockOutReason,
            withinGeofence: lastEvent.withinGeofence,
            distanceMeters: lastEvent.distanceMeters,
          }
        : null,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        eventAt: e.eventAt,
        clockOutReason: e.clockOutReason,
        withinGeofence: e.withinGeofence,
        distanceMeters: e.distanceMeters,
      })),
      workshop: config.workshop,
    };
  }

  async clockIn(userId: string, latitude: number, longitude: number) {
    await this.ensureAttendanceUser(userId);
    const { distanceMeters, withinGeofence } = validateGeofence(latitude, longitude);
    if (!withinGeofence) {
      throw new AppError(
        400,
        `You must be at the workshop to clock in (${Math.round(distanceMeters)}m away, max ${config.workshop.radiusMeters}m)`,
        'OUTSIDE_GEOFENCE',
      );
    }

    const workDate = getNzWorkDate();
    const events = await this.getTodayEvents(userId, workDate);
    const status = deriveStatus(events);

    if (status === 'WORKING') {
      throw new AppError(400, 'You are already clocked in', 'ALREADY_CLOCKED_IN');
    }
    if (status === 'FINISHED') {
      throw new AppError(400, 'You have already finished for today', 'DAY_FINISHED');
    }

    const event = await prisma.attendanceEvent.create({
      data: {
        userId,
        eventType: AttendanceEventType.CLOCK_IN,
        latitude,
        longitude,
        distanceMeters,
        withinGeofence,
        workDate,
      },
    });

    return this.getStatus(userId);
  }

  async clockOut(
    userId: string,
    latitude: number,
    longitude: number,
    reason: ClockOutReason,
  ) {
    await this.ensureAttendanceUser(userId);
    const { distanceMeters, withinGeofence } = validateGeofence(latitude, longitude);
    if (!withinGeofence) {
      throw new AppError(
        400,
        `You must be at the workshop to clock out (${Math.round(distanceMeters)}m away, max ${config.workshop.radiusMeters}m)`,
        'OUTSIDE_GEOFENCE',
      );
    }

    const workDate = getNzWorkDate();
    const events = await this.getTodayEvents(userId, workDate);
    const status = deriveStatus(events);

    if (status !== 'WORKING') {
      throw new AppError(400, 'You must be clocked in to clock out', 'NOT_CLOCKED_IN');
    }

    await prisma.attendanceEvent.create({
      data: {
        userId,
        eventType: AttendanceEventType.CLOCK_OUT,
        latitude,
        longitude,
        distanceMeters,
        withinGeofence,
        workDate,
        clockOutReason: reason,
      },
    });

    return this.getStatus(userId);
  }

  async getMyHistory(userId: string, from?: string, to?: string) {
    await this.ensureAttendanceUser(userId);
    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : getNzWorkDate(new Date(Date.now() - 30 * 86400000));
    const toDate = to ? new Date(`${to}T00:00:00.000Z`) : getNzWorkDate();

    const events = await prisma.attendanceEvent.findMany({
      where: {
        userId,
        workDate: { gte: fromDate, lte: toDate },
      },
      orderBy: [{ workDate: 'desc' }, { eventAt: 'asc' }],
    });

    const byDate = new Map<string, typeof events>();
    for (const event of events) {
      const key = event.workDate.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(event);
    }

    const days = Array.from(byDate.entries()).map(([date, dayEvents]) => {
      const hours = calculateAttendanceHours(dayEvents);
      return {
        date,
        ...hours,
        workFormatted: formatHours(hours.workMinutes),
        breakFormatted: formatHours(hours.breakMinutes),
        events: dayEvents.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          eventAt: e.eventAt,
          clockOutReason: e.clockOutReason,
        })),
      };
    });

    return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10), days };
  }

  async getReport(query: { from?: string; to?: string; userId?: string }) {
    const fromDate = query.from
      ? new Date(`${query.from}T00:00:00.000Z`)
      : getNzWorkDate(new Date(Date.now() - 30 * 86400000));
    const toDate = query.to ? new Date(`${query.to}T00:00:00.000Z`) : getNzWorkDate();

    const events = await prisma.attendanceEvent.findMany({
      where: {
        workDate: { gte: fromDate, lte: toDate },
        ...(query.userId ? { userId: query.userId } : {}),
      },
      orderBy: [{ userId: 'asc' }, { workDate: 'asc' }, { eventAt: 'asc' }],
    });

    const eventUserIds = [...new Set(events.map((e) => e.userId))];

    const candidateUsers = await prisma.user.findMany({
      where: {
        ...softDeleteFilter(),
        ...(query.userId
          ? { id: query.userId }
          : {
              OR: [
                { isActive: true },
                ...(eventUserIds.length ? [{ id: { in: eventUserIds } }] : []),
              ],
            }),
      },
      include: { role: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    // Include staff who can use Attendance, plus anyone who punched in the period
    const users = candidateUsers.filter((u) => {
      if (eventUserIds.includes(u.id)) return true;
      if (!u.isActive) return false;
      return resolveEffectivePages(u.role.name, u.role.permissions, u.allowedPages).includes('attendance');
    });

    const eventsByUserDate = new Map<string, typeof events>();
    for (const event of events) {
      const key = `${event.userId}:${event.workDate.toISOString().slice(0, 10)}`;
      if (!eventsByUserDate.has(key)) eventsByUserDate.set(key, []);
      eventsByUserDate.get(key)!.push(event);
    }

    const employees = users.map((user) => {
      let totalWorkMinutes = 0;
      let totalBreakMinutes = 0;
      const days: {
        date: string;
        workMinutes: number;
        breakMinutes: number;
        workHours: number;
        workFormatted: string;
        breakFormatted: string;
        events: { eventType: string; eventAt: Date; clockOutReason: string | null }[];
      }[] = [];

      const cursor = new Date(fromDate);
      while (cursor <= toDate) {
        const dateKey = cursor.toISOString().slice(0, 10);
        const key = `${user.id}:${dateKey}`;
        const dayEvents = eventsByUserDate.get(key) ?? [];
        if (dayEvents.length > 0) {
          const hours = calculateAttendanceHours(dayEvents);
          totalWorkMinutes += hours.workMinutes;
          totalBreakMinutes += hours.breakMinutes;
          days.push({
            date: dateKey,
            workMinutes: hours.workMinutes,
            breakMinutes: hours.breakMinutes,
            workHours: hours.workHours,
            workFormatted: formatHours(hours.workMinutes),
            breakFormatted: formatHours(hours.breakMinutes),
            events: dayEvents.map((e) => ({
              eventType: e.eventType,
              eventAt: e.eventAt,
              clockOutReason: e.clockOutReason,
            })),
          });
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      return {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role.name,
        totalWorkMinutes,
        totalBreakMinutes,
        totalWorkHours: Math.round((totalWorkMinutes / 60) * 100) / 100,
        totalWorkFormatted: formatHours(totalWorkMinutes),
        totalBreakFormatted: formatHours(totalBreakMinutes),
        daysWorked: days.length,
        days,
      };
    });

    return {
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      workshop: config.workshop,
      employees,
    };
  }
}

export const attendanceService = new AttendanceService();
