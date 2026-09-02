import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendSuccess, asyncHandler } from '../utils/response';
import { authService } from '../services/auth.service';
import { customerPortalService } from '../services/customer-portal.service';

export const authController = {
  login: asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await authService.login(req.body.email, req.body.password);
    sendSuccess(res, result);
  }),

  register: asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await authService.register(req.body);
    sendSuccess(res, result, 201);
  }),

  createUser: asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await authService.createUser(req.body, req.user!.userId);
    sendSuccess(res, user, 201);
  }),

  updateUser: asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await authService.updateUser(req.params.id as string, req.body, req.user!.userId);
    sendSuccess(res, user);
  }),

  refresh: asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await authService.refresh(req.body.refreshToken);
    sendSuccess(res, result);
  }),

  logout: asyncHandler(async (req: AuthRequest, res: Response) => {
    await authService.logout(req.body.refreshToken);
    sendSuccess(res, { message: 'Logged out successfully' });
  }),

  profile: asyncHandler(async (req: AuthRequest, res: Response) => {
    const profile = await authService.getProfile(req.user!.userId);
    sendSuccess(res, profile);
  }),

  listUsers: asyncHandler(async (_req: AuthRequest, res: Response) => {
    const users = await authService.listUsers();
    sendSuccess(res, users);
  }),

  listRoles: asyncHandler(async (req: AuthRequest, res: Response) => {
    // Users & Roles managers need full role details including page permissions
    const profile = req.user ? await authService.getProfile(req.user.userId) : null;
    const canManageUsers =
      profile?.role === 'SUPER_ADMIN' || (profile?.pages || []).includes('users');
    const roles = canManageUsers
      ? await authService.listRolesForAdmin()
      : await authService.listRoles();
    sendSuccess(res, roles);
  }),

  listPages: asyncHandler(async (_req: AuthRequest, res: Response) => {
    sendSuccess(res, authService.listPages());
  }),

  createRole: asyncHandler(async (req: AuthRequest, res: Response) => {
    const role = await authService.createRole(req.body);
    sendSuccess(res, role, 201);
  }),

  updateRole: asyncHandler(async (req: AuthRequest, res: Response) => {
    const role = await authService.updateRole(req.params.id as string, req.body);
    sendSuccess(res, role);
  }),

  deleteRole: asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await authService.deleteRole(req.params.id as string);
    sendSuccess(res, result);
  }),
};

export const customerPortalController = {
  login: asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await customerPortalService.login(req.body.registrationNo);
    sendSuccess(res, result);
  }),

  profile: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await customerPortalService.getProfile(req.customer!.customerId));
  }),

  vehicle: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await customerPortalService.getVehicle(req.customer!.vehicleId, req.customer!.customerId));
  }),

  jobs: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await customerPortalService.getJobs(req.customer!.customerId, req.customer!.vehicleId));
  }),

  jobDetail: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await customerPortalService.getJobDetail(
      req.params.id as string,
      req.customer!.customerId,
      req.customer!.vehicleId
    ));
  }),

  invoices: asyncHandler(async (req: AuthRequest, res: Response) => {
    sendSuccess(res, await customerPortalService.getInvoices(req.customer!.customerId));
  }),
};
