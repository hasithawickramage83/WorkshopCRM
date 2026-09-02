import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const pageKeySchema = z.enum([
  'dashboard', 'customers', 'vehicles', 'leads', 'jobs', 'register',
  'inventory', 'parts-sales', 'insurance', 'quotations', 'invoices',
  'finance', 'out-vehicles', 'ai', 'reports', 'attendance', 'users',
]);

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  roleId: z.string().uuid(),
  allowedPages: z.array(pageKeySchema).nullable().optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  allowedPages: z.array(pageKeySchema).nullable().optional(),
  password: z.string().min(8).optional(),
});

export const createRoleSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(255).optional(),
  permissions: z.array(pageKeySchema).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(255).nullable().optional(),
  permissions: z.array(pageKeySchema).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const paginationSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
});

export const businessCompanyEnum = z.enum(['CEYLON_AUTOMOBILE', 'WEST_PANEL_AND_TYRES']);

export const jobTypeEnum = z.enum([
  'PAINTING', 'MECHANICAL', 'ELECTRICAL', 'PANEL_BEATING', 'INSTALLATIONS', 'TYRES', 'BODY_WORK', 'OTHER',
]);

export const jobCategoryEnum = z.enum(['DEALER', 'NON_DEALER', 'BUSINESS']);

export const jobSubTaskTypeEnum = z.enum([
  'PAINTING', 'INSTALLATION', 'PARTS', 'PANEL_BEATING', 'MECHANICAL', 'ELECTRICAL',
  'LABOUR', 'BODY_WORK', 'TYRES', 'OTHER',
]);

export const jobSubTaskSchema = z.object({
  taskType: jobSubTaskTypeEnum,
  description: z.string().min(1),
  price: z.number().min(0).optional().nullable(),
});

export const partCategoryEnum = z.enum([
  'BODY_KIT', 'TAIL_LIGHTS', 'BUMPER', 'HEADLIGHTS', 'MIRRORS', 'GRILLE', 'SPOILER', 'FENDER', 'BONNET', 'DOOR', 'OTHER',
]);

export const customerSchema = z.object({
  name: z.string().min(1),
  company: businessCompanyEnum.optional(),
  companyName: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  customerType: z.enum([
    'WALK_IN', 'INSURANCE', 'DEALER', 'FLEET', 'TRADE', 'BUSINESS', 'SUPPLIER',
  ]),
  source: z.string().optional(),
  notes: z.string().optional(),
});

export const vehicleSchema = z.object({
  registrationNo: z.string().min(1),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().optional().nullable(),
  colour: z.string().optional().nullable(),
  vin: z.string().optional().nullable(),
  engineNumber: z.string().optional().nullable(),
  ownerId: z.string().uuid(),
  notes: z.string().optional().nullable(),
});

export const leadSchema = z.object({
  customerName: z.string().min(1),
  company: businessCompanyEnum.optional(),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  source: z.enum([
    'WALK_IN', 'PHONE_CALL', 'DEALER_VISIT', 'INSURANCE_COMPANY',
    'REFERRAL', 'WEBSITE', 'FACEBOOK', 'FLEET_COMPANY', 'OTHER',
  ]),
  status: z.enum([
    'NEW', 'PENDING', 'CONTACTED', 'VISITED', 'INTERESTED', 'QUOTED', 'NEGOTIATING',
    'WON', 'LOST', 'CLOSED', 'CANCELLED',
  ]).optional(),
  assignedUserId: z.string().uuid().optional(),
  customerId: z.string().uuid().nullable().optional(),
  estimatedPrice: z.number().min(0).optional().nullable(),
  notes: z.string().optional(),
});

export const updateLeadSchema = leadSchema.partial();

export const leadFollowUpSchema = z.object({
  status: z.enum([
    'NEW', 'PENDING', 'CONTACTED', 'VISITED', 'INTERESTED', 'QUOTED', 'NEGOTIATING',
    'WON', 'LOST', 'CLOSED', 'CANCELLED',
  ]),
  description: z.string().min(1).max(2000),
  nextDate: z.string().optional().nullable(),
});

export const jobSchema = z.object({
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  jobSource: z.enum([
    'WALK_IN', 'INSURANCE_CLAIM', 'DEALER', 'FLEET', 'TRADE', 'EXISTING_CUSTOMER', 'LEAD_CONVERSION',
  ]),
  company: businessCompanyEnum.optional(),
  jobType: jobTypeEnum.optional(),
  jobCategory: jobCategoryEnum.optional().nullable(),
  dueDate: z.string().datetime().optional().or(z.literal('')),
  assignedTechnicianId: z.string().uuid().optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  estimatedPrice: z.number().min(0).optional().nullable(),
  addGst: z.boolean().optional(),
  description: z.string().optional(),
  internalNotes: z.string().optional(),
  subTasks: z.array(jobSubTaskSchema).optional(),
});

export const updateJobSchema = jobSchema.partial();

export const jobStatusSchema = z.object({
  status: z.enum([
    'RECEIVED', 'INSPECTION', 'QUOTED', 'AWAITING_APPROVAL', 'APPROVED', 'PARTS_ORDERED',
    'IN_PROGRESS', 'PANEL_BEATING', 'PAINTING', 'QUALITY_CHECK', 'READY_FOR_DELIVERY',
    'COMPLETED', 'INVOICED', 'CLOSED',
  ]),
  notes: z.string().min(1, 'Remark is required for status change'),
});

export const softDeleteJobSchema = z.object({
  remarks: z.string().min(1, 'Remarks are required to delete a job').max(1000),
});

export const createUserSchema = registerSchema;

export const customerLoginSchema = z.object({
  registrationNo: z.string().min(1, 'Vehicle registration number is required'),
});

export const insuranceClaimSchema = z.object({
  insuranceCompany: z.string().min(1),
  claimNumber: z.string().optional(),
  policyNumber: z.string().optional(),
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  assessorName: z.string().optional(),
  approvalStatus: z.enum([
    'PENDING', 'ASSESSMENT_REQUIRED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'COMPLETED',
  ]).optional(),
  approvedAmount: z.number().optional(),
  excessAmount: z.number().optional(),
  notes: z.string().optional(),
});

export const quotationItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  itemType: z.enum(['PART', 'LABOUR', 'PAINT', 'OTHER']).optional(),
});

export const quotationSchema = z.object({
  customerId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  labourCost: z.number().min(0).optional(),
  partsCost: z.number().min(0).optional(),
  paintCost: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  notes: z.string().optional(),
  items: z.array(quotationItemSchema).optional(),
});

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1),
  taskType: jobSubTaskTypeEnum.optional(),
  unitPrice: z.number().min(0),
  quantity: z.number().positive().optional(),
  lineTotal: z.number().min(0),
});

export const invoiceSchema = z.object({
  jobId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  subtotal: z.number().min(0),
  gst: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  total: z.number().min(0),
  dueDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  lineItems: z.array(invoiceLineItemSchema).optional(),
});

export const createInvoiceFromJobSchema = z.object({
  jobId: z.string().uuid(),
  invoiceNumber: z.string().min(1).max(50).optional(),
  discount: z.number().min(0).optional(),
  notes: z.string().optional(),
  includeGst: z.boolean().optional(),
});

export const paymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
  collectionType: z.enum(['ADVANCE', 'SECOND', 'FINAL', 'OTHER']).optional(),
  paidAt: z.string().optional(),
});

export const updateAmountPaidSchema = z.object({
  amountPaid: z.number().min(0),
});

export const expenseSchema = z.object({
  category: z.enum(['LABOUR', 'MATERIAL', 'OTHER']),
  materialType: z.enum(['PAINT', 'PARTS', 'CONSUMABLES', 'OTHER']).optional().nullable(),
  otherType: z.enum([
    'UTILITY', 'RENT', 'SALARY', 'GOOGLE', 'FUEL', 'INTERNET',
    'INSURANCE', 'MARKETING', 'SOFTWARE', 'BANK_FEES', 'OFFICE', 'OTHER',
  ]).optional().nullable(),
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
  expenseDate: z.string().min(1),
  isPayable: z.boolean().optional().default(false),
  paymentMethod: z.string().max(50).optional().nullable(),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
});

export const updateExpenseSchema = expenseSchema.partial();

export const supplierSchema = z.object({
  name: z.string().min(1).max(200),
  contactPerson: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const employeeSchema = z.object({
  name: z.string().min(1).max(200),
  jobTitle: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  notes: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const jobCollectionSchema = z.object({
  jobId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER']),
  collectionType: z.enum(['ADVANCE', 'SECOND', 'FINAL', 'OTHER']).optional(),
  paidAt: z.string().optional(),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
});

export const updateJobCollectionSchema = z.object({
  amount: z.number().positive().optional(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER']).optional(),
  collectionType: z.enum(['ADVANCE', 'SECOND', 'FINAL', 'OTHER']).optional(),
  paidAt: z.string().optional(),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const bulkCollectionSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1),
  amount: z.number().positive(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER']),
  collectionType: z.enum(['ADVANCE', 'SECOND', 'FINAL', 'OTHER']).optional(),
  paidAt: z.string().optional(),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const bulkJobCollectionSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(1),
  amount: z.number().positive(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER']),
  collectionType: z.enum(['ADVANCE', 'SECOND', 'FINAL', 'OTHER']).optional(),
  paidAt: z.string().optional(),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

/** Quick additional income (e.g. part purchase) — creates invoice + payment + collection. */
export const additionalCollectionSchema = z.object({
  customerId: z.string().uuid(),
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
  addGst: z.boolean().optional(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER']),
  collectionType: z.enum(['ADVANCE', 'SECOND', 'FINAL', 'OTHER']).optional(),
  paidAt: z.string().optional(),
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const aiGenerateSchema = z.object({
  type: z.enum([
    'CUSTOMER_MESSAGE', 'WORKSHOP_ASSISTANT', 'INSURANCE_ASSISTANT',
    'SALES_ASSISTANT', 'QUOTATION_GENERATOR',
  ]),
  context: z.string().min(1),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  additionalInfo: z.record(z.unknown()).optional(),
});

export const updateQuotationSchema = z.object({
  labourCost: z.number().min(0).optional(),
  partsCost: z.number().min(0).optional(),
  paintCost: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  notes: z.string().optional(),
  items: z.array(quotationItemSchema).optional(),
});

export const inventoryItemSchema = z.object({
  itemName: z.string().min(1),
  company: businessCompanyEnum.optional(),
  partCategory: partCategoryEnum,
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  description: z.string().optional(),
  costPrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  quantity: z.number().int().min(0).optional(),
});

export const updateInventoryItemSchema = inventoryItemSchema.partial();

export const partSaleSchema = z.object({
  inventoryItemId: z.string().uuid(),
  company: businessCompanyEnum.optional(),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(1),
  phone: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  unitPrice: z.number().min(0).optional(),
  totalPrice: z.number().min(0).optional(),
  status: z.enum(['PENDING', 'SOLD', 'CANCELLED']).optional(),
  notes: z.string().optional(),
});

export const updatePartSaleSchema = partSaleSchema.partial();

export const idParamSchema = z.object({ id: z.string().uuid() });

const jobRegistrationJobSchema = z.object({
  description: z.string().min(1, 'Job description is required'),
  taskType: jobSubTaskTypeEnum.optional(),
  jobType: jobTypeEnum.optional(),
  price: z.number().min(0).optional().nullable(),
});

export const jobRegistrationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required').optional().or(z.literal('')),
  phone: z.string().min(1, 'Phone number is required'),
  address: z.string().optional(),
  registrationNo: z.string().min(1, 'Registration number is required'),
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.number().int().min(1900).max(2100).optional(),
  colour: z.string().max(50).optional().or(z.literal('')),
  jobCategory: jobCategoryEnum,
  company: businessCompanyEnum.optional(),
  jobSource: z.enum([
    'WALK_IN', 'INSURANCE_CLAIM', 'DEALER', 'FLEET', 'TRADE', 'EXISTING_CUSTOMER', 'LEAD_CONVERSION',
  ]).optional(),
  estimatedPrice: z.number().min(0).optional().nullable(),
  addGst: z.boolean().optional(),
  receivedDate: z.string().optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
  /** Link submission to an existing dealer customer (by code or id). */
  dealerCode: z.string().min(1).optional(),
  dealerCustomerId: z.string().uuid().optional(),
  jobs: z.array(jobRegistrationJobSchema).min(1, 'At least one job is required'),
});

export const outVehicleMarkSchema = z.object({
  outDate: z.string().min(1),
  outInvoiceType: z.enum(['TAX', 'CASH']),
  outInvoiceNumber: z.string().max(100).optional().nullable(),
  outNotes: z.string().max(1000).optional().nullable(),
  markCompleted: z.boolean().optional(),
});

export const outVehicleUpdateSchema = outVehicleMarkSchema.partial().extend({
  clearOut: z.boolean().optional(),
});

export const attendancePunchSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const attendanceClockOutSchema = attendancePunchSchema.extend({
  reason: z.enum(['BREAK', 'END_OF_DAY']),
});

export const attendanceReportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  userId: z.string().uuid().optional(),
});
