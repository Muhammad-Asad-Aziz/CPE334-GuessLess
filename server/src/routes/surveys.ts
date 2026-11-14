import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { NotFoundError } from '../errors';
import {
  createSurveySchema,
  emptyBodySchema,
  listSurveysQuerySchema,
  uuidParamSchema,
  type ListSurveysQuery,
} from '../schemas/surveySchema';
import { SurveyService } from '../services/SurveyService';

export const surveysRouter = Router();

surveysRouter.use(authenticate, requireRole('SURVEY_OWNER'));

function validateSurveyIdParam(req: Request, _res: Response, next: NextFunction) {
  const parsed = uuidParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return next(new NotFoundError('Survey not found.'));
  }
  next();
}

// POST /api/v1/surveys
surveysRouter.post(
  '/',
  validate(createSurveySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const survey = await SurveyService.create(req.user!.id, req.body);
      return res.status(201).json({ data: survey });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/surveys
surveysRouter.get(
  '/',
  validate(listSurveysQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = req.query as unknown as ListSurveysQuery;
      const result = await SurveyService.list(req.user!.id, page, pageSize);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/surveys/:id
surveysRouter.get(
  '/:id',
  validateSurveyIdParam,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const survey = await SurveyService.getById(req.user!.id, req.params.id);
      return res.status(200).json({ data: survey });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/surveys/:id/publish
surveysRouter.post(
  '/:id/publish',
  validateSurveyIdParam,
  validate(emptyBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const survey = await SurveyService.publish(req.user!.id, req.params.id);
      return res.status(200).json({ data: survey });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/surveys/:id/close
surveysRouter.post(
  '/:id/close',
  validateSurveyIdParam,
  validate(emptyBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const survey = await SurveyService.close(req.user!.id, req.params.id);
      return res.status(200).json({ data: survey });
    } catch (err) {
      next(err);
    }
  }
);
