import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { NotFoundError } from './errors';
import { logger } from './lib/logger';

export const app = express();

// Security headers
app.use(helmet());

// Request correlation ID
app.use(requestIdMiddleware);

// Pino HTTP logger
app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({
      requestId: req.id,
    }),
  })
);

// Body parser with 100 kB limit
app.use(express.json({ limit: '100kb' }));

// Route registration
// Canonical SDS path: /api/v1/health
app.use('/api/v1/health', healthRouter);
// Root alias path: /api/health
app.use('/api/health', healthRouter);

// Auth routes (F-01)
app.use('/api/v1/auth', authRouter);
app.use('/api/auth', authRouter);

// Catch-all 404 handler
app.use((req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found.`));
});

// Central error handler
app.use(errorHandler);

export default app;

