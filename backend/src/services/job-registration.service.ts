import prisma from '../utils/prisma';
import { generateCode, softDeleteFilter } from '../utils/helpers';
import { AppError } from '../utils/response';
import {
  BusinessCompany, CustomerType, JobCategory, JobSource, JobType,
} from '@prisma/client';
import { mapJobTypeToSubTaskType, sumSubTaskPrices } from '../utils/job-subtasks';

type RegistrationJobInput = {
  description: string;
  taskType?: string;
  jobType?: JobType;
  price?: number | null;
};

type RegistrationInput = {
  name: string;
  email?: string;
  phone: string;
  address?: string;
  registrationNo: string;
  make: string;
  model: string;
  year?: number;
  colour?: string;
  jobCategory: JobCategory;
  company?: BusinessCompany;
  jobSource?: JobSource;
  estimatedPrice?: number | null;
  receivedDate?: string;
  dueDate?: string;
  addGst?: boolean;
  dealerCode?: string;
  dealerCustomerId?: string;
  jobs: RegistrationJobInput[];
};

function mapCategoryToCustomerType(category: JobCategory): CustomerType {
  switch (category) {
    case 'DEALER': return 'DEALER';
    case 'BUSINESS': return 'BUSINESS';
    default: return 'WALK_IN';
  }
}

function parseOptionalDate(value?: string, label = 'date') {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  const date = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, `Invalid ${label}`, 'INVALID_DATE');
  }
  return date;
}

export class JobRegistrationService {
  async submit(data: RegistrationInput) {
    const company = data.company || 'CEYLON_AUTOMOBILE';
    const linkedDealer = Boolean(data.dealerCode?.trim() || data.dealerCustomerId?.trim());
    const jobCategory: JobCategory = linkedDealer ? 'DEALER' : data.jobCategory;
    const customerType = mapCategoryToCustomerType(jobCategory);
    const registrationNo = data.registrationNo.trim().toUpperCase();
    const email = data.email?.trim().toLowerCase() || undefined;
    const colour = data.colour?.trim() || undefined;
    const subTasks = data.jobs.map((jobInput) => ({
      taskType: (jobInput.taskType as never) || mapJobTypeToSubTaskType(jobInput.jobType),
      description: jobInput.description.trim(),
      price: jobInput.price ?? null,
    }));
    const subTaskTotal = sumSubTaskPrices(subTasks);
    const estimatedPrice = data.estimatedPrice ?? subTaskTotal ?? undefined;
    const primaryJobType = data.jobs[0]?.jobType || 'OTHER';
    const combinedDescription = data.jobs.map((j, i) => `Job ${i + 1}: ${j.description.trim()}`).join('\n');
    const receivedDate = parseOptionalDate(data.receivedDate, 'job received date');
    const dueDate = parseOptionalDate(data.dueDate, 'expected delivery date');
    const jobSource: JobSource = data.jobSource
      || (jobCategory === 'DEALER' ? 'DEALER' : 'WALK_IN');

    const created = await prisma.$transaction(async (tx) => {
      let customer = null as Awaited<ReturnType<typeof tx.customer.findFirst>>;

      if (data.dealerCustomerId?.trim()) {
        customer = await tx.customer.findFirst({
          where: {
            id: data.dealerCustomerId.trim(),
            customerType: 'DEALER',
            ...softDeleteFilter(),
          },
        });
        if (!customer) throw new AppError(404, 'Dealer not found', 'DEALER_NOT_FOUND');
      } else if (data.dealerCode?.trim()) {
        customer = await tx.customer.findFirst({
          where: {
            customerCode: { equals: data.dealerCode.trim(), mode: 'insensitive' },
            customerType: 'DEALER',
            ...softDeleteFilter(),
          },
        });
        if (!customer) throw new AppError(404, 'Dealer not found', 'DEALER_NOT_FOUND');
      } else {
        customer = email
          ? await tx.customer.findFirst({ where: { email, ...softDeleteFilter() } })
          : null;

        if (!customer && data.phone.trim()) {
          customer = await tx.customer.findFirst({
            where: { phone: data.phone.trim(), ...softDeleteFilter() },
            orderBy: { createdAt: 'desc' },
          });
        }
      }

      if (customer && linkedDealer) {
        // Keep existing dealer identity; only fill missing contact fields from the form.
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            phone: customer.phone || data.phone.trim(),
            email: customer.email || email,
            address: customer.address || data.address?.trim() || undefined,
            customerType: 'DEALER',
            source: customer.source || 'Online Registration Form',
          },
        });
      } else if (customer) {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            name: data.name.trim(),
            phone: data.phone.trim(),
            email: email || customer.email,
            address: data.address?.trim() || customer.address,
            customerType,
            source: customer.source || 'Online Registration Form',
          },
        });
      } else {
        customer = await tx.customer.create({
          data: {
            customerCode: generateCode('CU'),
            name: data.name.trim(),
            email,
            phone: data.phone.trim(),
            address: data.address?.trim(),
            customerType,
            company,
            source: 'Online Registration Form',
          },
        });
      }

      let vehicle = await tx.vehicle.findFirst({
        where: { registrationNo, ...softDeleteFilter() },
      });

      if (vehicle) {
        if (vehicle.ownerId !== customer.id) {
          throw new AppError(
            409,
            'This registration number is already linked to another customer. Please contact the workshop.',
            'VEHICLE_OWNER_MISMATCH',
          );
        }
        vehicle = await tx.vehicle.update({
          where: { id: vehicle.id },
          data: {
            make: data.make.trim(),
            model: data.model.trim(),
            year: data.year,
            colour: colour || vehicle.colour,
          },
        });
      } else {
        vehicle = await tx.vehicle.create({
          data: {
            vehicleCode: generateCode('VH'),
            registrationNo,
            make: data.make.trim(),
            model: data.model.trim(),
            year: data.year,
            colour,
            ownerId: customer.id,
          },
        });
      }

      const job = await tx.job.create({
        data: {
          jobNumber: generateCode('JB'),
          customerId: customer.id,
          vehicleId: vehicle.id,
          jobSource,
          company,
          jobType: primaryJobType,
          jobCategory,
          ...(receivedDate ? { receivedDate } : {}),
          dueDate,
          estimatedPrice,
          addGst: data.addGst ?? false,
          description: combinedDescription,
          internalNotes: linkedDealer
            ? 'Submitted via online job registration form (dealer link)'
            : 'Submitted via online job registration form',
        },
      });

      await tx.jobSubTask.createMany({
        data: subTasks.map((task, index) => ({
          jobId: job.id,
          taskType: task.taskType,
          description: task.description,
          price: task.price ?? undefined,
          sortOrder: index,
        })),
      });

      await tx.jobStatusHistory.create({
        data: {
          jobId: job.id,
          toStatus: 'RECEIVED',
          notes: 'Job submitted via online registration form',
        },
      });

      return {
        notify: {
          jobNumber: job.jobNumber,
          estimatedPrice: job.estimatedPrice,
          addGst: job.addGst,
          jobCategory: job.jobCategory,
          jobSource: job.jobSource,
          customerName: customer.name,
          registrationNo: vehicle.registrationNo,
          subTasks,
        },
        result: {
          customer: {
            id: customer.id,
            customerCode: customer.customerCode,
            name: customer.name,
          },
          vehicle: {
            id: vehicle.id,
            registrationNo: vehicle.registrationNo,
            make: vehicle.make,
            model: vehicle.model,
            colour: vehicle.colour,
          },
          jobs: [{
            id: job.id,
            jobNumber: job.jobNumber,
            description: job.description,
            receivedDate: job.receivedDate,
          }],
        },
      };
    });

    const { whatsappService } = await import('./whatsapp.service');
    whatsappService.notifyJobCreated({
      jobNumber: created.notify.jobNumber,
      estimatedPrice: created.notify.estimatedPrice,
      addGst: created.notify.addGst,
      jobCategory: created.notify.jobCategory,
      jobSource: created.notify.jobSource,
      customer: { name: created.notify.customerName },
      vehicle: { registrationNo: created.notify.registrationNo },
      subTasks: created.notify.subTasks,
    });

    return created.result;
  }
}

export const jobRegistrationService = new JobRegistrationService();
