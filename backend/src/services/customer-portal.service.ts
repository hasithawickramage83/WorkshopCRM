import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { config } from '../utils/config';
import { AppError } from '../utils/response';
import { softDeleteFilter } from '../utils/helpers';
import { CustomerAuthPayload } from '../middlewares/auth.middleware';

export class CustomerPortalService {
  async login(registrationNo: string) {
    const normalized = registrationNo.trim().toUpperCase();
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        ...softDeleteFilter(),
        registrationNo: { equals: normalized, mode: 'insensitive' },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            companyName: true,
            phone: true,
            email: true,
            address: true,
            customerType: true,
            customerCode: true,
          },
        },
      },
    });

    if (!vehicle) {
      throw new AppError(404, 'Vehicle not found. Check your registration number.', 'VEHICLE_NOT_FOUND');
    }

    const payload: CustomerAuthPayload = {
      authType: 'customer',
      customerId: vehicle.ownerId,
      vehicleId: vehicle.id,
      registrationNo: vehicle.registrationNo,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, { expiresIn: '7d' });

    return {
      accessToken,
      customer: vehicle.owner,
      vehicle: {
        id: vehicle.id,
        registrationNo: vehicle.registrationNo,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        colour: vehicle.colour,
      },
    };
  }

  async getProfile(customerId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, ...softDeleteFilter() },
      select: {
        id: true,
        customerCode: true,
        name: true,
        companyName: true,
        contactPerson: true,
        phone: true,
        email: true,
        address: true,
        customerType: true,
        createdAt: true,
      },
    });
    if (!customer) throw new AppError(404, 'Customer not found', 'NOT_FOUND');
    return customer;
  }

  async getVehicle(vehicleId: string, customerId: string) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, ownerId: customerId, ...softDeleteFilter() },
      select: {
        id: true,
        registrationNo: true,
        make: true,
        model: true,
        year: true,
        colour: true,
        vin: true,
      },
    });
    if (!vehicle) throw new AppError(404, 'Vehicle not found', 'NOT_FOUND');
    return vehicle;
  }

  async getJobs(customerId: string, vehicleId: string) {
    return prisma.job.findMany({
      where: { customerId, vehicleId, ...softDeleteFilter() },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        jobNumber: true,
        status: true,
        description: true,
        receivedDate: true,
        dueDate: true,
        jobSource: true,
        vehicle: { select: { registrationNo: true, make: true, model: true } },
      },
    });
  }

  async getJobDetail(jobId: string, customerId: string, vehicleId: string) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, customerId, vehicleId, ...softDeleteFilter() },
      select: {
        id: true,
        jobNumber: true,
        status: true,
        description: true,
        receivedDate: true,
        dueDate: true,
        jobSource: true,
        vehicle: { select: { registrationNo: true, make: true, model: true, colour: true } },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            notes: true,
            createdAt: true,
            changedBy: { select: { firstName: true, lastName: true } },
          },
        },
        quotations: {
          where: softDeleteFilter(),
          select: {
            quotationNumber: true,
            totalAmount: true,
            status: true,
            validUntil: true,
            createdAt: true,
          },
        },
      },
    });
    if (!job) throw new AppError(404, 'Job not found', 'NOT_FOUND');
    return job;
  }

  async getInvoices(customerId: string) {
    return prisma.invoice.findMany({
      where: { customerId, ...softDeleteFilter() },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        subtotal: true,
        gst: true,
        discount: true,
        total: true,
        amountPaid: true,
        paymentStatus: true,
        dueDate: true,
        createdAt: true,
        job: { select: { jobNumber: true } },
      },
    });
  }
}

export const customerPortalService = new CustomerPortalService();
