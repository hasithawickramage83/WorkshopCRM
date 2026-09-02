import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ALL_PAGES = [
  'dashboard', 'customers', 'suppliers', 'employees', 'vehicles', 'leads', 'jobs', 'register', 'out-vehicles',
  'inventory', 'parts-sales', 'insurance', 'quotations', 'invoices', 'finance',
  'ai', 'reports', 'attendance', 'whatsapp', 'users',
];

const roles: { name: string; description: string; permissions: string[] }[] = [
  {
    name: 'SUPER_ADMIN',
    description: 'Full system control — access to every page',
    permissions: ALL_PAGES,
  },
  {
    name: 'MANAGER',
    description: 'Jobs, quotations, reports and operations',
    permissions: [
      'dashboard', 'customers', 'suppliers', 'employees', 'vehicles', 'leads', 'jobs', 'register', 'out-vehicles',
      'inventory', 'parts-sales', 'insurance', 'quotations', 'invoices', 'finance',
      'ai', 'reports', 'whatsapp',
    ],
  },
  {
    name: 'RECEPTIONIST',
    description: 'Customers, jobs and quotations',
    permissions: [
      'dashboard', 'customers', 'vehicles', 'jobs', 'register', 'out-vehicles', 'quotations', 'invoices',
    ],
  },
  {
    name: 'SALES_AGENT',
    description: 'Leads and customer communication',
    permissions: ['dashboard', 'customers', 'leads', 'quotations', 'ai'],
  },
  {
    name: 'TECHNICIAN',
    description: 'Job updates and attendance',
    permissions: ['dashboard', 'jobs', 'attendance'],
  },
  {
    name: 'ASSESSOR',
    description: 'Insurance claim assessment',
    permissions: ['dashboard', 'customers', 'vehicles', 'jobs', 'insurance', 'ai', 'attendance'],
  },
];

async function main() {
  console.log('Seeding database...');

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, permissions: role.permissions },
      create: { name: role.name, description: role.description, permissions: role.permissions },
    });
  }

  const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
  const managerRole = await prisma.role.findUnique({ where: { name: 'MANAGER' } });
  const receptionistRole = await prisma.role.findUnique({ where: { name: 'RECEPTIONIST' } });
  const salesRole = await prisma.role.findUnique({ where: { name: 'SALES_AGENT' } });
  const techRole = await prisma.role.findUnique({ where: { name: 'TECHNICIAN' } });

  const passwordHash = await bcrypt.hash('Admin@123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@ceylonautomobile.co.nz' },
    update: {},
    create: {
      email: 'admin@ceylonautomobile.co.nz',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      phone: '+64 21 000 0001',
      roleId: superAdminRole!.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'manager@ceylonautomobile.co.nz' },
    update: {},
    create: {
      email: 'manager@ceylonautomobile.co.nz',
      passwordHash: await bcrypt.hash('Manager@123', 12),
      firstName: 'Workshop',
      lastName: 'Manager',
      phone: '+64 21 000 0002',
      roleId: managerRole!.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'reception@ceylonautomobile.co.nz' },
    update: {},
    create: {
      email: 'reception@ceylonautomobile.co.nz',
      passwordHash: await bcrypt.hash('Reception@123', 12),
      firstName: 'Front',
      lastName: 'Desk',
      phone: '+64 21 000 0003',
      roleId: receptionistRole!.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'sales@ceylonautomobile.co.nz' },
    update: {},
    create: {
      email: 'sales@ceylonautomobile.co.nz',
      passwordHash: await bcrypt.hash('Sales@123', 12),
      firstName: 'Sales',
      lastName: 'Agent',
      phone: '+64 21 000 0004',
      roleId: salesRole!.id,
    },
  });

  const tech = await prisma.user.upsert({
    where: { email: 'tech@ceylonautomobile.co.nz' },
    update: {},
    create: {
      email: 'tech@ceylonautomobile.co.nz',
      passwordHash: await bcrypt.hash('Tech@123', 12),
      firstName: 'John',
      lastName: 'Technician',
      phone: '+64 21 000 0005',
      roleId: techRole!.id,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { customerCode: 'CU2506210001' },
    update: {},
    create: {
      customerCode: 'CU2506210001',
      name: 'James Wilson',
      phone: '+64 21 123 4567',
      email: 'james.wilson@email.com',
      address: '123 Queen Street, Auckland',
      customerType: 'WALK_IN',
      source: 'Walk-in',
      createdById: admin.id,
    },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { vehicleCode: 'VH2506210001' },
    update: {},
    create: {
      vehicleCode: 'VH2506210001',
      registrationNo: 'ABC123',
      make: 'Toyota',
      model: 'Aqua',
      year: 2018,
      colour: 'Silver',
      ownerId: customer.id,
      createdById: admin.id,
    },
  });

  const job = await prisma.job.upsert({
    where: { jobNumber: 'JB2506210001' },
    update: {},
    create: {
      jobNumber: 'JB2506210001',
      customerId: customer.id,
      vehicleId: vehicle.id,
      jobSource: 'WALK_IN',
      status: 'INSPECTION',
      description: 'Front bumper cracked, left headlight broken',
      assignedTechnicianId: tech.id,
      createdById: admin.id,
    },
  });

  await prisma.jobStatusHistory.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      jobId: job.id,
      toStatus: 'RECEIVED',
      notes: 'Job created',
      changedById: admin.id,
    },
  });

  await prisma.lead.upsert({
    where: { leadCode: 'LD2506210001' },
    update: {},
    create: {
      leadCode: 'LD2506210001',
      customerName: 'Sarah Thompson',
      phone: '+64 21 987 6543',
      email: 'sarah.t@email.com',
      source: 'WEBSITE',
      status: 'NEW',
      notes: 'Interested in panel beating for BMW 320i',
      createdById: admin.id,
    },
  });

  console.log('Seed completed successfully!');
  console.log('Default login: admin@ceylonautomobile.co.nz / Admin@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
