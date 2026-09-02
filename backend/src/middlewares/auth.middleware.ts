import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../utils/config';
import { AppError } from '../utils/response';
import prisma from '../utils/prisma';
import { PageKey, SUPER_ADMIN_ROLE, hasPageAccess, resolveEffectivePages } from '../utils/pages';

export interface AuthPayload {
  authType: 'staff';
  userId: string;
  email: string;
  role: string;
  pages?: string[];
}

export interface CustomerAuthPayload {
  authType: 'customer';
  customerId: string;
  vehicleId: string;
  registrationNo: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
  customer?: CustomerAuthPayload;
}

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload | CustomerAuthPayload;
    if ('authType' in payload && payload.authType === 'customer') {
      return next(new AppError(401, 'Staff authentication required', 'UNAUTHORIZED'));
    }
    const staff = payload as AuthPayload;
    req.user = {
      authType: 'staff',
      userId: staff.userId,
      email: staff.email,
      role: staff.role,
      pages: staff.pages,
    };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN'));
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(new AppError(403, 'Insufficient permissions', 'FORBIDDEN'));
    }
    next();
  };
}

/** Require the user to have access to a CRM page (or be Super Admin). Always resolves from DB. */
export function requirePage(...pageKeys: PageKey[]) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
    }

    const user = await prisma.user.findFirst({
      where: { id: req.user.userId, isActive: true, deletedAt: null },
      include: { role: true },
    });
    if (!user) {
      return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
    }

    const pages = resolveEffectivePages(user.role.name, user.role.permissions, user.allowedPages);
    req.user.pages = pages;
    req.user.role = user.role.name;

    if (user.role.name === SUPER_ADMIN_ROLE) {
      return next();
    }

    const allowed = pageKeys.some((key) => hasPageAccess(pages, key));
    if (!allowed) {
      return next(new AppError(403, 'You do not have access to this page', 'FORBIDDEN'));
    }
    next();
  };
}

export async function attachUser(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
    const user = await prisma.user.findFirst({
      where: { id: payload.userId, isActive: true, deletedAt: null },
      include: { role: true },
    });
    if (user) {
      const pages = resolveEffectivePages(user.role.name, user.role.permissions, user.allowedPages);
      req.user = {
        authType: 'staff',
        userId: user.id,
        email: user.email,
        role: user.role.name,
        pages,
      };
    }
  } catch {
    // optional auth — ignore invalid token
  }
  next();
}

export function authenticateCustomer(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as CustomerAuthPayload;
    if (payload.authType !== 'customer') {
      return next(new AppError(401, 'Customer authentication required', 'UNAUTHORIZED'));
    }
    req.customer = payload;
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN'));
  }
}
