import prisma from '../utils/prisma';
import { softDeleteFilter } from '../utils/helpers';
import { AppError } from '../utils/response';

const dealerPublicSelect = {
  id: true,
  customerCode: true,
  name: true,
  companyName: true,
  contactPerson: true,
  phone: true,
  email: true,
  address: true,
} as const;

function displayName(dealer: { name: string; companyName: string | null }) {
  return dealer.companyName?.trim() || dealer.name;
}

export class PublicDealerService {
  async list() {
    const dealers = await prisma.customer.findMany({
      where: { customerType: 'DEALER', ...softDeleteFilter() },
      select: dealerPublicSelect,
      orderBy: [{ companyName: 'asc' }, { name: 'asc' }],
    });

    return dealers.map((d) => ({
      ...d,
      displayName: displayName(d),
    }));
  }

  async getByCode(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!normalized) throw new AppError(400, 'Dealer code is required', 'INVALID_DEALER_CODE');

    const dealer = await prisma.customer.findFirst({
      where: {
        customerCode: { equals: normalized, mode: 'insensitive' },
        customerType: 'DEALER',
        ...softDeleteFilter(),
      },
      select: dealerPublicSelect,
    });

    if (!dealer) throw new AppError(404, 'Dealer not found', 'DEALER_NOT_FOUND');

    return {
      ...dealer,
      displayName: displayName(dealer),
    };
  }
}

export const publicDealerService = new PublicDealerService();
