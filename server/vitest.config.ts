import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      BCRYPT_COST: '4',
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
      JWT_EXPIRES_MINUTES: '60',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://survey:change-me-db-password@localhost:5432/survey_test',
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://survey:change-me-db-password@localhost:5432/survey_test',
    },
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
});

