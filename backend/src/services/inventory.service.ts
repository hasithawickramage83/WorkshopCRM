import prisma from '../utils/prisma';
import { generateCode, parsePagination, softDeleteFilter } from '../utils/helpers';
import { AppError } from '../utils/response';
import { BusinessCompany, PartCategory, Prisma } from '@prisma/client';

export class InventoryService {
  async list(query: {
    page?: string; limit?: string; search?: string;
    company?: BusinessCompany; partCategory?: PartCategory; inStock?: string;
  }) {
    const { page, limit, skip } = parsePagination(query);
    const where: Prisma.InventoryItemWhereInput = {
      ...softDeleteFilter(),
      ...(query.company && { company: query.company }),
      ...(query.partCategory && { partCategory: query.partCategory }),
      ...(query.inStock === 'true' && { quantity: { gt: 0 } }),
      ...(query.search && {
        OR: [
          { itemCode: { contains: query.search, mode: 'insensitive' } },
          { itemName: { contains: query.search, mode: 'insensitive' } },
          { vehicleMake: { contains: query.search, mode: 'insensitive' } },
          { vehicleModel: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { itemName: 'asc' },
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getById(id: string) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, ...softDeleteFilter() },
    });
    if (!item) throw new AppError(404, 'Inventory item not found', 'NOT_FOUND');
    return item;
  }

  async create(data: {
    itemName: string;
    company?: BusinessCompany;
    partCategory: PartCategory;
    vehicleMake?: string;
    vehicleModel?: string;
    description?: string;
    costPrice: number;
    sellingPrice: number;
    quantity?: number;
  }, userId?: string) {
    return prisma.inventoryItem.create({
      data: {
        itemCode: generateCode('INV'),
        itemName: data.itemName,
        company: data.company || 'CEYLON_AUTOMOBILE',
        partCategory: data.partCategory,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        description: data.description,
        costPrice: data.costPrice,
        sellingPrice: data.sellingPrice,
        quantity: data.quantity ?? 0,
        createdById: userId,
      },
    });
  }

  async update(id: string, data: Prisma.InventoryItemUpdateInput, userId?: string) {
    await this.getById(id);
    return prisma.inventoryItem.update({
      where: { id },
      data: { ...data, updatedById: userId },
    });
  }

  async adjustStock(id: string, delta: number, userId?: string) {
    const item = await this.getById(id);
    const newQty = item.quantity + delta;
    if (newQty < 0) {
      throw new AppError(400, `Insufficient stock for ${item.itemName}. Available: ${item.quantity}`, 'INSUFFICIENT_STOCK');
    }
    return prisma.inventoryItem.update({
      where: { id },
      data: { quantity: newQty, updatedById: userId },
    });
  }

  async delete(id: string, userId?: string) {
    await this.getById(id);
    return prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }
}

export const inventoryService = new InventoryService();
