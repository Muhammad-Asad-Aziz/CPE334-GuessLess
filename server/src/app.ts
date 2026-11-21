import fs from 'fs';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { surveysRouter } from './routes/surveys';
import { availableSurveysRouter } from './routes/availableSurveys';
import { responsesRouter } from './routes/responses';
import { myResponsesRouter } from './routes/myResponses';
import { NotFoundError } from './errors';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

export const app = express();

// Trust one proxy hop (Cloud Run HTTPS load balancer)
app.set('trust proxy', 1);

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

// Cloud readiness check (returns 503 when PostgreSQL is unreachable)
app.get('/api/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'not_ready', db: 'disconnected' });
  }
});

// Auth routes (F-01)
app.use('/api/v1/auth', authRouter);
app.use('/api/auth', authRouter);

// Owner survey routes (F-02)
app.use('/api/v1/surveys', surveysRouter);

// Respondent Available Surveys routes (F-03, FR-08)
app.use('/api/v1/available-surveys', availableSurveysRouter);
app.use('/api/available-surveys', availableSurveysRouter);

// Respondent Submissions & History routes (F-03, FR-03, FR-09)
app.use('/api/v1', responsesRouter);
app.use('/api', responsesRouter);

app.use('/api/v1', myResponsesRouter);
app.use('/api', myResponsesRouter);

// Keep all unknown /api/* routes returning structured JSON 404
app.use('/api', (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found.`));
});

// Serve built React SPA from client/dist in single-container / production mode
function resolveClientDist(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
    path.resolve(process.cwd(), 'client/dist'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

const clientDistDir = process.env.NODE_ENV !== 'test' ? resolveClientDist() : null;
if (clientDistDir) {
  app.use(express.static(clientDistDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

// Catch-all 404 handler (active when SPA static build is absent or in test mode)
app.use((req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found.`));
});

// Central error handler
app.use(errorHandler);

export default app;