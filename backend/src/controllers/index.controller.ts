import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendSuccess, asyncHandler, AppError } from '../utils/response';
import { customerService } from '../services/customer.service';
import { vehicleService } from '../services/vehicle.service';
import { leadService } from '../services/lead.service';
import { jobService } from '../services/job.service';
import { partSaleService } from '../services/part-sale.service';
import { inventoryService } from '../services/inventory.service';
import { insuranceService, quotationService, invoiceService } from '../services/business.service';
import { dashboardService, reportService } from '../services/dashboard.service';
import { attendanceService } from '../services/attendance.service';
import { expenseService, collectionService, financeReportService } from '../services/finance.service';
import { outVehicleService } from '../services/out-vehicle.service';
import { whatsappService } from '../services/whatsapp.service';
import { deepSeekService } from '../services/deepseek.service';
import { backupService } from '../services/backup.service';
import { supplierService } from '../services/supplier.service';
import { employeeService } from '../services/employee.service';
import { labourHoursService } from '../services/labour-hours.service';

const uid = (req: AuthRequest) => req.user?.userId;
const paramId = (req: AuthRequest) => req.params.id as string;

export const customerController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await customerService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await customerService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await customerService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await customerService.update(paramId(req), req.body, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await customerService.delete(paramId(req), uid(req)));
  }),
};

export const supplierController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await supplierService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await supplierService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await supplierService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await supplierService.update(paramId(req), req.body, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await supplierService.delete(paramId(req), uid(req)));
  }),
};

export const employeeController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await employeeService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await employeeService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await employeeService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await employeeService.update(paramId(req), req.body, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await employeeService.delete(paramId(req), uid(req)));
  }),
};

export const labourHoursController = {
  getWeek: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await labourHoursService.getWeek(String(req.query.weekStart || '')));
  }),
  saveWeek: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await labourHoursService.saveWeek(req.body, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await labourHoursService.deleteEntry(paramId(req)));
  }),
};

export const vehicleController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await vehicleService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await vehicleService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await vehicleService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await vehicleService.update(paramId(req), req.body, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await vehicleService.delete(paramId(req), uid(req)));
  }),
};

export const leadController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await leadService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await leadService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await leadService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await leadService.update(paramId(req), req.body, uid(req)));
  }),
  addFollowUp: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status, description, nextDate } = req.body;
    sendSuccess(
      res,
      await leadService.addFollowUp(
        paramId(req),
        {
          status,
          description,
          nextDate: nextDate ? new Date(nextDate) : null,
        },
        uid(req),
      ),
      201,
    );
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await leadService.delete(paramId(req), uid(req)));
  }),
};

export const jobController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await jobService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await jobService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await jobService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await jobService.update(paramId(req), req.body, uid(req)));
  }),
  updateStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await jobService.updateStatus(paramId(req), req.body.status, req.body.notes, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await jobService.delete(paramId(req), req.body.remarks, uid(req)));
  }),
  permanentDelete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await jobService.permanentDelete(paramId(req)));
  }),
};

export const partSaleController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await partSaleService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await partSaleService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await partSaleService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await partSaleService.update(paramId(req), req.body, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await partSaleService.delete(paramId(req), uid(req)));
  }),
};

export const inventoryController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await inventoryService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await inventoryService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await inventoryService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await inventoryService.update(paramId(req), req.body, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await inventoryService.delete(paramId(req), uid(req)));
  }),
};

export const insuranceController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await insuranceService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await insuranceService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await insuranceService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await insuranceService.update(paramId(req), req.body, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await insuranceService.delete(paramId(req), uid(req)));
  }),
};

export const quotationController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await quotationService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await quotationService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await quotationService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await quotationService.update(paramId(req), req.body, uid(req)));
  }),
  sendEmail: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await quotationService.sendEmail(paramId(req), uid(req)));
  }),
  sendWhatsApp: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await quotationService.sendWhatsApp(paramId(req), uid(req)));
  }),
  updateStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await quotationService.updateStatus(paramId(req), req.body.status, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await quotationService.delete(paramId(req), uid(req)));
  }),
};

export const invoiceController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await invoiceService.list(req.query as never));
  }),
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await invoiceService.getById(paramId(req)));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await invoiceService.create(req.body, uid(req)), 201);
  }),
  createFromJob: asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await invoiceService.createFromJob(req.body, uid(req));
    sendSuccess(res, result.invoice, result.created ? 201 : 200);
  }),
  addPayment: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await invoiceService.addPayment(paramId(req), req.body, uid(req)), 201);
  }),
  updateAmountPaid: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await invoiceService.updateAmountPaid(paramId(req), req.body.amountPaid, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await invoiceService.delete(paramId(req), uid(req)));
  }),
};

export const aiController = {
  generate: asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await deepSeekService.generate({
      type: req.body.type,
      context: req.body.context,
      userId: uid(req),
      entityType: req.body.entityType,
      entityId: req.body.entityId,
      additionalInfo: req.body.additionalInfo,
    });
    sendSuccess(res, result);
  }),

  workshopAnalysis: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await deepSeekService.generateWorkshopAnalysis(req.body.context, uid(req)));
  }),

  customerMessage: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await deepSeekService.generateCustomerMessage(req.body.context, uid(req), req.body.channel));
  }),

  sendEmail: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { to, subject, body } = req.body;
    sendSuccess(res, await deepSeekService.sendEmailViaWebhook({
      to,
      subject,
      text: body,
      html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.6;">${body}</pre>`,
    }));
  }),

  logs: asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    sendSuccess(res, await deepSeekService.getLogs(page, limit));
  }),
};

export const dashboardController = {
  stats: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await dashboardService.getStats(
      req.query.from as string | undefined,
      req.query.to as string | undefined,
    ));
  }),
  recentJobs: asyncHandler(async (req: AuthRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;
    sendSuccess(res, await dashboardService.getRecentJobs(limit));
  }),
  jobsByStatus: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await dashboardService.getJobsByStatus());
  }),
};

export const reportController = {
  workshopSales: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await reportService.workshopSales(
      req.query.from as string | undefined,
      req.query.to as string | undefined,
      req.query.jobCategory as string | undefined,
    ));
  }),
  jobsReport: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await reportService.jobsReport(
      req.query.from as string | undefined,
      req.query.to as string | undefined,
      req.query.jobCategory as string | undefined,
    ));
  }),
  monthlyRevenue: asyncHandler(async (req: AuthRequest, res: Response) => {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    sendSuccess(res, await reportService.monthlyRevenue(
      year,
      req.query.jobCategory as string | undefined,
    ));
  }),
  insuranceRevenue: asyncHandler(async (req: AuthRequest, res: Response) => {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    sendSuccess(res, await reportService.insuranceRevenue(year));
  }),
  jobsBySource: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await reportService.jobsBySource(
      req.query.jobCategory as string | undefined,
    ));
  }),
  technicianProductivity: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await reportService.technicianProductivity(
      req.query.jobCategory as string | undefined,
    ));
  }),
  outstandingInvoices: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await reportService.outstandingInvoicesReport(
      req.query.jobCategory as string | undefined,
    ));
  }),
  export: asyncHandler(async (req: AuthRequest, res: Response) => {
    const type = req.params.type as string;
    const format = (req.query.format as 'json' | 'csv') || 'json';
    const result = await reportService.exportData(type, format);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-export.csv"`);
      return res.send(result.content);
    }
    sendSuccess(res, result.content);
  }),
};

export const attendanceController = {
  status: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await attendanceService.getStatus(uid(req)!));
  }),
  clockIn: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { latitude, longitude } = req.body;
    sendSuccess(res, await attendanceService.clockIn(uid(req)!, latitude, longitude), 201);
  }),
  clockOut: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { latitude, longitude, reason } = req.body;
    sendSuccess(res, await attendanceService.clockOut(uid(req)!, latitude, longitude, reason), 201);
  }),
  myHistory: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await attendanceService.getMyHistory(
      uid(req)!,
      req.query.from as string | undefined,
      req.query.to as string | undefined,
    ));
  }),
  report: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await attendanceService.getReport({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      userId: req.query.userId as string | undefined,
    }));
  }),
};

export const expenseController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await expenseService.list(req.query as never));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await expenseService.create(req.body, uid(req)), 201);
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await expenseService.update(paramId(req), req.body, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await expenseService.delete(paramId(req)));
  }),
};

export const collectionController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await collectionService.list(req.query as never));
  }),
  listJobs: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await collectionService.listJobsForCollection(req.query as never));
  }),
  listInvoices: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await collectionService.listInvoicesForCollection(req.query as never));
  }),
  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await collectionService.create(req.body, uid(req)), 201);
  }),
  createBulk: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await collectionService.createBulk(req.body, uid(req)), 201);
  }),
  createBulkJobs: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await collectionService.createBulkFromJobs(req.body, uid(req)), 201);
  }),
  createAdditional: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await collectionService.createAdditionalPayment(req.body, uid(req)), 201);
  }),
  backfillFromInvoices: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await collectionService.backfillFromPaidInvoices());
  }),
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await collectionService.update(paramId(req), req.body, uid(req)));
  }),
  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await collectionService.delete(paramId(req), uid(req)));
  }),
};

export const financeController = {
  weeklySummary: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await financeReportService.weeklySummary(
      req.query.from as string | undefined,
      req.query.to as string | undefined,
    ));
  }),
  weeklyDetails: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await financeReportService.weeklyDetails(
      req.query.metric as string,
      req.query.from as string | undefined,
      req.query.to as string | undefined,
      req.query.party as string | undefined,
    ));
  }),
  periodReport: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await financeReportService.periodReport(
      req.query.from as string | undefined,
      req.query.to as string | undefined,
    ));
  }),
};

export const outVehicleController = {
  list: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await outVehicleService.list(req.query as never));
  }),
  markOut: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await outVehicleService.markOut(paramId(req), req.body, uid(req)));
  }),
  updateOut: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await outVehicleService.updateOut(paramId(req), req.body, uid(req)));
  }),
};

export const whatsappController = {
  status: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await whatsappService.getStatus());
  }),
  start: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await whatsappService.startSession());
  }),
  stop: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await whatsappService.stopSession());
  }),
  qr: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await whatsappService.getQr());
  }),
  groups: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, { groups: await whatsappService.listGroups() });
  }),
  selectGroup: asyncHandler(async (req: AuthRequest, res: Response) => {
    const groupId = String(req.body?.groupId || '');
    if (!groupId.trim()) {
      throw new AppError(400, 'groupId is required', 'VALIDATION');
    }
    sendSuccess(res, await whatsappService.setGroupId(groupId));
  }),
  test: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await whatsappService.sendTestMessage());
  }),
};

export const backupController = {
  list: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await backupService.list());
  }),
  create: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, await backupService.create(), 201);
  }),
};
