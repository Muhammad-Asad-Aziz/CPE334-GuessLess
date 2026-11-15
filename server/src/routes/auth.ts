import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { AuthService } from '../services/AuthService';

export const authRouter = Router();

const loginSchema = z
  .object({
    email: z
      .string({ required_error: 'email is required' })
      .trim()
      .min(3, 'email must be at least 3 characters')
      .max(254, 'email must be at most 254 characters')
      .email('must be a valid email format'),
    password: z
      .string({ required_error: 'password is required' })
      .min(1, 'password is required')
      .max(128, 'password must be at most 128 characters'),
  })
  .strict();

// POST /api/v1/auth/login (public)
authRouter.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.login(req.body.email, req.body.password);
      return res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/auth/logout (authenticated)
authRouter.post(
  '/logout',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await AuthService.logout(req.token!);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/auth/me (authenticated)
authRouter.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser = await AuthService.getCurrentUser(req.user!.id);
      return res.status(200).json({ data: currentUser });
    } catch (err) {
      next(err);
    }
  }
);
