import { PrismaClient } from '@prisma/client';
import { getConfig } from '../config/index';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const config = getConfig();

export const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: config.DATABASE_URL,
      },
    },
    log: config.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (config.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

