import { JobCategory, Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { softDeleteFilter, toNumber, jobAmountWithGst } from '../utils/helpers';

const JOB_CATEGORIES: JobCategory[] = ['DEALER', 'NON_DEALER', 'BUSINESS'];

function parseJobCategory(value?: string): JobCategory | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase() as JobCategory;
  return JOB_CATEGORIES.includes(normalized) ? normalized : undefined;
}

function parseDateRange(from?: string, to?: string) {
  const now = new Date();
  const start = from
    ? new Date(from.includes('T') ? from : `${from}T00:00:00.000`)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = to
    ? new Date(to.includes('T') ? to : `${to}T23:59:59.999`)
    : now;
  return { start, end };
}

function sumJobValues(
  jobs: { estimatedPrice: import('@prisma/client').Prisma.Decimal | null; subTasks: { price: import('@prisma/client').Prisma.Decimal | null }[] }[],
) {
  const total = jobs.reduce((sum, job) => {
    if (job.subTasks.length) {
      return sum + job.subTasks.reduce((s, t) => s + toNumber(t.price), 0);
    }
    return sum + toNumber(job.estimatedPrice);
  }, 0);
  return Math.round(total * 100) / 100;
}

async function jobValuesInPeriod(start?: Date, end?: Date) {
  const jobs = await prisma.job.findMany({
    where: {
      ...softDeleteFilter(),
      ...(start && end ? { createdAt: { gte: start, lte: end } } : {}),
    },
    select: {
      estimatedPrice: true,
      subTasks: { select: { price: true } },
    },
  });
  return { total: sumJobValues(jobs), count: jobs.length };
}

async function invoiceSalesInPeriod(start: Date, end: Date, jobCategory?: JobCategory) {
  const invoices = await prisma.invoice.findMany({
    where: {
      ...softDeleteFilter(),
      createdAt: { gte: start, lte: end },
      ...(jobCategory
        ? {
            job: {
              is: jobCategoryWhere(jobCategory),
            },
          }
        : {}),
    },
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      subtotal: true,
      amountPaid: true,
      paymentStatus: true,
      createdAt: true,
      customer: { select: { name: true } },
      job: {
        select: {
          jobNumber: true,
          jobCategory: true,
          jobSource: true,
          vehicle: { select: { registrationNo: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalSales = invoices.reduce((sum, inv) => sum + toNumber(inv.total), 0);
  const subtotal = invoices.reduce((sum, inv) => sum + toNumber(inv.subtotal), 0);
  const amountPaid = invoices.reduce((sum, inv) => sum + toNumber(inv.amountPaid), 0);

  return {
    totalSales: Math.round(totalSales * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    gst: Math.round((totalSales - subtotal) * 100) / 100,
    amountPaid: Math.round(amountPaid * 100) / 100,
    invoiceCount: invoices.length,
    invoices,
    jobCategory: jobCategory || null,
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

export class DashboardService {
  async getStats(from?: string, to?: string) {
    const { start, end } = parseDateRange(from, to);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [
      totalCustomers,
      activeJobs,
      insuranceClaims,
      pendingQuotes,
      jobsCompleted,
      techniciansActive,
      periodInvoiceSales,
      outstandingInvoices,
      allJobValues,
      periodJobValues,
    ] = await Promise.all([
      prisma.customer.count({ where: softDeleteFilter() }),
      prisma.job.count({
        where: {
          ...softDeleteFilter(),
          status: { notIn: ['COMPLETED', 'INVOICED', 'CLOSED'] },
        },
      }),
      prisma.insuranceClaim.count({ where: { ...softDeleteFilter(), approvalStatus: 'PENDING' } }),
      prisma.quotation.count({ where: { ...softDeleteFilter(), status: { in: ['DRAFT', 'SENT'] } } }),
      prisma.job.count({
        where: {
          ...softDeleteFilter(),
          status: { in: ['COMPLETED', 'INVOICED', 'CLOSED'] },
          updatedAt: { gte: startOfMonth },
        },
      }),
      prisma.job.groupBy({
        by: ['assignedTechnicianId'],
        where: {
          ...softDeleteFilter(),
          assignedTechnicianId: { not: null },
          status: { notIn: ['COMPLETED', 'INVOICED', 'CLOSED'] },
        },
      }),
      invoiceSalesInPeriod(start, end),
      prisma.invoice.findMany({
        where: { ...softDeleteFilter(), paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] } },
        select: { total: true, amountPaid: true },
      }),
      jobValuesInPeriod(),
      jobValuesInPeriod(start, end),
    ]);

    const revenue = periodInvoiceSales.totalSales;
    const profit = Math.round(periodInvoiceSales.subtotal * 0.35 * 100) / 100;
    const outstanding = outstandingInvoices.reduce(
      (sum, inv) => sum + toNumber(inv.total) - toNumber(inv.amountPaid),
      0
    );

    return {
      totalCustomers,
      activeJobs,
      insuranceClaims,
      pendingQuotes,
      revenue,
      profit,
      jobsCompleted,
      techniciansActive: techniciansActive.length,
      outstandingInvoices: Math.round(outstanding * 100) / 100,
      salesFrom: start.toISOString(),
      salesTo: end.toISOString(),
      invoiceCount: periodInvoiceSales.invoiceCount,
      invoiceAmountPaid: periodInvoiceSales.amountPaid,
      totalJobValue: allJobValues.total,
      periodJobValue: periodJobValues.total,
      jobCount: allJobValues.count,
    };
  }

  async getRecentJobs(limit = 10) {
    return prisma.job.findMany({
      where: softDeleteFilter(),
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } },
        vehicle: { select: { registrationNo: true, make: true, model: true } },
        assignedTechnician: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async getJobsByStatus() {
    const groups = await prisma.job.groupBy({
      by: ['status'],
      where: softDeleteFilter(),
      _count: { status: true },
    });
    return groups.map((g) => ({ status: g.status, count: g._count.status }));
  }
}

function jobCategoryWhere(category?: JobCategory): Prisma.JobWhereInput {
  if (!category) return {};
  // Dealer filter also includes uncategorised jobs created with Dealer source
  if (category === 'DEALER') {
    return {
      OR: [
        { jobCategory: 'DEALER' },
        { jobCategory: null, jobSource: 'DEALER' },
      ],
    };
  }
  return { jobCategory: category };
}

export class ReportService {
  async workshopSales(from?: string, to?: string, jobCategory?: string) {
    const { start, end } = parseDateRange(from, to);
    return invoiceSalesInPeriod(start, end, parseJobCategory(jobCategory));
  }

  async jobsReport(from?: string, to?: string, jobCategory?: string) {
    const { start, end } = parseDateRange(from, to);
    const category = parseJobCategory(jobCategory);

    const jobs = await prisma.job.findMany({
      where: {
        ...softDeleteFilter(),
        createdAt: { gte: start, lte: end },
        ...jobCategoryWhere(category),
      },
      select: {
        id: true,
        jobNumber: true,
        status: true,
        jobCategory: true,
        jobSource: true,
        company: true,
        description: true,
        estimatedPrice: true,
        addGst: true,
        createdAt: true,
        receivedDate: true,
        customer: { select: { id: true, name: true, phone: true } },
        vehicle: { select: { registrationNo: true, make: true, model: true } },
        subTasks: { select: { price: true, description: true } },
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
      },
      orderBy: [{ customer: { name: 'asc' } }, { createdAt: 'desc' }],
    });

    const shortDescription = (text?: string | null, max = 80) => {
      const value = (text || '').replace(/\s+/g, ' ').trim();
      if (!value) return '—';
      return value.length > max ? `${value.slice(0, max - 1)}…` : value;
    };

    const rows = jobs.map((job) => {
      const entered = job.subTasks.length
        ? job.subTasks.reduce((s, t) => s + toNumber(t.price), 0)
        : toNumber(job.estimatedPrice);
      const invoice = job.invoices[0] || null;
      const isDealer = job.jobCategory === 'DEALER' || (!job.jobCategory && job.jobSource === 'DEALER');
      const descriptionSource = job.description
        || job.subTasks.map((t) => t.description).filter(Boolean).join('; ');
      const amount = invoice
        ? toNumber(invoice.total)
        : jobAmountWithGst(job.subTasks, job.estimatedPrice, job);

      return {
        id: job.id,
        jobNumber: job.jobNumber,
        status: job.status,
        jobCategory: job.jobCategory,
        jobSource: job.jobSource,
        isDealer,
        dealerLabel: isDealer ? 'Dealer' : 'Non Dealer',
        company: job.company,
        description: shortDescription(descriptionSource),
        estimatedValue: Math.round(entered * 100) / 100,
        amount,
        createdAt: job.createdAt,
        receivedDate: job.receivedDate,
        customer: job.customer,
        customerName: job.customer?.name || '—',
        vehicle: job.vehicle,
        registrationNo: job.vehicle?.registrationNo || '—',
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
    });

    // Already ordered by customer name from Prisma; keep stable secondary sort
    rows.sort((a, b) => {
      const nameCmp = a.customerName.localeCompare(b.customerName, undefined, { sensitivity: 'base' });
      if (nameCmp !== 0) return nameCmp;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const totalEstimatedValue = Math.round(
      rows.reduce((s, r) => s + r.estimatedValue, 0) * 100,
    ) / 100;
    const totalAmount = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    const invoicedCount = rows.filter((r) => r.invoice).length;

    // Dealer-wise grouping by customer (dealer jobs only)
    const dealerJobs = rows.filter((r) => r.isDealer);
    const dealerGroupMap = new Map<string, typeof rows>();
    for (const row of dealerJobs) {
      const key = row.customerName;
      if (!dealerGroupMap.has(key)) dealerGroupMap.set(key, []);
      dealerGroupMap.get(key)!.push(row);
    }
    const dealerGroups = [...dealerGroupMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map(([customerName, groupJobs]) => ({
        customerName,
        jobCount: groupJobs.length,
        totalAmount: Math.round(groupJobs.reduce((s, j) => s + j.amount, 0) * 100) / 100,
        totalEstimatedValue: Math.round(groupJobs.reduce((s, j) => s + j.estimatedValue, 0) * 100) / 100,
        jobs: groupJobs,
      }));

    return {
      jobCount: rows.length,
      invoicedCount,
      uninvoicedCount: rows.length - invoicedCount,
      totalEstimatedValue,
      totalAmount,
      jobCategory: category || null,
      from: start.toISOString(),
      to: end.toISOString(),
      jobs: rows,
      dealerGroups,
      dealerJobCount: dealerJobs.length,
      dealerTotalAmount: Math.round(dealerJobs.reduce((s, j) => s + j.amount, 0) * 100) / 100,
    };
  }

  async monthlyRevenue(year: number, jobCategory?: string) {
    const category = parseJobCategory(jobCategory);
    const results = [];
    for (let month = 0; month < 12; month++) {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59);
      const invoices = await prisma.invoice.findMany({
        where: {
          ...softDeleteFilter(),
          createdAt: { gte: start, lte: end },
          ...(category ? { job: { is: jobCategoryWhere(category) } } : {}),
        },
        select: { total: true, subtotal: true },
      });
      const revenue = invoices.reduce((s, i) => s + toNumber(i.total), 0);
      results.push({ month: month + 1, revenue, invoiceCount: invoices.length });
    }
    return results;
  }

  async insuranceRevenue(year: number) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);
    const claims = await prisma.insuranceClaim.findMany({
      where: {
        ...softDeleteFilter(),
        createdAt: { gte: start, lte: end },
        approvalStatus: { in: ['APPROVED', 'PARTIALLY_APPROVED', 'COMPLETED'] },
      },
      select: { approvedAmount: true, insuranceCompany: true },
    });
    const byCompany: Record<string, number> = {};
    claims.forEach((c) => {
      const amt = toNumber(c.approvedAmount);
      byCompany[c.insuranceCompany] = (byCompany[c.insuranceCompany] || 0) + amt;
    });
    return { total: claims.reduce((s, c) => s + toNumber(c.approvedAmount), 0), byCompany };
  }

  async jobsBySource(jobCategory?: string) {
    const category = parseJobCategory(jobCategory);
    const where: Prisma.JobWhereInput = {
      ...softDeleteFilter(),
      ...jobCategoryWhere(category),
    };
    const groups = await prisma.job.groupBy({
      by: ['jobSource'],
      where,
      _count: { jobSource: true },
    });
    return groups.map((g) => ({ source: g.jobSource, count: g._count.jobSource }));
  }

  async technicianProductivity(jobCategory?: string) {
    const category = parseJobCategory(jobCategory);
    const technicians = await prisma.user.findMany({
      where: { role: { name: 'TECHNICIAN' }, deletedAt: null, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });

    const results = await Promise.all(
      technicians.map(async (tech) => {
        const jobFilter: Prisma.JobWhereInput = {
          ...softDeleteFilter(),
          assignedTechnicianId: tech.id,
          ...jobCategoryWhere(category),
        };
        const completed = await prisma.job.count({
          where: {
            ...jobFilter,
            status: { in: ['COMPLETED', 'INVOICED', 'CLOSED'] },
          },
        });
        const active = await prisma.job.count({
          where: {
            ...jobFilter,
            status: { notIn: ['COMPLETED', 'INVOICED', 'CLOSED'] },
          },
        });
        return { ...tech, completedJobs: completed, activeJobs: active };
      })
    );

    return results;
  }

  async outstandingInvoicesReport(jobCategory?: string) {
    const category = parseJobCategory(jobCategory);
    return prisma.invoice.findMany({
      where: {
        ...softDeleteFilter(),
        paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'] },
        ...(category ? { job: { is: jobCategoryWhere(category) } } : {}),
      },
      include: {
        customer: { select: { name: true, phone: true, email: true } },
        job: { select: { jobNumber: true, jobCategory: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async exportData(type: string, format: 'json' | 'csv' = 'json') {
    let data: unknown[] = [];
    switch (type) {
      case 'customers':
        data = await prisma.customer.findMany({ where: softDeleteFilter() });
        break;
      case 'jobs':
        data = await prisma.job.findMany({
          where: softDeleteFilter(),
          include: { customer: true, vehicle: true },
        });
        break;
      case 'invoices':
        data = await prisma.invoice.findMany({
          where: softDeleteFilter(),
          include: { customer: true, payments: true },
        });
        break;
      case 'leads':
        data = await prisma.lead.findMany({ where: softDeleteFilter() });
        break;
      default:
        data = [];
    }

    if (format === 'csv' && data.length > 0) {
      const headers = Object.keys(data[0] as object);
      const rows = data.map((row) =>
        headers.map((h) => JSON.stringify((row as Record<string, unknown>)[h] ?? '')).join(',')
      );
      return { format: 'csv', content: [headers.join(','), ...rows].join('\n') };
    }

    return { format: 'json', content: data };
  }
}

export const dashboardService = new DashboardService();
export const reportService = new ReportService();
