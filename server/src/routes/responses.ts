import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { responseService } from '../services/ResponseService';
import { NotFoundError } from '../errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const answerItemSchema = z
  .object({
    questionId: z.string().uuid(),
    optionIds: z.array(z.string().uuid()).min(1).optional(),
    rating: z.number().optional(),
  })
  .strict();

export const submitResponseSchema = z
  .object({
    answers: z.array(answerItemSchema).max(30),
  })
  .strict();

export const responsesRouter = Router();

// POST /api/v1/surveys/:id/responses (FR-03)
responsesRouter.post(
  '/surveys/:id/responses',
  authenticate,
  requireRole('RESPONDENT'),
  validate(submitResponseSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        throw new NotFoundError('Survey not found.');
      }

      // Allow injecting test answer writer hook via app.locals for rollback testing
      const testAnswerWriter = (req.app.locals as any).testAnswerWriter;
      const result = await responseService.submitResponse(
        id,
        req.user!.id,
        req.body,
        testAnswerWriter
      );

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/responses/:responseId (FR-09)
const handleGetResponseById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { responseId } = req.params;
    if (!UUID_REGEX.test(responseId)) {
      throw new NotFoundError('Submission not found.');
    }

    const result = await responseService.getResponseById(responseId, req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

responsesRouter.get('/responses/:responseId', authenticate, requireRole('RESPONDENT'), handleGetResponseById);

