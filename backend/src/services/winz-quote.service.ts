import prisma from '../utils/prisma';
import { AppError } from '../utils/response';
import { GST_RATE, roundMoney, softDeleteFilter, toNumber } from '../utils/helpers';

type QuoteItemInput = {
  kind?: 'HEADING' | 'ITEM';
  description: string;
  quantity?: number;
  unitPrice?: number;
};

function toDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'Invalid date');
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

function dateStr(value: Date) {
  return value.toISOString().slice(0, 10);
}

function serialize(quote: {
  subtotal: unknown;
  gst: unknown;
  totalAmount: unknown;
  quoteDate: Date;
  expiryDate: Date;
  items?: Array<{ quantity: unknown; unitPrice: unknown; amount: unknown }>;
}) {
  return {
    ...quote,
    quoteDate: dateStr(quote.quoteDate),
    expiryDate: dateStr(quote.expiryDate),
    subtotal: toNumber(quote.subtotal as never),
    gst: toNumber(quote.gst as never),
    totalAmount: toNumber(quote.totalAmount as never),
    items: (quote.items || []).map((item) => ({
      ...item,
      quantity: toNumber(item.quantity as never),
      unitPrice: toNumber(item.unitPrice as never),
      amount: toNumber(item.amount as never),
    })),
  };
}

function normalizeItems(items: QuoteItemInput[]) {
  const rows = items
    .map((item, index) => {
      const kind = item.kind === 'HEADING' ? 'HEADING' : 'ITEM';
      const description = item.description.trim();
      const quantity = kind === 'HEADING' ? 0 : Number(item.quantity || 0);
      const unitPrice = kind === 'HEADING' ? 0 : Number(item.unitPrice || 0);
      const amount = kind === 'HEADING' ? 0 : roundMoney(quantity * unitPrice);
      return { kind, description, quantity, unitPrice, amount, sortOrder: index };
    })
    .filter((item) => item.description);

  if (!rows.length) throw new AppError(400, 'Add at least one line item or heading');
  if (!rows.some((item) => item.kind === 'ITEM')) {
    throw new AppError(400, 'Add at least one priced line item');
  }
  return rows;
}

function totalsFromItems(items: { kind: string; amount: number }[]) {
  const subtotal = roundMoney(items.filter((item) => item.kind === 'ITEM').reduce((sum, item) => sum + item.amount, 0));
  const gst = roundMoney(subtotal * GST_RATE);
  return { subtotal, gst, totalAmount: roundMoney(subtotal + gst) };
}

async function nextQuoteNumber() {
  const last = await prisma.winzQuote.findFirst({
    orderBy: { quoteNumber: 'desc' },
    select: { quoteNumber: true },
  });
  const current = last?.quoteNumber?.match(/(\d+)$/)?.[1];
  const next = (current ? parseInt(current, 10) : 0) + 1;
  return `QU-${String(next).padStart(4, '0')}`;
}

const itemInclude = { items: { orderBy: { sortOrder: 'asc' as const } } };

export const winzQuoteService = {
  async list(query: { search?: string; page?: string; limit?: string }) {
    const page = Math.max(parseInt(query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 200);
    const search = query.search?.trim();
    const where = {
      ...softDeleteFilter(),
      ...(search
        ? {
            OR: [
              { quoteNumber: { contains: search, mode: 'insensitive' as const } },
              { customerName: { contains: search, mode: 'insensitive' as const } },
              { vehicleRego: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [quotes, total] = await Promise.all([
      prisma.winzQuote.findMany({
        where,
        include: itemInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.winzQuote.count({ where }),
    ]);

    return { quotes: quotes.map((quote) => serialize(quote)), total, page, limit };
  },

  async getById(id: string) {
    const quote = await prisma.winzQuote.findFirst({
      where: { id, ...softDeleteFilter() },
      include: itemInclude,
    });
    if (!quote) throw new AppError(404, 'WINZ quote not found');
    return serialize(quote);
  },

  async create(data: {
    customerName: string;
    vehicleRego: string;
    quoteDate: string;
    expiryDate: string;
    notes?: string;
    terms?: string;
    items: QuoteItemInput[];
  }, userId?: string) {
    const items = normalizeItems(data.items);
    const totals = totalsFromItems(items);
    const quote = await prisma.winzQuote.create({
      data: {
        quoteNumber: await nextQuoteNumber(),
        customerName: data.customerName.trim(),
        vehicleRego: data.vehicleRego.trim(),
        quoteDate: toDateOnly(data.quoteDate),
        expiryDate: toDateOnly(data.expiryDate),
        notes: data.notes?.trim() || null,
        terms: data.terms?.trim() || null,
        createdById: userId,
        updatedById: userId,
        ...totals,
        items: { create: items },
      },
      include: itemInclude,
    });
    return serialize(quote);
  },

  async update(id: string, data: {
    customerName?: string;
    vehicleRego?: string;
    quoteDate?: string;
    expiryDate?: string;
    notes?: string;
    terms?: string;
    items?: QuoteItemInput[];
  }, userId?: string) {
    const existing = await prisma.winzQuote.findFirst({
      where: { id, ...softDeleteFilter() },
    });
    if (!existing) throw new AppError(404, 'WINZ quote not found');

    const items = data.items ? normalizeItems(data.items) : undefined;
    const totals = items ? totalsFromItems(items) : undefined;

    const quote = await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.winzQuoteItem.deleteMany({ where: { quoteId: id } });
      }
      return tx.winzQuote.update({
        where: { id },
        data: {
          customerName: data.customerName?.trim(),
          vehicleRego: data.vehicleRego?.trim(),
          quoteDate: data.quoteDate ? toDateOnly(data.quoteDate) : undefined,
          expiryDate: data.expiryDate ? toDateOnly(data.expiryDate) : undefined,
          notes: data.notes === undefined ? undefined : (data.notes.trim() || null),
          terms: data.terms === undefined ? undefined : (data.terms.trim() || null),
          updatedById: userId,
          ...(totals || {}),
          ...(items ? { items: { create: items } } : {}),
        },
        include: itemInclude,
      });
    });
    return serialize(quote);
  },

  async delete(id: string, userId?: string) {
    const existing = await prisma.winzQuote.findFirst({
      where: { id, ...softDeleteFilter() },
    });
    if (!existing) throw new AppError(404, 'WINZ quote not found');
    await prisma.winzQuote.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    return { id };
  },
};
