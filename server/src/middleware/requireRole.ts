import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { ForbiddenError, UnauthenticatedError } from '../errors';

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthenticatedError());
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError());
    }

    next();
  };
}
