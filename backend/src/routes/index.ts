import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize, authenticateCustomer, requirePage } from '../middlewares/auth.middleware';
import { validateBody, validateParams } from '../middlewares/validate.middleware';
import {
  loginSchema, registerSchema, refreshTokenSchema, customerSchema, vehicleSchema,
  leadSchema, updateLeadSchema, jobSchema, updateJobSchema, jobStatusSchema, insuranceClaimSchema, quotationSchema,
  updateQuotationSchema, invoiceSchema, paymentSchema, aiGenerateSchema, idParamSchema, createUserSchema,
  updateUserSchema, createRoleSchema, updateRoleSchema,
  customerLoginSchema, partSaleSchema, updatePartSaleSchema,
  inventoryItemSchema, updateInventoryItemSchema, jobRegistrationSchema, createInvoiceFromJobSchema,
  attendancePunchSchema, attendanceClockOutSchema,
  updateAmountPaidSchema, expenseSchema, updateExpenseSchema, jobCollectionSchema, updateJobCollectionSchema,
  bulkCollectionSchema, bulkJobCollectionSchema, additionalCollectionSchema,
  leadFollowUpSchema, outVehicleMarkSchema, outVehicleUpdateSchema, softDeleteJobSchema,
  supplierSchema, employeeSchema, labourHoursWeekSchema,
} from '../utils/validators';
import {
  authController, customerPortalController,
} from '../controllers/auth.controller';
import { publicController } from '../controllers/public.controller';
import {
  customerController, vehicleController, leadController,
  jobController, insuranceController, quotationController, invoiceController,
  partSaleController, inventoryController,
  aiController, dashboardController, reportController, attendanceController,
  expenseController, collectionController, financeController, outVehicleController,
  whatsappController, backupController, supplierController, employeeController,
  labourHoursController,
} from '../controllers/index.controller';

const router = Router();

const publicRegistrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, error: { message: 'Too many registration attempts. Please try again later.' } },
});

// Public job registration (shareable customer form)
router.post(
  '/public/job-registration',
  publicRegistrationLimiter,
  validateBody(jobRegistrationSchema),
  publicController.submitJobRegistration,
);
router.get('/public/dealers', publicController.listDealers);
router.get('/public/dealers/:code', publicController.getDealer);

// Auth
router.post('/auth/login', validateBody(loginSchema), authController.login);
router.post('/auth/register', authenticate, authorize('SUPER_ADMIN'), validateBody(registerSchema), authController.register);
router.post('/auth/users', authenticate, requirePage('users'), validateBody(createUserSchema), authController.createUser);
router.put('/auth/users/:id', authenticate, requirePage('users'), validateParams(idParamSchema), validateBody(updateUserSchema), authController.updateUser);
router.post('/auth/refresh', validateBody(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validateBody(refreshTokenSchema), authController.logout);
router.get('/auth/profile', authenticate, authController.profile);
router.get('/auth/users', authenticate, requirePage('users'), authController.listUsers);
router.get('/auth/roles', authenticate, authController.listRoles);
router.get('/auth/pages', authenticate, requirePage('users'), authController.listPages);
router.post('/auth/roles', authenticate, requirePage('users'), validateBody(createRoleSchema), authController.createRole);
router.put('/auth/roles/:id', authenticate, requirePage('users'), validateParams(idParamSchema), validateBody(updateRoleSchema), authController.updateRole);
router.delete('/auth/roles/:id', authenticate, requirePage('users'), validateParams(idParamSchema), authController.deleteRole);

// Customer portal (vehicle registration login)
router.post('/customer-auth/login', validateBody(customerLoginSchema), customerPortalController.login);
router.get('/customer-portal/profile', authenticateCustomer, customerPortalController.profile);
router.get('/customer-portal/vehicle', authenticateCustomer, customerPortalController.vehicle);
router.get('/customer-portal/jobs', authenticateCustomer, customerPortalController.jobs);
router.get('/customer-portal/jobs/:id', authenticateCustomer, validateParams(idParamSchema), customerPortalController.jobDetail);
router.get('/customer-portal/invoices', authenticateCustomer, customerPortalController.invoices);

// Customers
router.get('/customers', authenticate, customerController.list);
router.get('/customers/:id', authenticate, validateParams(idParamSchema), customerController.get);
router.post('/customers', authenticate, validateBody(customerSchema), customerController.create);
router.put('/customers/:id', authenticate, validateParams(idParamSchema), validateBody(customerSchema.partial()), customerController.update);
router.delete('/customers/:id', authenticate, authorize('SUPER_ADMIN', 'MANAGER'), validateParams(idParamSchema), customerController.delete);

router.get('/suppliers', authenticate, supplierController.list);
router.get('/suppliers/:id', authenticate, validateParams(idParamSchema), supplierController.get);
router.post('/suppliers', authenticate, requirePage('suppliers'), validateBody(supplierSchema), supplierController.create);
router.put('/suppliers/:id', authenticate, requirePage('suppliers'), validateParams(idParamSchema), validateBody(supplierSchema.partial()), supplierController.update);
router.delete('/suppliers/:id', authenticate, requirePage('suppliers'), validateParams(idParamSchema), supplierController.delete);

router.get('/employees', authenticate, employeeController.list);
router.get('/employees/:id', authenticate, validateParams(idParamSchema), employeeController.get);
router.post('/employees', authenticate, requirePage('employees'), validateBody(employeeSchema), employeeController.create);
router.put('/employees/:id', authenticate, requirePage('employees'), validateParams(idParamSchema), validateBody(employeeSchema.partial()), employeeController.update);
router.delete('/employees/:id', authenticate, requirePage('employees'), validateParams(idParamSchema), employeeController.delete);

router.get('/labour-hours', authenticate, requirePage('labour-hours'), labourHoursController.getWeek);
router.post('/labour-hours/week', authenticate, requirePage('labour-hours'), validateBody(labourHoursWeekSchema), labourHoursController.saveWeek);
router.delete('/labour-hours/:id', authenticate, requirePage('labour-hours'), validateParams(idParamSchema), labourHoursController.delete);

// Vehicles
router.get('/vehicles', authenticate, vehicleController.list);
router.get('/vehicles/:id', authenticate, validateParams(idParamSchema), vehicleController.get);
router.post('/vehicles', authenticate, validateBody(vehicleSchema), vehicleController.create);
router.put('/vehicles/:id', authenticate, validateParams(idParamSchema), validateBody(vehicleSchema.partial()), vehicleController.update);
router.delete('/vehicles/:id', authenticate, validateParams(idParamSchema), vehicleController.delete);

// Leads
router.get('/leads', authenticate, leadController.list);
router.get('/leads/:id', authenticate, validateParams(idParamSchema), leadController.get);
router.post('/leads', authenticate, validateBody(leadSchema), leadController.create);
router.put('/leads/:id', authenticate, validateParams(idParamSchema), validateBody(updateLeadSchema), leadController.update);
router.post('/leads/:id/follow-ups', authenticate, validateParams(idParamSchema), validateBody(leadFollowUpSchema), leadController.addFollowUp);
router.delete('/leads/:id', authenticate, validateParams(idParamSchema), leadController.delete);

// Jobs
router.get('/jobs', authenticate, jobController.list);
router.get('/jobs/:id', authenticate, validateParams(idParamSchema), jobController.get);
router.post('/jobs', authenticate, validateBody(jobSchema), jobController.create);
router.put('/jobs/:id', authenticate, validateParams(idParamSchema), validateBody(updateJobSchema), jobController.update);
router.patch('/jobs/:id/status', authenticate, validateParams(idParamSchema), validateBody(jobStatusSchema), jobController.updateStatus);
router.delete('/jobs/:id', authenticate, authorize('SUPER_ADMIN', 'MANAGER'), validateParams(idParamSchema), validateBody(softDeleteJobSchema), jobController.delete);
router.delete('/jobs/:id/permanent', authenticate, authorize('SUPER_ADMIN', 'MANAGER'), validateParams(idParamSchema), jobController.permanentDelete);

// Parts Sales
router.get('/part-sales', authenticate, partSaleController.list);
router.get('/part-sales/:id', authenticate, validateParams(idParamSchema), partSaleController.get);
router.post('/part-sales', authenticate, validateBody(partSaleSchema), partSaleController.create);
router.put('/part-sales/:id', authenticate, validateParams(idParamSchema), validateBody(updatePartSaleSchema), partSaleController.update);
router.delete('/part-sales/:id', authenticate, validateParams(idParamSchema), partSaleController.delete);

// Inventory
router.get('/inventory', authenticate, inventoryController.list);
router.get('/inventory/:id', authenticate, validateParams(idParamSchema), inventoryController.get);
router.post('/inventory', authenticate, validateBody(inventoryItemSchema), inventoryController.create);
router.put('/inventory/:id', authenticate, validateParams(idParamSchema), validateBody(updateInventoryItemSchema), inventoryController.update);
router.delete('/inventory/:id', authenticate, validateParams(idParamSchema), inventoryController.delete);

// Insurance
router.get('/insurance-claims', authenticate, insuranceController.list);
router.get('/insurance-claims/:id', authenticate, validateParams(idParamSchema), insuranceController.get);
router.post('/insurance-claims', authenticate, validateBody(insuranceClaimSchema), insuranceController.create);
router.put('/insurance-claims/:id', authenticate, validateParams(idParamSchema), validateBody(insuranceClaimSchema.partial()), insuranceController.update);
router.delete('/insurance-claims/:id', authenticate, authorize('SUPER_ADMIN', 'MANAGER'), validateParams(idParamSchema), insuranceController.delete);

// Quotations
router.get('/quotations', authenticate, quotationController.list);
router.get('/quotations/:id', authenticate, validateParams(idParamSchema), quotationController.get);
router.post('/quotations', authenticate, validateBody(quotationSchema), quotationController.create);
router.put('/quotations/:id', authenticate, validateParams(idParamSchema), validateBody(updateQuotationSchema), quotationController.update);
router.post('/quotations/:id/send-email', authenticate, validateParams(idParamSchema), quotationController.sendEmail);
router.post('/quotations/:id/send-whatsapp', authenticate, validateParams(idParamSchema), quotationController.sendWhatsApp);
router.patch('/quotations/:id/status', authenticate, validateParams(idParamSchema), quotationController.updateStatus);
router.delete('/quotations/:id', authenticate, validateParams(idParamSchema), quotationController.delete);

// Invoices
router.get('/invoices', authenticate, invoiceController.list);
router.get('/invoices/:id', authenticate, validateParams(idParamSchema), invoiceController.get);
router.post('/invoices', authenticate, validateBody(invoiceSchema), invoiceController.create);
router.post('/invoices/from-job', authenticate, validateBody(createInvoiceFromJobSchema), invoiceController.createFromJob);
router.post('/invoices/:id/payments', authenticate, validateParams(idParamSchema), validateBody(paymentSchema), invoiceController.addPayment);
router.patch('/invoices/:id/amount-paid', authenticate, validateParams(idParamSchema), validateBody(updateAmountPaidSchema), invoiceController.updateAmountPaid);
router.delete('/invoices/:id', authenticate, authorize('SUPER_ADMIN', 'MANAGER'), validateParams(idParamSchema), invoiceController.delete);

// AI (DeepSeek only)
router.post('/ai/generate', authenticate, validateBody(aiGenerateSchema), aiController.generate);
router.post('/ai/workshop-analysis', authenticate, aiController.workshopAnalysis);
router.post('/ai/customer-message', authenticate, aiController.customerMessage);
router.post('/ai/send-email', authenticate, aiController.sendEmail);
router.get('/ai/logs', authenticate, authorize('SUPER_ADMIN', 'MANAGER'), aiController.logs);

// Dashboard
router.get('/dashboard/stats', authenticate, dashboardController.stats);
router.get('/dashboard/recent-jobs', authenticate, dashboardController.recentJobs);
router.get('/dashboard/jobs-by-status', authenticate, dashboardController.jobsByStatus);

// Reports
router.get('/reports/workshop-sales', authenticate, reportController.workshopSales);
router.get('/reports/jobs', authenticate, reportController.jobsReport);
router.get('/reports/monthly-revenue', authenticate, reportController.monthlyRevenue);
router.get('/reports/insurance-revenue', authenticate, reportController.insuranceRevenue);
router.get('/reports/jobs-by-source', authenticate, reportController.jobsBySource);
router.get('/reports/technician-productivity', authenticate, reportController.technicianProductivity);
router.get('/reports/outstanding-invoices', authenticate, reportController.outstandingInvoices);
router.get('/reports/export/:type', authenticate, reportController.export);

// Attendance
router.get('/attendance/status', authenticate, attendanceController.status);
router.post('/attendance/clock-in', authenticate, validateBody(attendancePunchSchema), attendanceController.clockIn);
router.post('/attendance/clock-out', authenticate, validateBody(attendanceClockOutSchema), attendanceController.clockOut);
router.get('/attendance/my-history', authenticate, attendanceController.myHistory);
router.get('/attendance/report', authenticate, requirePage('reports'), attendanceController.report);

// Finance
router.get('/finance/weekly-summary', authenticate, requirePage('finance'), financeController.weeklySummary);
router.get('/finance/weekly-details', authenticate, requirePage('finance'), financeController.weeklyDetails);
router.get('/finance/period-report', authenticate, requirePage('finance'), financeController.periodReport);
router.get('/finance/expenses', authenticate, requirePage('finance'), expenseController.list);
router.post('/finance/expenses', authenticate, requirePage('finance'), validateBody(expenseSchema), expenseController.create);
router.put('/finance/expenses/:id', authenticate, requirePage('finance'), validateParams(idParamSchema), validateBody(updateExpenseSchema), expenseController.update);
router.delete('/finance/expenses/:id', authenticate, requirePage('finance'), validateParams(idParamSchema), expenseController.delete);
router.get('/finance/collections', authenticate, requirePage('finance'), collectionController.list);
router.get('/finance/collection-jobs', authenticate, requirePage('finance'), collectionController.listJobs);
router.get('/finance/collection-invoices', authenticate, requirePage('finance'), collectionController.listInvoices);
router.post('/finance/collections', authenticate, requirePage('finance'), validateBody(jobCollectionSchema), collectionController.create);
router.post('/finance/collections/bulk', authenticate, requirePage('finance'), validateBody(bulkCollectionSchema), collectionController.createBulk);
router.post('/finance/collections/bulk-jobs', authenticate, requirePage('finance'), validateBody(bulkJobCollectionSchema), collectionController.createBulkJobs);
router.post('/finance/collections/additional', authenticate, requirePage('finance'), validateBody(additionalCollectionSchema), collectionController.createAdditional);
router.post('/finance/collections/backfill-from-invoices', authenticate, requirePage('finance'), collectionController.backfillFromInvoices);
router.put('/finance/collections/:id', authenticate, requirePage('finance'), validateParams(idParamSchema), validateBody(updateJobCollectionSchema), collectionController.update);
router.delete('/finance/collections/:id', authenticate, requirePage('finance'), validateParams(idParamSchema), collectionController.delete);

// Out vehicles
router.get('/out-vehicles', authenticate, requirePage('out-vehicles'), outVehicleController.list);
router.post('/out-vehicles/:id/mark-out', authenticate, requirePage('out-vehicles'), validateParams(idParamSchema), validateBody(outVehicleMarkSchema), outVehicleController.markOut);
router.put('/out-vehicles/:id', authenticate, requirePage('out-vehicles'), validateParams(idParamSchema), validateBody(outVehicleUpdateSchema), outVehicleController.updateOut);

// WhatsApp group notifications (setup / pairing)
router.get('/whatsapp/status', authenticate, requirePage('whatsapp'), whatsappController.status);
router.post('/whatsapp/start', authenticate, requirePage('whatsapp'), whatsappController.start);
router.post('/whatsapp/stop', authenticate, requirePage('whatsapp'), whatsappController.stop);
router.get('/whatsapp/qr', authenticate, requirePage('whatsapp'), whatsappController.qr);
router.get('/whatsapp/groups', authenticate, requirePage('whatsapp'), whatsappController.groups);
router.post('/whatsapp/group', authenticate, requirePage('whatsapp'), whatsappController.selectGroup);
router.post('/whatsapp/test', authenticate, requirePage('whatsapp'), whatsappController.test);

// Database backup (Super Admin only) — writes to BACKUP_DIR / host backups folder
router.get('/admin/backups', authenticate, authorize('SUPER_ADMIN'), backupController.list);
router.post('/admin/backups', authenticate, authorize('SUPER_ADMIN'), backupController.create);

export default router;
