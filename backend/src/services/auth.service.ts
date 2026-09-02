import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { config } from '../utils/config';
import { AppError } from '../utils/response';
import { AuthPayload } from '../middlewares/auth.middleware';
import {
  ALL_PAGE_KEYS,
  APP_PAGES,
  SUPER_ADMIN_ROLE,
  resolveEffectivePages,
  sanitizePageKeys,
} from '../utils/pages';

function toUserDto(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  allowedPages: unknown;
  isActive?: boolean;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  role: { name: string; permissions: unknown };
}) {
  const pages = resolveEffectivePages(user.role.name, user.role.permissions, user.allowedPages);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role.name,
    pages,
    allowedPages: user.allowedPages === null || user.allowedPages === undefined
      ? null
      : sanitizePageKeys(user.allowedPages),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export class AuthService {
  listPages() {
    return APP_PAGES.map(({ key, path, label }) => ({ key, path, label }));
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const pages = resolveEffectivePages(user.role.name, user.role.permissions, user.allowedPages);

    const tokens = await this.generateTokens({
      authType: 'staff',
      userId: user.id,
      email: user.email,
      role: user.role.name,
      pages,
    });

    return {
      user: toUserDto(user),
      ...tokens,
    };
  }

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    roleId: string;
    allowedPages?: string[] | null;
  }) {
    return this.createUser(data);
  }

  async refresh(refreshToken: string) {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { role: true } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    if (!stored.user.isActive || stored.user.deletedAt) {
      throw new AppError(401, 'User inactive', 'USER_INACTIVE');
    }

    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const pages = resolveEffectivePages(
      stored.user.role.name,
      stored.user.role.permissions,
      stored.user.allowedPages,
    );

    return this.generateTokens({
      authType: 'staff',
      userId: stored.user.id,
      email: stored.user.email,
      role: stored.user.role.name,
      pages,
    });
  }

  async logout(refreshToken: string) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { role: true },
    });
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    return toUserDto(user);
  }

  private async generateTokens(payload: AuthPayload) {
    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpiry as jwt.SignOptions['expiresIn'],
    });

    const refreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: payload.userId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  async listUsers() {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        allowedPages: true,
        role: { select: { id: true, name: true, permissions: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      isActive: u.isActive,
      role: { id: u.role.id, name: u.role.name },
      pages: resolveEffectivePages(u.role.name, u.role.permissions, u.allowedPages),
      allowedPages: u.allowedPages === null || u.allowedPages === undefined
        ? null
        : sanitizePageKeys(u.allowedPages),
      createdAt: u.createdAt,
    }));
  }

  async createUser(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    roleId: string;
    allowedPages?: string[] | null;
  }, createdById?: string) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');
    }

    const role = await prisma.role.findFirst({ where: { id: data.roleId, deletedAt: null } });
    if (!role) {
      throw new AppError(400, 'Invalid role', 'INVALID_ROLE');
    }

    if (role.name === SUPER_ADMIN_ROLE && createdById) {
      const creator = await prisma.user.findUnique({
        where: { id: createdById },
        include: { role: true },
      });
      if (creator?.role.name !== SUPER_ADMIN_ROLE) {
        throw new AppError(403, 'Only Super Admin can create Super Admin users', 'FORBIDDEN');
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const createData: Prisma.UserCreateInput = {
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      role: { connect: { id: data.roleId } },
      createdById,
    };

    if (data.allowedPages !== undefined) {
      createData.allowedPages =
        data.allowedPages === null
          ? Prisma.DbNull
          : sanitizePageKeys(data.allowedPages);
    }

    const user = await prisma.user.create({
      data: createData,
      include: { role: true },
    });

    return toUserDto(user);
  }

  async updateUser(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      roleId?: string;
      isActive?: boolean;
      allowedPages?: string[] | null;
      password?: string;
    },
    updatedById?: string,
  ) {
    const existing = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { role: true },
    });
    if (!existing) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }

    if (data.roleId) {
      const role = await prisma.role.findFirst({ where: { id: data.roleId, deletedAt: null } });
      if (!role) {
        throw new AppError(400, 'Invalid role', 'INVALID_ROLE');
      }
      if (role.name === SUPER_ADMIN_ROLE && updatedById) {
        const updater = await prisma.user.findUnique({
          where: { id: updatedById },
          include: { role: true },
        });
        if (updater?.role.name !== SUPER_ADMIN_ROLE) {
          throw new AppError(403, 'Only Super Admin can assign Super Admin role', 'FORBIDDEN');
        }
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      isActive: data.isActive,
      updatedById,
    };

    if (data.roleId) {
      updateData.role = { connect: { id: data.roleId } };
    }

    if (data.allowedPages !== undefined) {
      updateData.allowedPages =
        data.allowedPages === null
          ? Prisma.DbNull
          : sanitizePageKeys(data.allowedPages);
    }

    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { role: true },
    });

    return toUserDto(user);
  }

  async listRoles() {
    return prisma.role.findMany({
      where: { deletedAt: null, name: { not: SUPER_ADMIN_ROLE } },
      orderBy: { name: 'asc' },
    });
  }

  async listRolesForAdmin() {
    const roles = await prisma.role.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.name === SUPER_ADMIN_ROLE
        ? [...ALL_PAGE_KEYS]
        : sanitizePageKeys(role.permissions),
      userCount: role._count.users,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  }

  async createRole(data: {
    name: string;
    description?: string;
    permissions: string[];
  }) {
    const name = data.name.trim().toUpperCase().replace(/\s+/g, '_');
    if (!name) {
      throw new AppError(400, 'Role name is required', 'INVALID_ROLE_NAME');
    }
    if (name === SUPER_ADMIN_ROLE) {
      throw new AppError(400, 'Cannot create another Super Admin role', 'INVALID_ROLE_NAME');
    }

    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing && !existing.deletedAt) {
      throw new AppError(409, 'Role name already exists', 'ROLE_EXISTS');
    }

    const permissions = sanitizePageKeys(data.permissions);
    if (existing?.deletedAt) {
      return prisma.role.update({
        where: { id: existing.id },
        data: {
          description: data.description,
          permissions,
          deletedAt: null,
        },
      });
    }

    return prisma.role.create({
      data: {
        name,
        description: data.description,
        permissions,
      },
    });
  }

  async updateRole(
    roleId: string,
    data: { name?: string; description?: string | null; permissions?: string[] },
  ) {
    const role = await prisma.role.findFirst({ where: { id: roleId, deletedAt: null } });
    if (!role) {
      throw new AppError(404, 'Role not found', 'NOT_FOUND');
    }

    if (role.name === SUPER_ADMIN_ROLE) {
      // Super Admin always has all pages; allow description update only
      return prisma.role.update({
        where: { id: roleId },
        data: {
          description: data.description === undefined ? undefined : data.description,
          permissions: [...ALL_PAGE_KEYS],
        },
      });
    }

    let name = role.name;
    if (data.name !== undefined) {
      name = data.name.trim().toUpperCase().replace(/\s+/g, '_');
      if (!name) {
        throw new AppError(400, 'Role name is required', 'INVALID_ROLE_NAME');
      }
      if (name === SUPER_ADMIN_ROLE) {
        throw new AppError(400, 'Cannot rename role to Super Admin', 'INVALID_ROLE_NAME');
      }
      const clash = await prisma.role.findFirst({
        where: { name, id: { not: roleId }, deletedAt: null },
      });
      if (clash) {
        throw new AppError(409, 'Role name already exists', 'ROLE_EXISTS');
      }
    }

    return prisma.role.update({
      where: { id: roleId },
      data: {
        name,
        description: data.description === undefined ? undefined : data.description,
        permissions: data.permissions === undefined
          ? undefined
          : sanitizePageKeys(data.permissions),
      },
    });
  }

  async deleteRole(roleId: string) {
    const role = await prisma.role.findFirst({ where: { id: roleId, deletedAt: null } });
    if (!role) {
      throw new AppError(404, 'Role not found', 'NOT_FOUND');
    }
    if (role.name === SUPER_ADMIN_ROLE) {
      throw new AppError(400, 'Cannot delete Super Admin role', 'FORBIDDEN');
    }

    const userCount = await prisma.user.count({
      where: { roleId, deletedAt: null },
    });
    if (userCount > 0) {
      throw new AppError(400, 'Reassign users before deleting this role', 'ROLE_IN_USE');
    }

    await prisma.role.update({
      where: { id: roleId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Role deleted' };
  }
}

export const authService = new AuthService();
