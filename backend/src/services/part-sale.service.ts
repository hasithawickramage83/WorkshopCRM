import prisma from '../utils/prisma';
import { generateCode, parsePagination, softDeleteFilter } from '../utils/helpers';
import { AppError } from '../utils/response';
import { BusinessCompany, PartCategory, PartSaleStatus, Prisma } from '@prisma/client';
import { inventoryService } from './inventory.service';

type PartSaleInput = {
  inventoryItemId?: string;
  company?: BusinessCompany;
  customerId?: string | null;
  customerName?: string;
  phone?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  status?: PartSaleStatus;
  notes?: string;
};

const saleInclude = {
  customer: { select: { id: true, name: true, customerCode: true } },
  inventoryItem: {
    select: {
      id: true, itemCode: true, itemName: true, vehicleMake: true, vehicleModel: true,
      costPrice: true, sellingPrice: true, quantity: true, partCategory: true,
    },
  },
};

async function loadInventoryItem(inventoryItemId: string) {
  return inventoryService.getById(inventoryItemId);
}

export class PartSaleService {
  async list(query: {
    page?: string; limit?: string; search?: string;
    company?: BusinessCompany; partCategory?: PartCategory; status?: PartSaleStatus;
  }) {
    const { page, limit, skip } = parsePagination(query);
    const where: Prisma.PartSaleWhereInput = {
      ...softDeleteFilter(),
      ...(query.company && { company: query.company }),
      ...(query.partCategory && { partCategory: query.partCategory }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { saleCode: { contains: query.search, mode: 'insensitive' } },
          { partName: { contains: query.search, mode: 'insensitive' } },
          { customerName: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [partSales, total] = await Promise.all([
      prisma.partSale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: saleInclude,
      }),
      prisma.partSale.count({ where }),
    ]);

    return { partSales, total, page, limit };
  }

  async getById(id: string) {
    const sale = await prisma.partSale.findFirst({
      where: { id, ...softDeleteFilter() },
      include: { customer: true, inventoryItem: true },
    });
    if (!sale) throw new AppError(404, 'Part sale not found', 'NOT_FOUND');
    return sale;
  }

  async create(data: PartSaleInput & {
    inventoryItemId: string;
    customerName: string;
  }, userId?: string) {
    const item = await loadInventoryItem(data.inventoryItemId);
    const quantity = data.quantity || 1;
    const unitPrice = data.unitPrice ?? Number(item.sellingPrice);
    const totalPrice = data.totalPrice ?? quantity * unitPrice;
    const status = data.status || 'PENDING';

    if (status === 'SOLD' && item.quantity < quantity) {
      throw new AppError(400, `Insufficient stock. Only ${item.quantity} available.`, 'INSUFFICIENT_STOCK');
    }

    return prisma.$transaction(async (tx) => {
      if (status === 'SOLD') {
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: { decrement: quantity }, updatedById: userId },
        });
      }

      return tx.partSale.create({
        data: {
          saleCode: generateCode('PS'),
          inventoryItemId: item.id,
          company: data.company || item.company,
          partCategory: item.partCategory,
          partName: item.itemName,
          customerId: data.customerId || undefined,
          customerName: data.customerName,
          phone: data.phone,
          quantity,
          unitPrice,
          totalPrice,
          status,
          notes: data.notes,
          soldAt: status === 'SOLD' ? new Date() : undefined,
          createdById: userId,
        },
        include: saleInclude,
      });
    });
  }

  async update(id: string, data: PartSaleInput, userId?: string) {
    const existing = await this.getById(id);
    const quantity = data.quantity ?? existing.quantity;
    let inventoryItemId = data.inventoryItemId ?? existing.inventoryItemId;

    if (!inventoryItemId && data.inventoryItemId) {
      throw new AppError(400, 'Inventory item is required', 'INVENTORY_REQUIRED');
    }

    const item = inventoryItemId ? await loadInventoryItem(inventoryItemId) : null;
    const unitPrice = data.unitPrice ?? (item ? Number(item.sellingPrice) : Number(existing.unitPrice));
    const totalPrice = data.totalPrice ?? quantity * unitPrice;
    const newStatus = data.status ?? existing.status;
    const oldStatus = existing.status;

    // Stock adjustments on status change
    if (inventoryItemId && oldStatus !== newStatus) {
      if (oldStatus === 'SOLD' && newStatus !== 'SOLD') {
        await inventoryService.adjustStock(inventoryItemId, existing.quantity, userId);
      } else if (oldStatus !== 'SOLD' && newStatus === 'SOLD') {
        const currentItem = await loadInventoryItem(inventoryItemId);
        if (currentItem.quantity < quantity) {
          throw new AppError(400, `Insufficient stock. Only ${currentItem.quantity} available.`, 'INSUFFICIENT_STOCK');
        }
        await inventoryService.adjustStock(inventoryItemId, -quantity, userId);
      }
    } else if (inventoryItemId && oldStatus === 'SOLD' && newStatus === 'SOLD' && quantity !== existing.quantity) {
      const delta = existing.quantity - quantity;
      await inventoryService.adjustStock(inventoryItemId, delta, userId);
    }

    return prisma.partSale.update({
      where: { id },
      data: {
        ...(data.inventoryItemId && item && {
          inventoryItemId: item.id,
          partCategory: item.partCategory,
          partName: item.itemName,
          company: data.company ?? item.company,
        }),
        ...(data.company !== undefined && !data.inventoryItemId && { company: data.company }),
        ...(data.customerId !== undefined && { customerId: data.customerId }),
        ...(data.customerName !== undefined && { customerName: data.customerName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        quantity,
        unitPrice,
        totalPrice,
        status: newStatus,
        soldAt: newStatus === 'SOLD' ? (existing.soldAt || new Date()) : newStatus === 'PENDING' ? null : existing.soldAt,
        ...(data.notes !== undefined && { notes: data.notes }),
        updatedById: userId,
      },
      include: saleInclude,
    });
  }

  async delete(id: string, userId?: string) {
    const existing = await this.getById(id);
    if (existing.status === 'SOLD' && existing.inventoryItemId) {
      await inventoryService.adjustStock(existing.inventoryItemId, existing.quantity, userId);
    }
    return prisma.partSale.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }
}

export const partSaleService = new PartSaleService();
