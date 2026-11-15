import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { getConfig } from '../config/index';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getConfig();
    // Verify database connectivity
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      status: 'ok',
      db: 'ok',
      version: config.APP_VERSION,
    });
  } catch (err) {
    next(err);
  }
});

