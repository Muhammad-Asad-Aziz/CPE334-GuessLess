import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { logger } from '../lib/logger';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = String(req.id || req.header('X-Request-Id') || 'unknown');

  // SyntaxError from malformed JSON body
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    res.setHeader('X-Request-Id', requestId);
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Malformed JSON payload.',
        requestId,
      },
    });
  }

  // Known AppError subclass
  if (err instanceof AppError) {
    res.setHeader('X-Request-Id', requestId);
    const body: Record<string, any> = {
      code: err.code,
      message: err.message,
      requestId,
    };
    if (err.details && err.details.length > 0) {
      body.details = err.details;
    }
    return res.status(err.statusCode).json({ error: body });
  }

  // Unexpected internal error: Log internally with requestId, never leak details to client
  logger.error({ err, requestId, path: req.path, method: req.method }, 'Unhandled internal server error');

  res.setHeader('X-Request-Id', requestId);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId,
    },
  });
}
