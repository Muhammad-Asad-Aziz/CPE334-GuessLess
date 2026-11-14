import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError, ErrorDetail } from '../errors';

type RequestPart = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[part]);
      req[part] = parsed;
      next();
    } catch (err: any) {
      if (err instanceof ZodError) {
        const details: ErrorDetail[] = err.issues.map((issue) => ({
          field: issue.path.length > 0 ? issue.path.join('.') : undefined,
          issue: issue.message,
        }));
        return next(new ValidationError('The request is not valid.', details));
      }
      next(err);
    }
  };
}

