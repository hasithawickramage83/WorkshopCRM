import { Request, Response } from 'express';
import { sendSuccess, asyncHandler } from '../utils/response';
import { jobRegistrationService } from '../services/job-registration.service';
import { publicDealerService } from '../services/public-dealer.service';

export const publicController = {
  submitJobRegistration: asyncHandler(async (req: Request, res: Response) => {
    const result = await jobRegistrationService.submit(req.body);
    sendSuccess(res, result, 201);
  }),

  listDealers: asyncHandler(async (_req: Request, res: Response) => {
    const dealers = await publicDealerService.list();
    sendSuccess(res, { dealers });
  }),

  getDealer: asyncHandler(async (req: Request, res: Response) => {
    const dealer = await publicDealerService.getByCode(String(req.params.code || ''));
    sendSuccess(res, { dealer });
  }),
};
