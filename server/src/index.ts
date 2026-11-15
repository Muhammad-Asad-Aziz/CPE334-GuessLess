import { app } from './app';
import { getConfig } from './config/index';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';

const config = getConfig();

async function startServer() {
  try {
    // Check database connection before accepting traffic
    await prisma.$connect();
    logger.info('Database connection established successfully.');

    const server = app.listen(config.PORT, () => {
      logger.info({ port: config.PORT, env: config.NODE_ENV, version: config.APP_VERSION }, `GuessLess server listening on port ${config.PORT}`);
    });

    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal, shutting down gracefully...');
      server.close(async () => {
        await prisma.$disconnect();
        logger.info('Database disconnected. Server stopped.');
        process.exit(0);
      });

      // Force shutdown after 10s timeout
      setTimeout(() => {
        logger.error('Forced shutdown timeout exceeded.');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, 'Failed to bootstrap server');
    process.exit(1);
  }
}

startServer();

