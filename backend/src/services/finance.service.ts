import {
  CollectionType,
  ExpenseCategory,
  ExpenseMaterialType,
  ExpenseOtherType,
  ExpenseOutsourceType,
  InvoicePaymentStatus,
  Prisma,
} from '@prisma/client';
import prisma from '../utils/prisma';
import { AppError } from '../utils/response';
import { softDeleteFilter, toNumber, roundMoney, jobAmountWithGst, generateCode, calculateInvoiceGstTotals } from '../utils/helpers';

function parseDateOnly(value: string, endOfDay = false) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(400, 'Invalid date', 'INVALID_DATE');
  }
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

function weekRange(from?: string, to?: string) {
  if (from && to) {
    return { start: parseDateOnly(from), end: parseDateOnly(to, true) };
  }
  const now = new Date();
  const day = now.getDay(); // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function isCashMethod(method: string) {
  return method.trim().toUpperCase() === 'CASH';
}

function paymentStatusFromAmounts(amountPaid: number, total: number): InvoicePaymentStatus {
  if (amountPaid <= 0) return 'UNPAID';
  if (amountPaid + 0.001 >= total) return 'PAID';
  return 'PARTIALLY_PAID';
}

function paymentLabel(status: InvoicePaymentStatus | string, balance: number) {
  if (status === 'PAID' || balance <= 0.009) return 'Paid';
  if (status === 'PARTIALLY_PAID') return 'Partial / receivable';
  return 'Receivable';
}

function jobFinanceSnapshot(job: {
  estimatedPrice?: Prisma.Decimal | number | null;
  addGst?: boolean | null;
  jobCategory?: string | null;
  jobSource?: string | null;
  subTasks?: { price?: unknown }[];
  invoices?: Array<{
    total?: unknown;
    amountPaid?: unknown;
    paymentStatus?: InvoicePaymentStatus | string | null;
    invoiceNumber?: string | null;
  }>;
  collections?: Array<{ amount?: unknown }>;
}) {
  const invoice = job.invoices?.[0] || null;
  const collected = roundMoney(
    (job.collections || []).reduce((s, c) => s + toNumber(c.amount as never), 0),
  );
  const jobTotal = invoice
    ? toNumber(invoice.total as never)
    : jobAmountWithGst(job.subTasks, job.estimatedPrice, {
        addGst: job.addGst,
        jobCategory: job.jobCategory,
        jobSource: job.jobSource,
      });
  const amountPaid = invoice ? toNumber(invoice.amountPaid as never) : collected;
  const balance = Math.max(0, roundMoney(jobTotal - amountPaid));
  const status = invoice?.paymentStatus
    || paymentStatusFromAmounts(amountPaid, jobTotal);
  return {
    amount: roundMoney(jobTotal),
    amountPaid: roundMoney(amountPaid),
    balance,
    paymentStatus: status,
    paymentLabel: paymentLabel(status, balance),
    invoiceNumber: invoice?.invoiceNumber || null,
  };
}


type PayableExpenseLike = {
  amount?: unknown;
  category?: string | null;
  otherType?: string | null;
  employeeId?: string | null;
  supplierId?: string | null;
  employee?: { id: string; name: string; employeeCode?: string | null } | null;
  supplier?: { id: string; name: string; supplierCode?: string | null } | null;
};

function getPayablePartyMeta(e: PayableExpenseLike) {
  const isLabour = e.category === 'LABOUR';
  const isSalary = e.category === 'OTHER' && e.otherType === 'SALARY';
  let id: string;
  let kind: 'labour' | 'salary' | 'supplier' | 'outsource' | 'other' | 'unassigned';
  let name: string;
  let code: string | null;

  if (isLabour || isSalary) {
    kind = isLabour ? 'labour' : 'salary';
    if (e.employee?.id || e.employeeId) {
      const empId = e.employee?.id || e.employeeId!;
      id = `${kind}:employee:${empId}`;
      name = e.employee?.name || 'Unknown employee';
      code = e.employee?.employeeCode || null;
    } else {
      id = `${kind}:unassigned`;
      name = isLabour ? 'Labour (no employee)' : 'Salary (no employee)';
      code = null;
    }
  } else if (e.supplier?.id || e.supplierId) {
    const supplierId = e.supplier?.id || e.supplierId!;
    id = `supplier:${supplierId}`;
    kind = e.category === 'OUTSOURCE' ? 'outsource' : 'supplier';
    name = e.supplier?.name || 'Unknown supplier';
    code = e.supplier?.supplierCode || null;
  } else if (e.category === 'OUTSOURCE') {
    id = 'outsource:unassigned';
    kind = 'outsource';
    name = 'Out source (no supplier)';
    code = null;
  } else if (e.category === 'MATERIAL') {
    id = 'material:unassigned';
    kind = 'supplier';
    name = 'Material (no supplier)';
    code = null;
  } else if (e.category === 'OTHER' || e.otherType) {
    id = `other:${e.otherType || 'OTHER'}:unassigned`;
    kind = 'other';
    name = e.otherType ? String(e.otherType).replace(/_/g, ' ') : 'Other (unassigned)';
    code = null;
  } else {
    id = 'unassigned';
    kind = 'unassigned';
    name = 'Unassigned';
    code = null;
  }

  return { id, kind, name, code };
}

function buildPayablesByParty(expenses: PayableExpenseLike[]) {
  const partyMap = new Map<string, {
    id: string;
    kind: 'labour' | 'salary' | 'supplier' | 'outsource' | 'other' | 'unassigned';
    name: string;
    code: string | null;
    amount: number;
    count: number;
  }>();

  for (const e of expenses) {
    const amount = roundMoney(toNumber(e.amount as never));
    const { id, kind, name, code } = getPayablePartyMeta(e);
    const existing = partyMap.get(id);
    if (existing) {
      existing.amount = roundMoney(existing.amount + amount);
      existing.count += 1;
    } else {
      partyMap.set(id, { id, kind, name, code, amount, count: 1 });
    }
  }

  const kindOrder: Record<string, number> = {
    labour: 0,
    salary: 1,
    outsource: 2,
    supplier: 3,
    other: 4,
    unassigned: 5,
  };

  return Array.from(partyMap.values()).sort((a, b) => {
    const ka = kindOrder[a.kind] ?? 9;
    const kb = kindOrder[b.kind] ?? 9;
    if (ka !== kb) return ka - kb;
    return b.amount - a.amount;
  });
}

function buildPayablesByType(expenses: PayableExpenseLike[]) {
  const typeMap = new Map<string, {
    id: string;
    label: string;
    amount: number;
    count: number;
  }>();

  for (const e of expenses) {
    const amount = roundMoney(toNumber(e.amount as never));
    let id: string;
    let label: string;
    if (e.category === 'LABOUR') {
      id = 'labour';
      label = 'Labour';
    } else if (e.category === 'OTHER' && e.otherType === 'SALARY') {
      id = 'salary';
      label = 'Salary';
    } else if (e.category === 'OUTSOURCE') {
      id = 'outsource';
      label = 'Out source';
    } else if (e.category === 'MATERIAL') {
      id = 'material';
      label = 'Material';
    } else {
      id = 'other';
      label = 'Other';
    }
    const existing = typeMap.get(id);
    if (existing) {
      existing.amount = roundMoney(existing.amount + amount);
      existing.count += 1;
    } else {
      typeMap.set(id, { id, label, amount, count: 1 });
    }
  }

  const order = ['labour', 'salary', 'outsource', 'material', 'other'];
  return order
    .map((id) => typeMap.get(id))
    .filter((row): row is { id: string; label: string; amount: number; count: number } => !!row);
}

class ExpenseService {
  private expenseInclude = {
    job: {
      select: {
        id: true,
        jobNumber: true,
        customer: { select: { name: true } },
        vehicle: { select: { registrationNo: true } },
      },
    },
    supplier: {
      select: {
        id: true,
        supplierCode: true,
        name: true,
        phone: true,
      },
    },
    employee: {
      select: {
        id: true,
        employeeCode: true,
        name: true,
        jobTitle: true,
        phone: true,
      },
    },
  } as const;

  private mapExpense(expense: {
    amount: Parameters<typeof toNumber>[0];
    [key: string]: unknown;
  }) {
    return {
      ...expense,
      amount: toNumber(expense.amount),
    };
  }

  private async resolveJobId(jobId?: string | null) {
    if (jobId === undefined) return undefined;
    if (!jobId) return null;
    const job = await prisma.job.findFirst({
      where: { id: jobId, ...softDeleteFilter() },
      select: { id: true },
    });
    if (!job) throw new AppError(404, 'Job not found', 'JOB_NOT_FOUND');
    return job.id;
  }

  private async resolveSupplierId(supplierId?: string | null) {
    if (supplierId === undefined) return undefined;
    if (!supplierId) return null;
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, ...softDeleteFilter() },
      select: { id: true },
    });
    if (!supplier) throw new AppError(404, 'Supplier not found', 'SUPPLIER_NOT_FOUND');
    return supplier.id;
  }

  private async resolveEmployeeId(employeeId?: string | null) {
    if (employeeId === undefined) return undefined;
    if (!employeeId) return null;
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, ...softDeleteFilter() },
      select: { id: true },
    });
    if (!employee) throw new AppError(404, 'Employee not found', 'EMPLOYEE_NOT_FOUND');
    return employee.id;
  }

  async list(query: { from?: string; to?: string; category?: string; page?: string; limit?: string }) {
    const where: Prisma.ExpenseWhereInput = { ...softDeleteFilter() };
    if (query.category && Object.values(ExpenseCategory).includes(query.category as ExpenseCategory)) {
      where.category = query.category as ExpenseCategory;
    }
    if (query.from || query.to) {
      where.expenseDate = {};
      if (query.from) where.expenseDate.gte = parseDateOnly(query.from);
      if (query.to) where.expenseDate.lte = parseDateOnly(query.to, true);
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 100));
    const skip = (page - 1) * limit;

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: this.expenseInclude,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.expense.count({ where }),
    ]);

    return {
      expenses: expenses.map((e) => this.mapExpense(e)),
      total,
      page,
      limit,
    };
  }

  async create(data: {
    category: ExpenseCategory;
    materialType?: ExpenseMaterialType | null;
    outsourceType?: ExpenseOutsourceType | null;
    otherType?: ExpenseOtherType | null;
    description: string;
    amount: number;
    expenseDate: string;
    isPayable?: boolean;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
    jobId?: string | null;
    supplierId?: string | null;
    employeeId?: string | null;
  }, userId?: string) {
    if (data.category !== 'MATERIAL' && data.materialType) {
      throw new AppError(400, 'Material type is only valid for MATERIAL expenses', 'INVALID_MATERIAL_TYPE');
    }
    if (data.category !== 'OUTSOURCE' && data.outsourceType) {
      throw new AppError(400, 'Outsource type is only valid for OUTSOURCE expenses', 'INVALID_OUTSOURCE_TYPE');
    }
    if (data.category !== 'OTHER' && data.otherType) {
      throw new AppError(400, 'Other type is only valid for OTHER expenses', 'INVALID_OTHER_TYPE');
    }

    const jobId = await this.resolveJobId(data.jobId ?? null);
    const supplierId = await this.resolveSupplierId(data.supplierId ?? null);
    const employeeId = await this.resolveEmployeeId(data.employeeId ?? null);
    const isPayable = !!data.isPayable;
    const needsEmployee = data.category === 'LABOUR' || (data.category === 'OTHER' && data.otherType === 'SALARY');
    if (needsEmployee && !employeeId) {
      throw new AppError(400, 'Select the employee / labour for this wage expense', 'EMPLOYEE_REQUIRED');
    }

    const expense = await prisma.expense.create({
      data: {
        jobId: jobId ?? null,
        supplierId: needsEmployee ? null : (supplierId ?? null),
        employeeId: needsEmployee ? (employeeId ?? null) : null,
        category: data.category,
        materialType: data.category === 'MATERIAL' ? (data.materialType || 'OTHER') : null,
        outsourceType: data.category === 'OUTSOURCE' ? (data.outsourceType || 'MECHANIC') : null,
        otherType: data.category === 'OTHER' ? (data.otherType || 'OTHER') : null,
        description: data.description.trim(),
        amount: data.amount,
        expenseDate: parseDateOnly(data.expenseDate),
        isPayable,
        paymentMethod: isPayable ? (data.paymentMethod || 'CREDIT') : (data.paymentMethod || null),
        reference: data.reference || null,
        notes: data.notes || null,
        createdById: userId,
      },
      include: this.expenseInclude,
    });

    return this.mapExpense(expense);
  }

  async update(id: string, data: Partial<{
    category: ExpenseCategory;
    materialType: ExpenseMaterialType | null;
    outsourceType: ExpenseOutsourceType | null;
    otherType: ExpenseOtherType | null;
    description: string;
    amount: number;
    expenseDate: string;
    isPayable: boolean;
    paymentMethod: string | null;
    reference: string | null;
    notes: string | null;
    jobId: string | null;
    supplierId: string | null;
    employeeId: string | null;
  }>, _userId?: string) {
    const existing = await prisma.expense.findFirst({ where: { id, ...softDeleteFilter() } });
    if (!existing) throw new AppError(404, 'Expense not found', 'NOT_FOUND');

    const category = data.category ?? existing.category;
    const materialType = category === 'MATERIAL'
      ? (data.materialType !== undefined ? data.materialType : existing.materialType) || 'OTHER'
      : null;
    const outsourceType = category === 'OUTSOURCE'
      ? (data.outsourceType !== undefined ? data.outsourceType : existing.outsourceType) || 'MECHANIC'
      : null;
    const otherType = category === 'OTHER'
      ? (data.otherType !== undefined ? data.otherType : existing.otherType) || 'OTHER'
      : null;
    const jobId = data.jobId !== undefined ? await this.resolveJobId(data.jobId) : undefined;
    const supplierId = data.supplierId !== undefined ? await this.resolveSupplierId(data.supplierId) : undefined;
    const employeeId = data.employeeId !== undefined ? await this.resolveEmployeeId(data.employeeId) : undefined;
    const isPayable = data.isPayable !== undefined ? !!data.isPayable : existing.isPayable;
    const needsEmployee = category === 'LABOUR' || (category === 'OTHER' && otherType === 'SALARY');
    const resolvedEmployeeId = employeeId !== undefined ? employeeId : existing.employeeId;
    if (needsEmployee && !resolvedEmployeeId) {
      throw new AppError(400, 'Select the employee / labour for this wage expense', 'EMPLOYEE_REQUIRED');
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        category,
        materialType,
        outsourceType,
        otherType,
        description: data.description?.trim(),
        amount: data.amount,
        expenseDate: data.expenseDate ? parseDateOnly(data.expenseDate) : undefined,
        isPayable,
        paymentMethod: data.paymentMethod === undefined
          ? (isPayable && !existing.paymentMethod ? 'CREDIT' : undefined)
          : (isPayable ? (data.paymentMethod || 'CREDIT') : data.paymentMethod),
        reference: data.reference === undefined ? undefined : data.reference,
        notes: data.notes === undefined ? undefined : data.notes,
        ...(jobId !== undefined ? { jobId } : {}),
        supplierId: needsEmployee
          ? null
          : (supplierId !== undefined ? supplierId : undefined),
        employeeId: needsEmployee
          ? (employeeId !== undefined ? employeeId : existing.employeeId)
          : null,
      },
      include: this.expenseInclude,
    });

    return this.mapExpense(expense);
  }

  async delete(id: string) {
    const existing = await prisma.expense.findFirst({ where: { id, ...softDeleteFilter() } });
    if (!existing) throw new AppError(404, 'Expense not found', 'NOT_FOUND');
    await prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }
}

class CollectionService {
  private collectionInclude = {
    job: {
      select: {
        id: true,
        jobNumber: true,
        status: true,
        customer: { select: { id: true, name: true } },
        vehicle: { select: { registrationNo: true } },
        invoices: {
          where: softDeleteFilter(),
          select: { id: true, invoiceNumber: true, total: true, amountPaid: true, paymentStatus: true },
          orderBy: { createdAt: 'desc' as const },
          take: 1,
        },
      },
    },
    invoice: {
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        amountPaid: true,
        paymentStatus: true,
        notes: true,
        customer: { select: { id: true, name: true } },
        lineItems: {
          select: { description: true },
          orderBy: { sortOrder: 'asc' as const },
          take: 3,
        },
      },
    },
  };

  async listJobsForCollection(query: { search?: string; limit?: string }) {
    const limit = Math.min(400, Math.max(1, Number(query.limit) || 300));
    const search = query.search?.trim();

    const jobs = await prisma.job.findMany({
      where: {
        ...softDeleteFilter(),
        ...(search && {
          OR: [
            { jobNumber: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { customer: { phone: { contains: search, mode: 'insensitive' } } },
            { vehicle: { registrationNo: { contains: search, mode: 'insensitive' } } },
            {
              invoices: {
                some: {
                  ...softDeleteFilter(),
                  invoiceNumber: { contains: search, mode: 'insensitive' },
                },
              },
            },
          ],
        }),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        vehicle: { select: { registrationNo: true, make: true, model: true } },
        subTasks: { select: { price: true } },
        invoices: {
          where: softDeleteFilter(),
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            amountPaid: true,
            paymentStatus: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        collections: {
          where: softDeleteFilter(),
          select: { amount: true },
        },
      },
    });

    return {
      jobs: jobs.map((job) => {
        const invoice = job.invoices[0] || null;
        const jobTotal = invoice
          ? toNumber(invoice.total)
          : jobAmountWithGst(job.subTasks, job.estimatedPrice, job);
        const collected = roundMoney(job.collections.reduce((s, c) => s + toNumber(c.amount), 0));
        const amountPaid = invoice ? toNumber(invoice.amountPaid) : collected;
        const balance = Math.max(0, roundMoney((invoice ? toNumber(invoice.total) : jobTotal) - amountPaid));
        const isPaid = invoice
          ? invoice.paymentStatus === 'PAID' || balance <= 0
          : jobTotal > 0 && collected + 0.009 >= jobTotal;

        return {
          id: job.id,
          jobNumber: job.jobNumber,
          status: job.status,
          estimatedPrice: toNumber(job.estimatedPrice),
          addGst: job.addGst,
          jobTotal,
          collected,
          amountPaid,
          balance,
          isPaid,
          paymentStatus: invoice?.paymentStatus || (isPaid ? 'PAID' : collected > 0 ? 'PARTIALLY_PAID' : 'UNPAID'),
          customer: job.customer,
          vehicle: job.vehicle,
          invoice: invoice
            ? {
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                total: toNumber(invoice.total),
                amountPaid: toNumber(invoice.amountPaid),
                paymentStatus: invoice.paymentStatus,
              }
            : null,
        };
      }),
    };
  }

  async listInvoicesForCollection(query: { search?: string; limit?: string }) {
    const limit = Math.min(400, Math.max(1, Number(query.limit) || 300));
    const search = query.search?.trim();

    const invoices = await prisma.invoice.findMany({
      where: {
        ...softDeleteFilter(),
        paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
        ...(search && {
          OR: [
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
            { notes: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { customer: { phone: { contains: search, mode: 'insensitive' } } },
            { job: { jobNumber: { contains: search, mode: 'insensitive' } } },
            { job: { vehicle: { registrationNo: { contains: search, mode: 'insensitive' } } } },
            { lineItems: { some: { description: { contains: search, mode: 'insensitive' } } } },
          ],
        }),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        job: {
          select: {
            id: true,
            jobNumber: true,
            vehicle: { select: { registrationNo: true } },
          },
        },
        lineItems: {
          select: { description: true },
          orderBy: { sortOrder: 'asc' },
          take: 3,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      invoices: invoices.map((inv) => {
        const total = toNumber(inv.total);
        const amountPaid = toNumber(inv.amountPaid);
        const balance = Math.max(0, roundMoney(total - amountPaid));
        const isPaid = inv.paymentStatus === 'PAID' || balance <= 0;
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          total,
          amountPaid,
          balance,
          isPaid,
          paymentStatus: inv.paymentStatus,
          notes: inv.notes,
          description: inv.lineItems.map((l) => l.description).filter(Boolean).join('; ')
            || inv.notes
            || (inv.jobId ? 'Job invoice' : 'Additional invoice'),
          customer: inv.customer,
          job: inv.job,
        };
      }),
    };
  }

  /**
   * Record additional payment (e.g. part purchase): create non-job invoice + mark paid + finance collection.
   */
  async createAdditionalPayment(data: {
    customerId: string;
    description: string;
    amount: number;
    addGst?: boolean;
    paymentMethod: string;
    collectionType?: CollectionType;
    paidAt?: string;
    reference?: string | null;
    notes?: string | null;
  }, userId?: string) {
    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, ...softDeleteFilter() },
    });
    if (!customer) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');

    const entered = roundMoney(data.amount);
    if (entered <= 0) throw new AppError(400, 'Amount must be positive', 'INVALID_AMOUNT');

    const withGst = !!data.addGst;
    const totals = withGst
      ? calculateInvoiceGstTotals(entered, 0, false)
      : { subtotal: entered, gst: 0, total: entered };
    const method = data.paymentMethod.trim().toUpperCase();
    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
    const collectionType = data.collectionType || 'OTHER';
    const description = data.description.trim();
    const noteParts = [
      'Additional payment',
      description,
      data.notes?.trim() || null,
    ].filter(Boolean);

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: generateCode('INV'),
          customerId: data.customerId,
          subtotal: totals.subtotal,
          gst: totals.gst,
          includeGst: withGst,
          discount: 0,
          total: totals.total,
          amountPaid: totals.total,
          paymentStatus: 'PAID',
          notes: noteParts.join(' · '),
          createdById: userId,
          lineItems: {
            create: [{
              description,
              unitPrice: totals.subtotal,
              quantity: 1,
              lineTotal: totals.subtotal,
              sortOrder: 0,
            }],
          },
        },
      });

      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: totals.total,
          paymentMethod: method,
          reference: data.reference || null,
          notes: noteParts.join(' · '),
          paidAt,
          createdById: userId,
        },
      });

      const collection = await tx.jobCollection.create({
        data: {
          invoiceId: invoice.id,
          amount: totals.total,
          paymentMethod: method,
          collectionType,
          paidAt,
          reference: data.reference || null,
          notes: noteParts.join(' · '),
          createdById: userId,
        },
      });

      return { invoice, collection };
    });

    const full = await prisma.jobCollection.findUniqueOrThrow({
      where: { id: result.collection.id },
      include: this.collectionInclude,
    });

    return {
      ...full,
      amount: toNumber(full.amount),
      invoice: full.invoice
        ? {
            ...full.invoice,
            total: toNumber(full.invoice.total),
            amountPaid: toNumber(full.invoice.amountPaid),
          }
        : null,
    };
  }

  async list(query: { from?: string; to?: string; jobId?: string; page?: string; limit?: string }) {
    const where: Prisma.JobCollectionWhereInput = { ...softDeleteFilter() };
    if (query.jobId) where.jobId = query.jobId;
    if (query.from || query.to) {
      where.paidAt = {};
      if (query.from) where.paidAt.gte = parseDateOnly(query.from);
      if (query.to) where.paidAt.lte = parseDateOnly(query.to, true);
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 100));
    const skip = (page - 1) * limit;

    const [collections, total] = await Promise.all([
      prisma.jobCollection.findMany({
        where,
        include: this.collectionInclude,
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.jobCollection.count({ where }),
    ]);

    return {
      collections: collections.map((c) => ({
        ...c,
        amount: toNumber(c.amount),
        invoice: c.invoice
          ? {
              ...c.invoice,
              total: toNumber(c.invoice.total),
              amountPaid: toNumber(c.invoice.amountPaid),
            }
          : null,
      })),
      total,
      page,
      limit,
    };
  }

  async create(data: {
    jobId: string;
    amount: number;
    paymentMethod: string;
    collectionType?: CollectionType;
    paidAt?: string;
    reference?: string;
    notes?: string;
    invoiceId?: string;
  }, userId?: string) {
    const job = await prisma.job.findFirst({
      where: { id: data.jobId, ...softDeleteFilter() },
      include: {
        invoices: {
          where: softDeleteFilter(),
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!job) throw new AppError(404, 'Job not found', 'JOB_NOT_FOUND');

    let invoiceId = data.invoiceId || job.invoices[0]?.id || null;
    if (data.invoiceId) {
      const inv = await prisma.invoice.findFirst({
        where: { id: data.invoiceId, jobId: data.jobId, ...softDeleteFilter() },
      });
      if (!inv) throw new AppError(400, 'Invoice not found for this job', 'INVALID_INVOICE');
      invoiceId = inv.id;
    }

    if (invoiceId) {
      const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, ...softDeleteFilter() } });
      if (inv && (inv.paymentStatus === 'PAID' || toNumber(inv.amountPaid) >= toNumber(inv.total))) {
        throw new AppError(400, 'Invoice is already paid', 'INVOICE_ALREADY_PAID');
      }
    }

    const collection = await prisma.$transaction(async (tx) => {
      const created = await tx.jobCollection.create({
        data: {
          jobId: data.jobId,
          invoiceId,
          amount: data.amount,
          paymentMethod: data.paymentMethod.trim().toUpperCase(),
          collectionType: data.collectionType || 'OTHER',
          paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
          reference: data.reference || null,
          notes: data.notes || null,
          createdById: userId,
        },
      });

      if (invoiceId) {
        await tx.payment.create({
          data: {
            invoiceId,
            amount: data.amount,
            paymentMethod: data.paymentMethod.trim().toUpperCase(),
            reference: data.reference || null,
            notes: [
              data.collectionType ? `Type: ${data.collectionType}` : null,
              data.notes || null,
            ].filter(Boolean).join(' · ') || null,
            paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
            createdById: userId,
          },
        });

        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
        const newPaid = toNumber(invoice.amountPaid) + data.amount;
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            amountPaid: newPaid,
            paymentStatus: paymentStatusFromAmounts(newPaid, toNumber(invoice.total)),
            updatedById: userId,
          },
        });
      }

      return created;
    });

    const full = await prisma.jobCollection.findUniqueOrThrow({
      where: { id: collection.id },
      include: this.collectionInclude,
    });

    return {
      ...full,
      amount: toNumber(full.amount),
    };
  }

  /** Settle one or many invoices in a single payment (FIFO allocation). */
  async createBulk(data: {
    invoiceIds: string[];
    amount: number;
    paymentMethod: string;
    collectionType?: CollectionType;
    paidAt?: string;
    reference?: string;
    notes?: string;
  }, userId?: string) {
    const uniqueIds = [...new Set(data.invoiceIds)];
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: uniqueIds }, ...softDeleteFilter() },
      include: {
        job: { select: { id: true, jobNumber: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (invoices.length !== uniqueIds.length) {
      throw new AppError(404, 'One or more invoices were not found', 'INVOICE_NOT_FOUND');
    }

    const paidInvoices = invoices.filter(
      (inv) => inv.paymentStatus === 'PAID' || toNumber(inv.amountPaid) >= toNumber(inv.total),
    );
    if (paidInvoices.length) {
      throw new AppError(
        400,
        `Cannot collect paid invoice(s): ${paidInvoices.map((i) => i.invoiceNumber).join(', ')}`,
        'INVOICE_ALREADY_PAID',
      );
    }

    const balances = invoices.map((inv) => ({
      invoice: inv,
      balance: Math.max(0, Math.round((toNumber(inv.total) - toNumber(inv.amountPaid)) * 100) / 100),
    })).filter((b) => b.balance > 0);

    if (!balances.length) {
      throw new AppError(400, 'Selected invoices have no outstanding balance', 'NO_BALANCE');
    }

    const totalBalance = Math.round(balances.reduce((s, b) => s + b.balance, 0) * 100) / 100;
    if (data.amount - totalBalance > 0.009) {
      throw new AppError(
        400,
        `Amount ${data.amount} exceeds outstanding balance ${totalBalance}`,
        'AMOUNT_EXCEEDS_BALANCE',
      );
    }

    const method = data.paymentMethod.trim().toUpperCase();
    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
    const collectionType = data.collectionType || 'OTHER';

    // FIFO allocate payment across selected invoices
    let remaining = Math.round(data.amount * 100) / 100;
    const allocations: { invoiceId: string; jobId: string | null; amount: number }[] = [];
    for (const row of balances) {
      if (remaining <= 0) break;
      const pay = Math.min(row.balance, remaining);
      const amount = Math.round(pay * 100) / 100;
      if (amount <= 0) continue;
      allocations.push({
        invoiceId: row.invoice.id,
        jobId: row.invoice.jobId,
        amount,
      });
      remaining = Math.round((remaining - amount) * 100) / 100;
    }

    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const alloc of allocations) {
        const collection = await tx.jobCollection.create({
          data: {
            ...(alloc.jobId ? { jobId: alloc.jobId } : {}),
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
            paymentMethod: method,
            collectionType,
            paidAt,
            reference: data.reference || null,
            notes: data.notes || null,
            createdById: userId,
          },
        });
        results.push(collection);

        await tx.payment.create({
          data: {
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
            paymentMethod: method,
            reference: data.reference || null,
            notes: [
              collectionType ? `Type: ${collectionType}` : null,
              allocations.length > 1 ? 'Bulk settlement' : null,
              data.notes || null,
            ].filter(Boolean).join(' · ') || null,
            paidAt,
            createdById: userId,
          },
        });

        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });
        const newPaid = Math.round((toNumber(invoice.amountPaid) + alloc.amount) * 100) / 100;
        await tx.invoice.update({
          where: { id: alloc.invoiceId },
          data: {
            amountPaid: newPaid,
            paymentStatus: paymentStatusFromAmounts(newPaid, toNumber(invoice.total)),
            updatedById: userId,
          },
        });
      }
      return results;
    });

    return {
      paymentCount: allocations.length,
      totalAmount: Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100,
      allocations: allocations.map((a) => ({
        invoiceId: a.invoiceId,
        amount: a.amount,
      })),
      collections: created.map((c) => ({ ...c, amount: toNumber(c.amount) })),
    };
  }

  /** Settle one or many jobs in a single payment (FIFO by job createdAt). */
  async createBulkFromJobs(data: {
    jobIds: string[];
    amount: number;
    paymentMethod: string;
    collectionType?: CollectionType;
    paidAt?: string;
    reference?: string;
    notes?: string;
  }, userId?: string) {
    const uniqueIds = [...new Set(data.jobIds)];
    const jobs = await prisma.job.findMany({
      where: { id: { in: uniqueIds }, ...softDeleteFilter() },
      include: {
        subTasks: { select: { price: true } },
        invoices: {
          where: softDeleteFilter(),
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        collections: {
          where: softDeleteFilter(),
          select: { amount: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (jobs.length !== uniqueIds.length) {
      throw new AppError(404, 'One or more jobs were not found', 'JOB_NOT_FOUND');
    }

    const rows = jobs.map((job) => {
      const invoice = job.invoices[0] || null;
      const total = invoice ? toNumber(invoice.total) : jobAmountWithGst(job.subTasks, job.estimatedPrice, job);
      const amountPaid = invoice
        ? toNumber(invoice.amountPaid)
        : roundMoney(job.collections.reduce((s, c) => s + toNumber(c.amount), 0));
      const balance = Math.max(0, roundMoney(total - amountPaid));
      const isPaid = invoice
        ? invoice.paymentStatus === 'PAID' || balance <= 0
        : total > 0 && amountPaid + 0.009 >= total;
      return { job, invoice, balance, isPaid };
    });

    const paidJobs = rows.filter((r) => r.isPaid);
    if (paidJobs.length) {
      throw new AppError(
        400,
        `Cannot collect paid job(s): ${paidJobs.map((r) => r.job.jobNumber).join(', ')}`,
        'JOB_ALREADY_PAID',
      );
    }

    const open = rows.filter((r) => r.balance > 0);
    if (!open.length) {
      throw new AppError(400, 'Selected jobs have no outstanding balance', 'NO_BALANCE');
    }

    const totalBalance = roundMoney(open.reduce((s, r) => s + r.balance, 0));
    if (data.amount - totalBalance > 0.009) {
      throw new AppError(
        400,
        `Amount ${data.amount} exceeds outstanding balance ${totalBalance}`,
        'AMOUNT_EXCEEDS_BALANCE',
      );
    }

    const method = data.paymentMethod.trim().toUpperCase();
    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
    const collectionType = data.collectionType || 'OTHER';

    let remaining = roundMoney(data.amount);
    const allocations: { jobId: string; invoiceId: string | null; amount: number }[] = [];
    for (const row of open) {
      if (remaining <= 0) break;
      const amount = roundMoney(Math.min(row.balance, remaining));
      if (amount <= 0) continue;
      allocations.push({
        jobId: row.job.id,
        invoiceId: row.invoice?.id || null,
        amount,
      });
      remaining = roundMoney(remaining - amount);
    }

    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const alloc of allocations) {
        const collection = await tx.jobCollection.create({
          data: {
            jobId: alloc.jobId,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
            paymentMethod: method,
            collectionType,
            paidAt,
            reference: data.reference || null,
            notes: data.notes || null,
            createdById: userId,
          },
        });
        results.push(collection);

        if (alloc.invoiceId) {
          await tx.payment.create({
            data: {
              invoiceId: alloc.invoiceId,
              amount: alloc.amount,
              paymentMethod: method,
              reference: data.reference || null,
              notes: [
                collectionType ? `Type: ${collectionType}` : null,
                allocations.length > 1 ? 'Bulk job settlement' : null,
                data.notes || null,
              ].filter(Boolean).join(' · ') || null,
              paidAt,
              createdById: userId,
            },
          });

          const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });
          const newPaid = roundMoney(toNumber(invoice.amountPaid) + alloc.amount);
          await tx.invoice.update({
            where: { id: alloc.invoiceId },
            data: {
              amountPaid: newPaid,
              paymentStatus: paymentStatusFromAmounts(newPaid, toNumber(invoice.total)),
              updatedById: userId,
            },
          });
        }
      }
      return results;
    });

    return {
      paymentCount: allocations.length,
      totalAmount: roundMoney(allocations.reduce((s, a) => s + a.amount, 0)),
      allocations,
      collections: created.map((c) => ({ ...c, amount: toNumber(c.amount) })),
    };
  }

  /** Backfill JobCollection rows for invoices already marked paid/partial without collections. */
  async backfillFromPaidInvoices() {
    const invoices = await prisma.invoice.findMany({
      where: {
        ...softDeleteFilter(),
        amountPaid: { gt: 0 },
        jobId: { not: null },
      },
      include: {
        collections: { where: softDeleteFilter(), select: { amount: true } },
        payments: {
          orderBy: { paidAt: 'asc' },
          select: { amount: true, paymentMethod: true, paidAt: true, reference: true, notes: true },
        },
      },
    });

    let created = 0;
    const examples: string[] = [];

    for (const inv of invoices) {
      const alreadyCollected = roundMoney(inv.collections.reduce((s, c) => s + toNumber(c.amount), 0));
      const paid = toNumber(inv.amountPaid);
      const gap = roundMoney(paid - alreadyCollected);
      if (gap <= 0.009 || !inv.jobId) continue;

      const paymentSum = roundMoney(inv.payments.reduce((s, p) => s + toNumber(p.amount), 0));
      if (inv.payments.length && Math.abs(paymentSum - paid) < 0.02 && alreadyCollected < 0.01) {
        for (const p of inv.payments) {
          await prisma.jobCollection.create({
            data: {
              jobId: inv.jobId,
              invoiceId: inv.id,
              amount: p.amount,
              paymentMethod: (p.paymentMethod || 'OTHER').toUpperCase(),
              collectionType: 'OTHER',
              paidAt: p.paidAt,
              reference: p.reference,
              notes: p.notes || `Backfilled from invoice ${inv.invoiceNumber}`,
            },
          });
          created += 1;
        }
      } else {
        await prisma.jobCollection.create({
          data: {
            jobId: inv.jobId,
            invoiceId: inv.id,
            amount: gap,
            paymentMethod: 'OTHER',
            collectionType: 'OTHER',
            paidAt: inv.updatedAt || inv.createdAt,
            reference: inv.invoiceNumber,
            notes: `Backfilled from paid invoice ${inv.invoiceNumber}`,
          },
        });
        created += 1;
      }
      if (examples.length < 20) examples.push(inv.invoiceNumber);
    }

    return { invoicesChecked: invoices.length, collectionsCreated: created, examples };
  }

  async update(id: string, data: {
    amount?: number;
    paymentMethod?: string;
    collectionType?: CollectionType;
    paidAt?: string;
    reference?: string | null;
    notes?: string | null;
  }, userId?: string) {
    const existing = await prisma.jobCollection.findFirst({
      where: { id, ...softDeleteFilter() },
      include: {
        job: {
          include: {
            subTasks: { select: { price: true } },
            collections: {
              where: softDeleteFilter(),
              select: { id: true, amount: true },
            },
          },
        },
      },
    });
    if (!existing) throw new AppError(404, 'Collection not found', 'NOT_FOUND');

    const oldAmount = toNumber(existing.amount);
    const newAmount = data.amount !== undefined ? roundMoney(data.amount) : oldAmount;
    const paymentMethod = data.paymentMethod !== undefined
      ? data.paymentMethod.trim().toUpperCase()
      : existing.paymentMethod;
    const collectionType = data.collectionType ?? existing.collectionType;
    const paidAt = data.paidAt ? new Date(data.paidAt) : existing.paidAt;
    const reference = data.reference === undefined ? existing.reference : (data.reference || null);
    const notes = data.notes === undefined ? existing.notes : (data.notes || null);

    if (existing.invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: existing.invoiceId, ...softDeleteFilter() },
      });
      if (invoice) {
        const newPaid = roundMoney(toNumber(invoice.amountPaid) - oldAmount + newAmount);
        if (newPaid - toNumber(invoice.total) > 0.009) {
          throw new AppError(
            400,
            `Amount would exceed invoice total (${toNumber(invoice.total)})`,
            'AMOUNT_EXCEEDS_BALANCE',
          );
        }
      }
    } else if (existing.job) {
      const jobTotal = jobAmountWithGst(existing.job.subTasks, existing.job.estimatedPrice, existing.job);
      const otherCollected = roundMoney(
        existing.job.collections
          .filter((c) => c.id !== existing.id)
          .reduce((s, c) => s + toNumber(c.amount), 0),
      );
      if (jobTotal > 0 && otherCollected + newAmount - jobTotal > 0.009) {
        throw new AppError(
          400,
          `Amount would exceed job total (${jobTotal})`,
          'AMOUNT_EXCEEDS_BALANCE',
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.jobCollection.update({
        where: { id },
        data: {
          amount: newAmount,
          paymentMethod,
          collectionType,
          paidAt,
          reference,
          notes,
        },
      });

      if (existing.invoiceId && (newAmount !== oldAmount || data.paymentMethod || data.paidAt || data.reference !== undefined || data.notes !== undefined)) {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: existing.invoiceId } });
        if (newAmount !== oldAmount) {
          const amountPaid = Math.max(0, roundMoney(toNumber(invoice.amountPaid) - oldAmount + newAmount));
          await tx.invoice.update({
            where: { id: existing.invoiceId },
            data: {
              amountPaid,
              paymentStatus: paymentStatusFromAmounts(amountPaid, toNumber(invoice.total)),
              updatedById: userId,
            },
          });
        }

        // Best-effort sync of linked Payment row created with this collection
        const matchingPayment = await tx.payment.findFirst({
          where: {
            invoiceId: existing.invoiceId,
            amount: existing.amount,
            paidAt: existing.paidAt,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (matchingPayment) {
          await tx.payment.update({
            where: { id: matchingPayment.id },
            data: {
              amount: newAmount,
              paymentMethod,
              reference,
              paidAt,
              notes: [
                collectionType ? `Type: ${collectionType}` : null,
                notes,
              ].filter(Boolean).join(' · ') || null,
            },
          });
        }
      }
    });

    const full = await prisma.jobCollection.findUniqueOrThrow({
      where: { id },
      include: this.collectionInclude,
    });

    return {
      ...full,
      amount: toNumber(full.amount),
      invoice: full.invoice
        ? {
            ...full.invoice,
            total: toNumber(full.invoice.total),
            amountPaid: toNumber(full.invoice.amountPaid),
          }
        : null,
    };
  }

  async delete(id: string, userId?: string) {
    const existing = await prisma.jobCollection.findFirst({
      where: { id, ...softDeleteFilter() },
    });
    if (!existing) throw new AppError(404, 'Collection not found', 'NOT_FOUND');

    await prisma.$transaction(async (tx) => {
      await tx.jobCollection.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      if (existing.invoiceId) {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: existing.invoiceId } });
        const amountPaid = Math.max(0, Math.round((toNumber(invoice.amountPaid) - toNumber(existing.amount)) * 100) / 100);
        await tx.invoice.update({
          where: { id: existing.invoiceId },
          data: {
            amountPaid,
            paymentStatus: paymentStatusFromAmounts(amountPaid, toNumber(invoice.total)),
            updatedById: userId,
          },
        });
      }
    });

    return { id };
  }
}

class FinanceReportService {
  async weeklySummary(from?: string, to?: string) {
    const { start, end } = weekRange(from, to);

    const [
      jobsReceived,
      jobsOut,
      jobsCompletedHistory,
      invoices,
      collections,
      expenses,
    ] = await Promise.all([
      prisma.job.count({
        where: {
          ...softDeleteFilter(),
          receivedDate: { gte: start, lte: end },
        },
      }),
      prisma.job.count({
        where: {
          ...softDeleteFilter(),
          outDate: { gte: start, lte: end },
        },
      }),
      prisma.jobStatusHistory.count({
        where: {
          toStatus: { in: ['COMPLETED', 'CLOSED', 'INVOICED'] },
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.invoice.findMany({
        where: {
          ...softDeleteFilter(),
          createdAt: { gte: start, lte: end },
        },
        select: { total: true, amountPaid: true, subtotal: true },
      }),
      prisma.jobCollection.findMany({
        where: {
          ...softDeleteFilter(),
          paidAt: { gte: start, lte: end },
        },
        select: { amount: true, paymentMethod: true },
      }),
      prisma.expense.findMany({
        where: {
          ...softDeleteFilter(),
          expenseDate: { gte: start, lte: end },
        },
        select: {
          amount: true,
          category: true,
          otherType: true,
          isPayable: true,
          supplierId: true,
          employeeId: true,
          supplier: { select: { id: true, name: true, supplierCode: true } },
          employee: { select: { id: true, name: true, employeeCode: true } },
        },
      }),
    ]);

    const totalSales = Math.round(invoices.reduce((s, i) => s + toNumber(i.total), 0) * 100) / 100;
    const totalPaymentsReceived = Math.round(
      collections.reduce((s, c) => s + toNumber(c.amount), 0) * 100,
    ) / 100;
    const cashCollected = Math.round(
      collections.filter((c) => isCashMethod(c.paymentMethod)).reduce((s, c) => s + toNumber(c.amount), 0) * 100,
    ) / 100;
    const otherPaymentsCollected = Math.round((totalPaymentsReceived - cashCollected) * 100) / 100;

    const paidExpenses = expenses.filter((e) => !e.isPayable);
    const payableExpenses = expenses.filter((e) => e.isPayable);

    const labourExpenses = Math.round(
      paidExpenses.filter((e) => e.category === 'LABOUR').reduce((s, e) => s + toNumber(e.amount), 0) * 100,
    ) / 100;
    const materialExpenses = Math.round(
      paidExpenses.filter((e) => e.category === 'MATERIAL').reduce((s, e) => s + toNumber(e.amount), 0) * 100,
    ) / 100;
    const otherExpenses = Math.round(
      paidExpenses
        .filter((e) => e.category !== 'LABOUR' && e.category !== 'MATERIAL')
        .reduce((s, e) => s + toNumber(e.amount), 0) * 100,
    ) / 100;
    const totalExpenses = Math.round((labourExpenses + materialExpenses + otherExpenses) * 100) / 100;
    const totalPayables = Math.round(
      payableExpenses.reduce((s, e) => s + toNumber(e.amount), 0) * 100,
    ) / 100;
    const payablesByParty = buildPayablesByParty(payableExpenses);
    const payablesByType = buildPayablesByType(payableExpenses);
    const netProfit = Math.round((totalPaymentsReceived - totalExpenses) * 100) / 100;

    return {
      from: start.toISOString(),
      to: end.toISOString(),
      jobsReceived,
      jobsOut,
      jobsCompleted: jobsCompletedHistory,
      totalSales,
      invoiceCount: invoices.length,
      totalPaymentsReceived,
      cashCollected,
      otherPaymentsCollected,
      labourExpenses,
      materialExpenses,
      otherExpenses,
      totalExpenses,
      totalPayables,
      payablesByParty,
      payablesByType,
      netProfit,
      isProfit: netProfit >= 0,
    };
  }

  async weeklyDetails(
    metric: string,
    from?: string,
    to?: string,
    party?: string,
  ) {
    const { start, end } = weekRange(from, to);
    const key = (metric || '').trim().toLowerCase();

    if (key === 'jobs_received') {
      const jobs = await prisma.job.findMany({
        where: {
          ...softDeleteFilter(),
          receivedDate: { gte: start, lte: end },
        },
        select: {
          id: true,
          jobNumber: true,
          status: true,
          jobType: true,
          receivedDate: true,
          estimatedPrice: true,
          addGst: true,
          jobCategory: true,
          jobSource: true,
          customer: { select: { name: true } },
          vehicle: { select: { registrationNo: true } },
          subTasks: { select: { price: true } },
          invoices: {
            where: softDeleteFilter(),
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              total: true,
              amountPaid: true,
              paymentStatus: true,
              invoiceNumber: true,
            },
          },
          collections: {
            where: softDeleteFilter(),
            select: { amount: true },
          },
        },
        orderBy: { receivedDate: 'desc' },
        take: 500,
      });
      return {
        metric: key,
        title: 'Jobs received',
        from: start.toISOString(),
        to: end.toISOString(),
        columns: ['Date', 'Job', 'Customer', 'Rego', 'Status', 'Type', 'Price'],
        rows: jobs.map((j) => {
          const fin = jobFinanceSnapshot(j);
          return {
            id: j.id,
            date: j.receivedDate,
            jobNumber: j.jobNumber,
            customer: j.customer?.name || '—',
            registrationNo: j.vehicle?.registrationNo || '—',
            status: j.status,
            jobType: j.jobType,
            amount: fin.amount,
          };
        }),
      };
    }

    if (key === 'jobs_out') {
      const jobs = await prisma.job.findMany({
        where: {
          ...softDeleteFilter(),
          outDate: { gte: start, lte: end },
        },
        select: {
          id: true,
          jobNumber: true,
          status: true,
          jobType: true,
          outDate: true,
          outInvoiceType: true,
          outInvoiceNumber: true,
          estimatedPrice: true,
          addGst: true,
          jobCategory: true,
          jobSource: true,
          customer: { select: { name: true } },
          vehicle: { select: { registrationNo: true } },
          subTasks: { select: { price: true } },
          invoices: {
            where: softDeleteFilter(),
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              total: true,
              amountPaid: true,
              paymentStatus: true,
              invoiceNumber: true,
            },
          },
          collections: {
            where: softDeleteFilter(),
            select: { amount: true },
          },
        },
        orderBy: { outDate: 'desc' },
        take: 500,
      });

      const rows = jobs.map((j) => {
        const fin = jobFinanceSnapshot(j);
        return {
          id: j.id,
          date: j.outDate,
          jobNumber: j.jobNumber,
          customer: j.customer?.name || '—',
          registrationNo: j.vehicle?.registrationNo || '—',
          status: j.status,
          jobType: j.jobType,
          outInvoiceType: j.outInvoiceType,
          detail: [
            j.outInvoiceType === 'TAX' ? 'Tax' : j.outInvoiceType === 'CASH' ? 'Cash' : null,
            j.outInvoiceNumber || fin.invoiceNumber || null,
          ].filter(Boolean).join(' · ') || '—',
          amount: fin.amount,
          amountPaid: fin.amountPaid,
          balance: fin.balance,
          paymentStatus: fin.paymentStatus,
          paymentLabel: fin.paymentLabel,
        };
      });

      const taxTotal = roundMoney(
        rows.filter((r) => r.outInvoiceType === 'TAX').reduce((s, r) => s + r.amount, 0),
      );
      const cashTotal = roundMoney(
        rows.filter((r) => r.outInvoiceType === 'CASH').reduce((s, r) => s + r.amount, 0),
      );
      const total = roundMoney(rows.reduce((s, r) => s + r.amount, 0));

      return {
        metric: key,
        title: 'Jobs out',
        from: start.toISOString(),
        to: end.toISOString(),
        columns: ['Out date', 'Job', 'Customer', 'Rego', 'Invoice', 'Status', 'Price', 'Paid'],
        rows,
        total,
        taxTotal,
        cashTotal,
      };
    }

    if (key === 'jobs_completed') {
      const history = await prisma.jobStatusHistory.findMany({
        where: {
          toStatus: { in: ['COMPLETED', 'CLOSED', 'INVOICED'] },
          createdAt: { gte: start, lte: end },
        },
        select: {
          id: true,
          toStatus: true,
          createdAt: true,
          job: {
            select: {
              id: true,
              jobNumber: true,
              jobType: true,
              customer: { select: { name: true } },
              vehicle: { select: { registrationNo: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return {
        metric: key,
        title: 'Jobs completed',
        from: start.toISOString(),
        to: end.toISOString(),
        columns: ['Date', 'Job', 'Customer', 'Rego', 'Status', 'Type'],
        rows: history.map((h) => ({
          id: h.id,
          date: h.createdAt,
          jobNumber: h.job?.jobNumber || '—',
          customer: h.job?.customer?.name || '—',
          registrationNo: h.job?.vehicle?.registrationNo || '—',
          status: h.toStatus,
          jobType: h.job?.jobType || '—',
        })),
      };
    }

    if (key === 'sales') {
      const invoices = await prisma.invoice.findMany({
        where: {
          ...softDeleteFilter(),
          createdAt: { gte: start, lte: end },
        },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          amountPaid: true,
          paymentStatus: true,
          createdAt: true,
          job: {
            select: {
              jobNumber: true,
              customer: { select: { name: true } },
              vehicle: { select: { registrationNo: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return {
        metric: key,
        title: 'Total sales / revenue',
        from: start.toISOString(),
        to: end.toISOString(),
        columns: ['Date', 'Invoice', 'Job', 'Customer', 'Rego', 'Status', 'Amount'],
        rows: invoices.map((inv) => ({
          id: inv.id,
          date: inv.createdAt,
          invoiceNumber: inv.invoiceNumber,
          jobNumber: inv.job?.jobNumber || '—',
          customer: inv.job?.customer?.name || '—',
          registrationNo: inv.job?.vehicle?.registrationNo || '—',
          status: inv.paymentStatus,
          amount: toNumber(inv.total),
          amountPaid: toNumber(inv.amountPaid),
        })),
        total: Math.round(invoices.reduce((s, i) => s + toNumber(i.total), 0) * 100) / 100,
      };
    }

    if (key === 'payments' || key === 'cash' || key === 'other_payments') {
      const collections = await prisma.jobCollection.findMany({
        where: {
          ...softDeleteFilter(),
          paidAt: { gte: start, lte: end },
          ...(key === 'cash' ? { paymentMethod: { equals: 'CASH', mode: 'insensitive' } } : {}),
        },
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          collectionType: true,
          paidAt: true,
          reference: true,
          notes: true,
          job: {
            select: {
              jobNumber: true,
              customer: { select: { name: true } },
              vehicle: { select: { registrationNo: true } },
            },
          },
        },
        orderBy: { paidAt: 'desc' },
        take: 500,
      });

      const rows = (key === 'other_payments'
        ? collections.filter((c) => !isCashMethod(c.paymentMethod))
        : collections
      ).map((c) => ({
        id: c.id,
        date: c.paidAt,
        jobNumber: c.job?.jobNumber || '—',
        customer: c.job?.customer?.name || '—',
        registrationNo: c.job?.vehicle?.registrationNo || '—',
        collectionType: c.collectionType,
        paymentMethod: c.paymentMethod,
        amount: toNumber(c.amount),
        notes: c.notes || c.reference || null,
      }));

      const title = key === 'cash'
        ? 'Cash collected'
        : key === 'other_payments'
          ? 'Other payments'
          : 'Payments received';

      return {
        metric: key,
        title,
        from: start.toISOString(),
        to: end.toISOString(),
        columns: ['Date', 'Job', 'Customer', 'Rego', 'Type', 'Method', 'Amount'],
        rows,
        total: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      };
    }

    if (
      key === 'expenses'
      || key === 'labour_expenses'
      || key === 'material_expenses'
      || key === 'other_expenses'
      || key === 'payables'
    ) {
      const category = key === 'labour_expenses'
        ? 'LABOUR'
        : key === 'material_expenses'
          ? 'MATERIAL'
          : undefined;
      const isPayableOnly = key === 'payables';
      const isOtherOperating = key === 'other_expenses';
      const partyFilter = isPayableOnly ? (party || '').trim() || undefined : undefined;
      const allExpenses = await prisma.expense.findMany({
        where: {
          ...softDeleteFilter(),
          expenseDate: { gte: start, lte: end },
          ...(category ? { category: category as ExpenseCategory } : {}),
          ...(isOtherOperating ? { category: { notIn: ['LABOUR', 'MATERIAL'] } } : {}),
          ...(isPayableOnly ? { isPayable: true } : key === 'expenses' || category || isOtherOperating ? { isPayable: false } : {}),
        },
        select: {
          id: true,
          category: true,
          materialType: true,
          outsourceType: true,
          otherType: true,
          description: true,
          amount: true,
          expenseDate: true,
          paymentMethod: true,
          reference: true,
          isPayable: true,
          supplierId: true,
          employeeId: true,
          supplier: { select: { id: true, name: true, supplierCode: true } },
          employee: { select: { id: true, name: true, employeeCode: true, jobTitle: true } },
        },
        orderBy: { expenseDate: 'desc' },
        take: 500,
      });

      const expenses = partyFilter
        ? allExpenses.filter((e) => getPayablePartyMeta(e).id === partyFilter)
        : allExpenses;
      const partyMeta = partyFilter
        ? (expenses[0]
          ? getPayablePartyMeta(expenses[0])
          : allExpenses.map((e) => getPayablePartyMeta(e)).find((p) => p.id === partyFilter) || null)
        : null;

      const title = key === 'labour_expenses'
        ? 'Labour expenses'
        : key === 'material_expenses'
          ? 'Material expenses'
          : key === 'other_expenses'
            ? 'Other expenses'
            : key === 'payables'
              ? (partyMeta
                ? `Payables · ${partyMeta.name}${partyMeta.code ? ` (${partyMeta.code})` : ''}`
                : 'Payables (credit)')
              : 'Total expenses';

      const byParty = isPayableOnly && !partyFilter ? buildPayablesByParty(allExpenses) : undefined;
      const byType = isPayableOnly && !partyFilter ? buildPayablesByType(allExpenses) : undefined;

      return {
        metric: key,
        title,
        from: start.toISOString(),
        to: end.toISOString(),
        partyId: partyFilter || null,
        party: partyMeta,
        columns: isPayableOnly
          ? ['Date', 'Category', 'Payable to', 'Description', 'Amount']
          : key === 'labour_expenses'
            ? ['Date', 'Category', 'Paid to', 'Description', 'Amount']
            : ['Date', 'Category', 'Description', 'Method', 'Amount'],
        rows: expenses.map((e) => {
          const meta = getPayablePartyMeta(e);
          return {
            id: e.id,
            date: e.expenseDate,
            category: e.category,
            materialType: e.materialType,
            outsourceType: e.outsourceType,
            otherType: e.otherType,
            description: e.description,
            paymentMethod: e.paymentMethod,
            reference: e.reference,
            isPayable: e.isPayable,
            supplier: e.supplier?.name || null,
            supplierCode: e.supplier?.supplierCode || null,
            employee: e.employee?.name || null,
            employeeCode: e.employee?.employeeCode || null,
            partyId: meta.id,
            detail: e.employee?.name || e.supplier?.name || null,
            amount: toNumber(e.amount),
          };
        }),
        total: Math.round(expenses.reduce((s, e) => s + toNumber(e.amount), 0) * 100) / 100,
        ...(byParty ? { byParty } : {}),
        ...(byType ? { byType } : {}),
      };
    }

    if (key === 'net_profit') {
      const [collections, expenses] = await Promise.all([
        prisma.jobCollection.findMany({
          where: {
            ...softDeleteFilter(),
            paidAt: { gte: start, lte: end },
          },
          select: {
            id: true,
            amount: true,
            paymentMethod: true,
            paidAt: true,
            job: {
              select: {
                jobNumber: true,
                customer: { select: { name: true } },
              },
            },
          },
          orderBy: { paidAt: 'desc' },
          take: 500,
        }),
        prisma.expense.findMany({
          where: {
            ...softDeleteFilter(),
            expenseDate: { gte: start, lte: end },
            isPayable: false,
          },
          select: {
            id: true,
            category: true,
            description: true,
            amount: true,
            expenseDate: true,
          },
          orderBy: { expenseDate: 'desc' },
          take: 500,
        }),
      ]);

      const paymentTotal = Math.round(collections.reduce((s, c) => s + toNumber(c.amount), 0) * 100) / 100;
      const expenseTotal = Math.round(expenses.reduce((s, e) => s + toNumber(e.amount), 0) * 100) / 100;

      return {
        metric: key,
        title: 'Net profit / loss',
        from: start.toISOString(),
        to: end.toISOString(),
        columns: ['Date', 'Type', 'Detail', 'Amount'],
        rows: [
          ...collections.map((c) => ({
            id: `p-${c.id}`,
            date: c.paidAt,
            entryType: 'Payment',
            detail: [c.job?.jobNumber, c.job?.customer?.name, c.paymentMethod].filter(Boolean).join(' · '),
            amount: toNumber(c.amount),
          })),
          ...expenses.map((e) => ({
            id: `e-${e.id}`,
            date: e.expenseDate,
            entryType: 'Expense',
            detail: `${e.category} · ${e.description}`,
            amount: -toNumber(e.amount),
          })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        total: Math.round((paymentTotal - expenseTotal) * 100) / 100,
        paymentTotal,
        expenseTotal,
      };
    }

    throw new AppError(400, 'Unknown weekly detail metric', 'INVALID_METRIC');
  }

  /** Full period report: summary + detail lists for PDF / on-screen report */
  async periodReport(from?: string, to?: string) {
    const { start, end } = weekRange(from, to);

    const [summary, jobsReceived, jobsOut, collections, expenses] = await Promise.all([
      this.weeklySummary(from, to),
      prisma.job.findMany({
        where: {
          ...softDeleteFilter(),
          receivedDate: { gte: start, lte: end },
        },
        select: {
          id: true,
          jobNumber: true,
          status: true,
          jobType: true,
          receivedDate: true,
          estimatedPrice: true,
          addGst: true,
          jobCategory: true,
          jobSource: true,
          customer: { select: { name: true } },
          vehicle: { select: { registrationNo: true } },
          subTasks: { select: { price: true } },
          invoices: {
            where: softDeleteFilter(),
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              total: true,
              amountPaid: true,
              paymentStatus: true,
              invoiceNumber: true,
            },
          },
          collections: {
            where: softDeleteFilter(),
            select: { amount: true },
          },
        },
        orderBy: { receivedDate: 'asc' },
        take: 1000,
      }),
      prisma.job.findMany({
        where: {
          ...softDeleteFilter(),
          outDate: { gte: start, lte: end },
        },
        select: {
          id: true,
          jobNumber: true,
          status: true,
          jobType: true,
          outDate: true,
          outInvoiceType: true,
          outInvoiceNumber: true,
          estimatedPrice: true,
          addGst: true,
          jobCategory: true,
          jobSource: true,
          customer: { select: { name: true } },
          vehicle: { select: { registrationNo: true } },
          subTasks: { select: { price: true } },
          invoices: {
            where: softDeleteFilter(),
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              total: true,
              amountPaid: true,
              paymentStatus: true,
              invoiceNumber: true,
            },
          },
          collections: {
            where: softDeleteFilter(),
            select: { amount: true },
          },
        },
        orderBy: { outDate: 'asc' },
        take: 1000,
      }),
      prisma.jobCollection.findMany({
        where: {
          ...softDeleteFilter(),
          paidAt: { gte: start, lte: end },
        },
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          collectionType: true,
          paidAt: true,
          reference: true,
          notes: true,
          job: {
            select: {
              jobNumber: true,
              customer: { select: { name: true } },
              vehicle: { select: { registrationNo: true } },
            },
          },
          invoice: {
            select: {
              invoiceNumber: true,
              notes: true,
              customer: { select: { name: true } },
              lineItems: {
                select: { description: true },
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { paidAt: 'asc' },
        take: 1000,
      }),
      prisma.expense.findMany({
        where: {
          ...softDeleteFilter(),
          expenseDate: { gte: start, lte: end },
        },
        select: {
          id: true,
          category: true,
          materialType: true,
          outsourceType: true,
          otherType: true,
          description: true,
          amount: true,
          expenseDate: true,
          paymentMethod: true,
          reference: true,
          isPayable: true,
          supplier: { select: { id: true, name: true, supplierCode: true } },
          employee: { select: { id: true, name: true, employeeCode: true, jobTitle: true } },
        },
        orderBy: { expenseDate: 'asc' },
        take: 1000,
      }),
    ]);

    const paidExpenses = expenses.filter((e) => !e.isPayable);
    const payableExpenses = expenses.filter((e) => e.isPayable);

    return {
      from: start.toISOString(),
      to: end.toISOString(),
      summary,
      jobsReceived: jobsReceived.map((j) => {
        const fin = jobFinanceSnapshot(j);
        return {
          id: j.id,
          date: j.receivedDate,
          jobNumber: j.jobNumber,
          customer: j.customer?.name || '—',
          registrationNo: j.vehicle?.registrationNo || '—',
          status: j.status,
          jobType: j.jobType,
          amount: fin.amount,
        };
      }),
      jobsOut: jobsOut.map((j) => {
        const fin = jobFinanceSnapshot(j);
        return {
          id: j.id,
          date: j.outDate,
          jobNumber: j.jobNumber,
          customer: j.customer?.name || '—',
          registrationNo: j.vehicle?.registrationNo || '—',
          status: j.status,
          detail: [
            j.outInvoiceType === 'TAX' ? 'Tax' : j.outInvoiceType === 'CASH' ? 'Cash' : null,
            j.outInvoiceNumber || fin.invoiceNumber || null,
          ].filter(Boolean).join(' · ') || '—',
          amount: fin.amount,
          amountPaid: fin.amountPaid,
          balance: fin.balance,
          paymentStatus: fin.paymentStatus,
          paymentLabel: fin.paymentLabel,
        };
      }),
      collections: collections.map((c) => ({
        id: c.id,
        date: c.paidAt,
        jobNumber: c.job?.jobNumber || c.invoice?.invoiceNumber || '—',
        customer: c.job?.customer?.name || c.invoice?.customer?.name || '—',
        registrationNo: c.job?.vehicle?.registrationNo || '—',
        description:
          c.invoice?.lineItems?.[0]?.description
          || c.invoice?.notes
          || c.notes
          || c.reference
          || null,
        collectionType: c.collectionType,
        paymentMethod: c.paymentMethod,
        amount: toNumber(c.amount),
      })),
      expenses: paidExpenses.map((e) => ({
        id: e.id,
        date: e.expenseDate,
        category: e.category,
        materialType: e.materialType,
        outsourceType: e.outsourceType,
        otherType: e.otherType,
        description: e.description,
        paymentMethod: e.paymentMethod,
        supplier: e.supplier?.name || null,
        employee: e.employee?.name || null,
        isPayable: false,
        amount: toNumber(e.amount),
      })),
      payables: payableExpenses.map((e) => ({
        id: e.id,
        date: e.expenseDate,
        category: e.category,
        materialType: e.materialType,
        outsourceType: e.outsourceType,
        otherType: e.otherType,
        description: e.description,
        paymentMethod: e.paymentMethod,
        reference: e.reference,
        supplier: e.supplier?.name || null,
        supplierCode: e.supplier?.supplierCode || null,
        employee: e.employee?.name || null,
        employeeCode: e.employee?.employeeCode || null,
        isPayable: true,
        amount: toNumber(e.amount),
      })),
    };
  }
}

export const expenseService = new ExpenseService();
export const collectionService = new CollectionService();
export const financeReportService = new FinanceReportService();
