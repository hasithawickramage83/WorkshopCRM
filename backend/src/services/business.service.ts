import prisma from '../utils/prisma';
import { generateCode, parsePagination, softDeleteFilter, calculateQuotationTotals, toNumber, calculateInvoiceGstTotals, toExGstAmount, roundMoney } from '../utils/helpers';
import { AppError } from '../utils/response';
import { ClaimStatus, QuotationStatus, InvoicePaymentStatus, JobType, Prisma } from '@prisma/client';
import { config } from '../utils/config';
import { buildQuotationPlainText, buildQuotationHtml, QuotationEmailData } from '../utils/email-templates';
import { deepSeekService } from './deepseek.service';

function normalizeWhatsAppPhone(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = `64${p.slice(1)}`;
  else if (!p.startsWith('64')) p = `64${p}`;
  return p;
}

function formatQuotationDate(date: Date | null | undefined): string {
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

export class InsuranceService {
  async list(query: { page?: string; limit?: string; search?: string; approvalStatus?: ClaimStatus }) {
    const { page, limit, skip } = parsePagination(query);
    const where: Prisma.InsuranceClaimWhereInput = {
      ...softDeleteFilter(),
      ...(query.approvalStatus && { approvalStatus: query.approvalStatus }),
      ...(query.search && {
        OR: [
          { claimCode: { contains: query.search, mode: 'insensitive' } },
          { insuranceCompany: { contains: query.search, mode: 'insensitive' } },
          { claimNumber: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [claims, total] = await Promise.all([
      prisma.insuranceClaim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true } },
          vehicle: { select: { id: true, registrationNo: true, make: true, model: true } },
          job: { select: { id: true, jobNumber: true, status: true } },
        },
      }),
      prisma.insuranceClaim.count({ where }),
    ]);

    return { claims, total, page, limit };
  }

  async getById(id: string) {
    const claim = await prisma.insuranceClaim.findFirst({
      where: { id, ...softDeleteFilter() },
      include: { customer: true, vehicle: true, job: true },
    });
    if (!claim) throw new AppError(404, 'Insurance claim not found', 'NOT_FOUND');
    return claim;
  }

  async create(data: {
    insuranceCompany: string;
    claimNumber?: string;
    policyNumber?: string;
    customerId: string;
    vehicleId: string;
    jobId?: string;
    assessorName?: string;
    approvalStatus?: ClaimStatus;
    approvedAmount?: number;
    excessAmount?: number;
    notes?: string;
  }, userId?: string) {
    return prisma.insuranceClaim.create({
      data: {
        ...data,
        claimCode: generateCode('CL'),
        createdById: userId,
      },
      include: { customer: true, vehicle: true, job: true },
    });
  }

  async update(id: string, data: Prisma.InsuranceClaimUpdateInput, userId?: string) {
    await this.getById(id);
    return prisma.insuranceClaim.update({
      where: { id },
      data: { ...data, updatedById: userId },
      include: { customer: true, vehicle: true, job: true },
    });
  }

  async delete(id: string, userId?: string) {
    await this.getById(id);
    return prisma.insuranceClaim.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }
}

export class QuotationService {
  async list(query: { page?: string; limit?: string; status?: QuotationStatus; customerId?: string }) {
    const { page, limit, skip } = parsePagination(query);
    const where: Prisma.QuotationWhereInput = {
      ...softDeleteFilter(),
      ...(query.status && { status: query.status }),
      ...(query.customerId && { customerId: query.customerId }),
    };

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true } },
          job: { select: { id: true, jobNumber: true } },
          items: true,
        },
      }),
      prisma.quotation.count({ where }),
    ]);

    return { quotations, total, page, limit };
  }

  async getById(id: string) {
    const quotation = await prisma.quotation.findFirst({
      where: { id, ...softDeleteFilter() },
      include: { customer: true, job: true, items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!quotation) throw new AppError(404, 'Quotation not found', 'NOT_FOUND');
    return quotation;
  }

  async create(data: {
    customerId: string;
    jobId?: string;
    labourCost?: number;
    partsCost?: number;
    paintCost?: number;
    discount?: number;
    notes?: string;
    items?: { description: string; quantity: number; unitPrice: number; itemType?: string }[];
  }, userId?: string) {
    const labour = data.labourCost || 0;
    const parts = data.partsCost || 0;
    const paint = data.paintCost || 0;
    const discount = data.discount || 0;
    const { gst, totalAmount } = calculateQuotationTotals(labour, parts, paint, discount);

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + config.quotationExpiryDays);

    const quotation = await prisma.quotation.create({
      data: {
        quotationNumber: generateCode('QT'),
        customerId: data.customerId,
        jobId: data.jobId,
        labourCost: labour,
        partsCost: parts,
        paintCost: paint,
        discount,
        gst,
        totalAmount,
        validUntil,
        notes: data.notes,
        createdById: userId,
        items: data.items
          ? {
              create: data.items.map((item, i) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.quantity * item.unitPrice,
                itemType: item.itemType || 'PART',
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: { customer: true, job: true, items: true },
    });

    return quotation;
  }

  buildEmailData(quotation: Awaited<ReturnType<QuotationService['getById']>>): QuotationEmailData {
    return {
      quotationNumber: quotation.quotationNumber,
      customerName: quotation.customer.name,
      labour: toNumber(quotation.labourCost),
      parts: toNumber(quotation.partsCost),
      paint: toNumber(quotation.paintCost),
      discount: toNumber(quotation.discount),
      gst: toNumber(quotation.gst),
      total: toNumber(quotation.totalAmount),
      validUntil: formatQuotationDate(quotation.validUntil),
      jobNumber: quotation.job?.jobNumber,
      notes: quotation.notes || undefined,
      items: quotation.items.map((item) => ({
        description: item.description,
        quantity: toNumber(item.quantity),
        unitPrice: toNumber(item.unitPrice),
        totalPrice: toNumber(item.totalPrice),
      })),
    };
  }

  buildMessage(quotation: Awaited<ReturnType<QuotationService['getById']>>) {
    return buildQuotationPlainText(this.buildEmailData(quotation));
  }

  async update(id: string, data: {
    labourCost?: number;
    partsCost?: number;
    paintCost?: number;
    discount?: number;
    notes?: string;
    items?: { description: string; quantity: number; unitPrice: number; itemType?: string }[];
  }, userId?: string) {
    const existing = await this.getById(id);
    if (!['DRAFT', 'SENT'].includes(existing.status)) {
      throw new AppError(400, 'Cannot edit quotation in current status', 'QUOTATION_NOT_EDITABLE');
    }

    const labour = data.labourCost ?? toNumber(existing.labourCost);
    const parts = data.partsCost ?? toNumber(existing.partsCost);
    const paint = data.paintCost ?? toNumber(existing.paintCost);
    const discount = data.discount ?? toNumber(existing.discount);
    const { gst, totalAmount } = calculateQuotationTotals(labour, parts, paint, discount);

    const updated = await prisma.$transaction(async (tx) => {
      if (data.items) {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      }

      return tx.quotation.update({
        where: { id },
        data: {
          labourCost: labour,
          partsCost: parts,
          paintCost: paint,
          discount,
          gst,
          totalAmount,
          notes: data.notes !== undefined ? data.notes : existing.notes,
          updatedById: userId,
          ...(data.items && {
            items: {
              create: data.items.map((item, i) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.quantity * item.unitPrice,
                itemType: item.itemType || 'PART',
                sortOrder: i,
              })),
            },
          }),
        },
        include: { customer: true, job: true, items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return updated;
  }

  async sendEmail(id: string, userId?: string) {
    const quotation = await this.getById(id);
    const email = quotation.customer.email?.trim();
    if (!email) {
      throw new AppError(400, 'Customer has no email address on file', 'NO_CUSTOMER_EMAIL');
    }

    const subject = `Quotation ${quotation.quotationNumber} — Ceylon Automobile`;
    const emailData = this.buildEmailData(quotation);
    const text = buildQuotationPlainText(emailData);
    const html = buildQuotationHtml(emailData);
    const result = await deepSeekService.sendEmailViaWebhook({ to: email, subject, text, html });

    if (!result.sent) {
      throw new AppError(502, 'Failed to send email. Check email webhook configuration.', 'EMAIL_SEND_FAILED');
    }

    if (quotation.status === 'DRAFT') {
      await prisma.quotation.update({
        where: { id },
        data: { status: 'SENT', updatedById: userId },
      });
    }

    return { sent: true, to: email, subject };
  }

  async sendWhatsApp(id: string, userId?: string) {
    const quotation = await this.getById(id);
    const phone = quotation.customer.phone?.trim();
    if (!phone) {
      throw new AppError(400, 'Customer has no phone number on file', 'NO_CUSTOMER_PHONE');
    }

    const message = this.buildMessage(quotation);
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    const whatsappUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;

    if (quotation.status === 'DRAFT') {
      await prisma.quotation.update({
        where: { id },
        data: { status: 'SENT', updatedById: userId },
      });
    }

    return { whatsappUrl, phone: normalizedPhone, message };
  }

  async updateStatus(id: string, status: QuotationStatus, userId?: string) {
    await this.getById(id);
    return prisma.quotation.update({
      where: { id },
      data: { status, updatedById: userId },
      include: { customer: true, job: true, items: true },
    });
  }

  async delete(id: string, userId?: string) {
    await this.getById(id);
    return prisma.quotation.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }
}

export class InvoiceService {
  private invoiceDetailInclude = {
    customer: true,
    job: { include: { vehicle: true, subTasks: { orderBy: { sortOrder: 'asc' as const } } } },
    payments: { orderBy: { paidAt: 'desc' as const } },
    collections: { where: softDeleteFilter(), select: { id: true, amount: true } },
    lineItems: { orderBy: { sortOrder: 'asc' as const } },
  };

  private buildLineItemsFromJob(job: {
    jobNumber: string;
    description?: string | null;
    jobType?: JobType | null;
    estimatedPrice?: Prisma.Decimal | null;
    addGst?: boolean | null;
    subTasks: Array<{ taskType: string; description: string; price?: Prisma.Decimal | null }>;
  }) {
    type JobLineItem = {
      description: string;
      taskType?: string;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
      sortOrder: number;
    };
    let items: JobLineItem[];
    if (job.subTasks.length) {
      items = job.subTasks.map((task, index): JobLineItem => {
        const unitPrice = Number(task.price || 0);
        return {
          description: task.description,
          taskType: task.taskType,
          unitPrice,
          quantity: 1,
          lineTotal: unitPrice,
          sortOrder: index,
        };
      });
    } else {
      const unitPrice = Number(job.estimatedPrice || 0);
      items = [{
        description: job.description?.trim() || `Job ${job.jobNumber}`,
        taskType: job.jobType ?? undefined,
        unitPrice,
        quantity: 1,
        lineTotal: unitPrice,
        sortOrder: 0,
      }];
    }

    // Cash invoices store the amount the customer pays (bake GST in when job.addGst)
    if (!job.addGst) return items;
    const entered = items.reduce((sum, item) => sum + item.lineTotal, 0);
    if (entered <= 0) return items;
    const cashTotal = calculateInvoiceGstTotals(entered, 0, false).total;
    let allocated = 0;
    return items.map((item, index) => {
      const isLast = index === items.length - 1;
      const lineTotal = isLast
        ? roundMoney(cashTotal - allocated)
        : roundMoney((item.lineTotal / entered) * cashTotal);
      allocated = roundMoney(allocated + lineTotal);
      return { ...item, unitPrice: lineTotal, lineTotal };
    });
  }

  private calculateInvoiceAmounts(
    lineItems: Array<{ lineTotal: number }>,
    discount: number,
    includeGst = true,
  ) {
    const enteredTotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    return calculateInvoiceGstTotals(enteredTotal, discount, includeGst);
  }

  /** Cash invoice: no GST — total equals entered job amount (less discount). */
  private calculateCashInvoiceAmounts(
    lineItems: Array<{ lineTotal: number }>,
    discount: number,
  ) {
    const enteredTotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const subtotal = roundMoney(Math.max(enteredTotal - discount, 0));
    return { subtotal, gst: 0, total: subtotal };
  }

  private transformLineItemsForInvoice<T extends { unitPrice: number; lineTotal: number }>(
    lineItems: T[],
    includeGst: boolean,
  ): T[] {
    if (!includeGst) return lineItems;
    return lineItems.map((item) => ({
      ...item,
      unitPrice: toExGstAmount(item.unitPrice),
      lineTotal: toExGstAmount(item.lineTotal),
    }));
  }

  private paymentStatusFromAmounts(amountPaid: number, total: number): InvoicePaymentStatus {
    if (amountPaid >= total && total > 0) return 'PAID';
    if (amountPaid > 0) return 'PARTIALLY_PAID';
    return 'UNPAID';
  }

  private async syncInvoiceWithJob(
    invoiceId: string,
    job: {
      customerId: string;
      jobNumber: string;
      description?: string | null;
      jobType?: JobType | null;
      estimatedPrice?: Prisma.Decimal | null;
      addGst?: boolean | null;
      subTasks: Array<{ taskType: string; description: string; price?: Prisma.Decimal | null }>;
    },
    userId?: string,
    discountOverride?: number,
    existingDiscount = 0,
    amountPaid = 0,
    _includeGst = true,
  ) {
    const rawLineItems = this.buildLineItemsFromJob(job);
    const discount = discountOverride ?? existingDiscount;
    // All invoices from Jobs are cash invoices — no GST
    const lineItems = rawLineItems;
    const { subtotal, gst, total } = this.calculateCashInvoiceAmounts(rawLineItems, discount);
    const paymentStatus = this.paymentStatusFromAmounts(amountPaid, total);

    await prisma.$transaction([
      prisma.invoiceLineItem.deleteMany({ where: { invoiceId } }),
      prisma.invoiceLineItem.createMany({
        data: lineItems.map((item) => ({
          invoiceId,
          description: item.description,
          taskType: item.taskType as never,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          sortOrder: item.sortOrder,
        })),
      }),
      prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          customerId: job.customerId,
          subtotal,
          gst,
          includeGst: false,
          discount,
          total,
          paymentStatus,
          updatedById: userId,
        },
      }),
    ]);

    return this.getById(invoiceId);
  }

  async list(query: { page?: string; limit?: string; paymentStatus?: InvoicePaymentStatus; customerId?: string; search?: string }) {
    const { page, limit, skip } = parsePagination(query);
    const where: Prisma.InvoiceWhereInput = {
      ...softDeleteFilter(),
      ...(query.paymentStatus && { paymentStatus: query.paymentStatus }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.search && {
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
          { customer: { name: { contains: query.search, mode: 'insensitive' } } },
          { customer: { phone: { contains: query.search, mode: 'insensitive' } } },
          { job: { jobNumber: { contains: query.search, mode: 'insensitive' } } },
          { job: { vehicle: { registrationNo: { contains: query.search, mode: 'insensitive' } } } },
        ],
      }),
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true, address: true } },
          job: {
            select: {
              id: true,
              jobNumber: true,
              vehicle: { select: { id: true, registrationNo: true, make: true, model: true } },
            },
          },
          payments: true,
          lineItems: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return { invoices, total, page, limit };
  }

  async getById(id: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, ...softDeleteFilter() },
      include: this.invoiceDetailInclude,
    });
    if (!invoice) throw new AppError(404, 'Invoice not found', 'NOT_FOUND');
    return invoice;
  }

  async create(data: {
    jobId?: string;
    customerId: string;
    subtotal: number;
    gst?: number;
    discount?: number;
    total: number;
    dueDate?: string;
    notes?: string;
    lineItems?: Array<{
      description: string;
      taskType?: string;
      unitPrice: number;
      quantity?: number;
      lineTotal: number;
    }>;
  }, userId?: string) {
    return prisma.invoice.create({
      data: {
        invoiceNumber: generateCode('INV'),
        jobId: data.jobId,
        customerId: data.customerId,
        subtotal: data.subtotal,
        gst: data.gst || 0,
        discount: data.discount || 0,
        total: data.total,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        notes: data.notes,
        createdById: userId,
        lineItems: data.lineItems?.length
          ? {
              create: data.lineItems.map((item, index) => ({
                description: item.description,
                taskType: item.taskType as never,
                unitPrice: item.unitPrice,
                quantity: item.quantity ?? 1,
                lineTotal: item.lineTotal,
                sortOrder: index,
              })),
            }
          : undefined,
      },
      include: {
        customer: true,
        job: { include: { vehicle: true } },
        lineItems: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async createFromJob(data: {
    jobId: string;
    invoiceNumber?: string;
    discount?: number;
    notes?: string;
    includeGst?: boolean;
  }, userId?: string) {
    const job = await prisma.job.findFirst({
      where: { id: data.jobId, ...softDeleteFilter() },
      include: {
        customer: true,
        vehicle: true,
        subTasks: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!job) throw new AppError(404, 'Job not found', 'NOT_FOUND');

    const existing = await prisma.invoice.findFirst({
      where: { jobId: data.jobId, ...softDeleteFilter() },
      orderBy: { createdAt: 'desc' },
    });

    // All /invoices are cash invoices — ignore includeGst / job GST flags
    if (existing) {
      const invoice = await this.syncInvoiceWithJob(
        existing.id,
        job,
        userId,
        data.discount,
        Number(existing.discount),
        Number(existing.amountPaid),
        false,
      );
      return { invoice, created: false };
    }

    const invoiceNumber = data.invoiceNumber?.trim();
    if (invoiceNumber) {
      const taken = await prisma.invoice.findFirst({
        where: { invoiceNumber, ...softDeleteFilter() },
      });
      if (taken) throw new AppError(409, 'Invoice number already in use', 'DUPLICATE_INVOICE');
    }

    const lineItems = this.buildLineItemsFromJob(job);
    const discount = data.discount || 0;
    const { subtotal, gst, total } = this.calculateCashInvoiceAmounts(lineItems, discount);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: invoiceNumber || generateCode('INV'),
        jobId: job.id,
        customerId: job.customerId,
        subtotal,
        gst,
        includeGst: false,
        discount,
        total,
        notes: data.notes,
        createdById: userId,
        lineItems: {
          create: lineItems.map((item, index) => ({
            description: item.description,
            taskType: item.taskType as never,
            unitPrice: item.unitPrice,
            quantity: item.quantity ?? 1,
            lineTotal: item.lineTotal,
            sortOrder: index,
          })),
        },
      },
      include: {
        customer: true,
        job: { include: { vehicle: true } },
        lineItems: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return { invoice, created: true };
  }

  async addPayment(invoiceId: string, data: {
    amount: number;
    paymentMethod: string;
    reference?: string;
    notes?: string;
    collectionType?: 'ADVANCE' | 'SECOND' | 'FINAL' | 'OTHER';
    paidAt?: string;
  }, userId?: string) {
    const invoice = await this.getById(invoiceId);
    const currentPaid = Number(invoice.amountPaid);
    const total = Number(invoice.total);
    const newPaid = currentPaid + data.amount;
    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
    const method = data.paymentMethod.trim().toUpperCase();

    let paymentStatus: InvoicePaymentStatus = 'PARTIALLY_PAID';
    if (newPaid >= total) paymentStatus = 'PAID';
    else if (newPaid === 0) paymentStatus = 'UNPAID';

    const [payment] = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          invoiceId,
          amount: data.amount,
          paymentMethod: method,
          reference: data.reference,
          notes: data.notes,
          paidAt,
          createdById: userId,
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { amountPaid: newPaid, paymentStatus, updatedById: userId },
      });

      if (invoice.jobId) {
        await tx.jobCollection.create({
          data: {
            jobId: invoice.jobId,
            invoiceId,
            amount: data.amount,
            paymentMethod: method,
            collectionType: data.collectionType || 'OTHER',
            paidAt,
            reference: data.reference || null,
            notes: data.notes || null,
            createdById: userId,
          },
        });
      }

      return [p];
    });

    return payment;
  }

  async updateAmountPaid(invoiceId: string, amountPaid: number, userId?: string) {
    const invoice = await this.getById(invoiceId);
    const total = Number(invoice.total);
    if (amountPaid < 0 || Number.isNaN(amountPaid)) {
      throw new AppError(400, 'Invalid amount paid', 'INVALID_AMOUNT');
    }
    if (amountPaid > total) {
      throw new AppError(400, 'Amount paid cannot exceed invoice total', 'INVALID_AMOUNT');
    }

    const collected = roundMoney(
      (invoice.collections || []).reduce((sum, c) => sum + Number(c.amount || 0), 0),
    );
    if (amountPaid + 0.009 < collected) {
      throw new AppError(
        400,
        `Amount paid cannot be less than already collected in finance (${collected.toFixed(2)})`,
        'INVALID_AMOUNT',
      );
    }

    const paymentStatus = this.paymentStatusFromAmounts(amountPaid, total);
    const collectionGap = roundMoney(amountPaid - collected);
    const paidAt = new Date();
    const collectionType =
      collected <= 0.009 && amountPaid > 0
        ? 'ADVANCE'
        : amountPaid + 0.009 >= total
          ? 'FINAL'
          : 'SECOND';

    await prisma.$transaction(async (tx) => {
      if (collectionGap > 0.009) {
        await tx.payment.create({
          data: {
            invoiceId,
            amount: collectionGap,
            paymentMethod: 'CASH',
            reference: invoice.invoiceNumber,
            notes: `Synced from invoice ${invoice.invoiceNumber}`,
            paidAt,
            createdById: userId,
          },
        });

        if (invoice.jobId) {
          await tx.jobCollection.create({
            data: {
              jobId: invoice.jobId,
              invoiceId,
              amount: collectionGap,
              paymentMethod: 'CASH',
              collectionType,
              paidAt,
              reference: invoice.invoiceNumber,
              notes: `Synced from invoice ${invoice.invoiceNumber}`,
              createdById: userId,
            },
          });
        }
      }

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { amountPaid, paymentStatus, updatedById: userId },
      });
    });

    return this.getById(invoiceId);
  }

  async delete(id: string, userId?: string) {
    await this.getById(id);
    return prisma.invoice.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
  }
}

export const insuranceService = new InsuranceService();
export const quotationService = new QuotationService();
export const invoiceService = new InvoiceService();
