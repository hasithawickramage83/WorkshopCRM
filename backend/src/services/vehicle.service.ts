import prisma from '../utils/prisma';
import { generateCode, parsePagination, softDeleteFilter } from '../utils/helpers';
import { AppError } from '../utils/response';
import { Prisma } from '@prisma/client';

export class VehicleService {
  async list(query: { page?: string; limit?: string; search?: string; ownerId?: string }) {
    const { page, limit, skip } = parsePagination(query);
    const where: Prisma.VehicleWhereInput = {
      ...softDeleteFilter(),
      ...(query.ownerId && { ownerId: query.ownerId }),
      ...(query.search && {
        OR: [
          { registrationNo: { contains: query.search, mode: 'insensitive' } },
          { make: { contains: query.search, mode: 'insensitive' } },
          { model: { contains: query.search, mode: 'insensitive' } },
          { vin: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { owner: { select: { id: true, name: true, customerCode: true } } },
      }),
      prisma.vehicle.count({ where }),
    ]);

    return { vehicles, total, page, limit };
  }

  async getById(id: string) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id, ...softDeleteFilter() },
      include: {
        owner: true,
        jobs: {
          where: softDeleteFilter(),
          orderBy: { createdAt: 'desc' },
          include: { assignedTechnician: { select: { firstName: true, lastName: true } } },
        },
        insuranceClaims: { where: softDeleteFilter(), orderBy: { createdAt: 'desc' } },
        photos: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!vehicle) throw new AppError(404, 'Vehicle not found', 'NOT_FOUND');
    return vehicle;
  }

  async create(data: {
    registrationNo: string;
    make: string;
    model: string;
    year?: number;
    colour?: string;
    vin?: string;
    engineNumber?: string;
    ownerId: string;
    notes?: string;
  }, userId?: string) {
    return prisma.vehicle.create({
      data: {
        ...data,
        vehicleCode: generateCode('VH'),
        createdById: userId,
      },
      include: { owner: true },
    });
  }

  async update(id: string, data: {
    registrationNo?: string;
    make?: string;
    model?: string;
    year?: number | null;
    colour?: string | null;
    vin?: string | null;
    engineNumber?: string | null;
    ownerId?: string;
    notes?: string | null;
  }, userId?: string) {
    await this.getById(id);

    if (data.registrationNo) {
      const clash = await prisma.vehicle.findFirst({
        where: {
          registrationNo: { equals: data.registrationNo.trim(), mode: 'insensitive' },
          id: { not: id },
          ...softDeleteFilter(),
        },
      });
      if (clash) {
        throw new AppError(409, 'Another vehicle already uses this registration number', 'DUPLICATE_REGO');
      }
    }

    if (data.ownerId) {
      const owner = await prisma.customer.findFirst({
        where: { id: data.ownerId, ...softDeleteFilter() },
      });
      if (!owner) throw new AppError(400, 'Owner customer not found', 'INVALID_OWNER');
    }

    return prisma.vehicle.update({
      where: { id },
      data: {
        ...(data.registrationNo !== undefined ? { registrationNo: data.registrationNo.trim() } : {}),
        ...(data.make !== undefined ? { make: data.make.trim() } : {}),
        ...(data.model !== undefined ? { model: data.model.trim() } : {}),
        ...(data.year !== undefined ? { year: data.year } : {}),
        ...(data.colour !== undefined ? { colour: data.colour } : {}),
        ...(data.vin !== undefined ? { vin: data.vin } : {}),
        ...(data.engineNumber !== undefined ? { engineNumber: data.engineNumber } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
        updatedById: userId,
      },
      include: { owner: true },
    });
  }

  async delete(id: string, userId?: string) {
    await this.getById(id);
    return prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }
}

export const vehicleService = new VehicleService();
