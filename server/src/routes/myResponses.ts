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

export const myResponsesRouter = Router();

// GET /api/v1/my-responses (FR-09)
const handleListMyResponses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize } = req.query as any;
    const result = await responseService.listMyResponses(req.user!.id, { page, pageSize });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

myResponsesRouter.get(
  '/my-responses',
  authenticate,
  requireRole('RESPONDENT'),
  validate(paginationSchema, 'query'),
  handleListMyResponses
);

// GET /api/v1/surveys/:id/my-response (FR-09)
const handleGetMyResponse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundError('Submission not found.');
    }

    const result = await responseService.getMyResponse(id, req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

myResponsesRouter.get('/surveys/:id/my-response', authenticate, requireRole('RESPONDENT'), handleGetMyResponse);

