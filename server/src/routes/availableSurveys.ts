import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { responseService } from '../services/ResponseService';
import { NotFoundError } from '../errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const availableSurveysRouter = Router();

availableSurveysRouter.use(authenticate, requireRole('RESPONDENT'));

// GET /api/v1/available-surveys (FR-08)
availableSurveysRouter.get(
  '/',
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = req.query as any;
      const result = await responseService.browseAvailable(req.user!.id, { page, pageSize });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/available-surveys/:id (FR-03, FR-08)
availableSurveysRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        throw new NotFoundError('Survey not found.');
      }

      const result = await responseService.getSurveyForm(id, req.user!.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);
