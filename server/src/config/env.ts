import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace or root if not already in process.env
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const configSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(8080),
    DB_PASSWORD: z.string().default('change-me-db-password'),
    DATABASE_URL: z
      .string({
        required_error: "Missing required environment variable 'DATABASE_URL'",
      })
      .min(1, "Missing required environment variable 'DATABASE_URL'"),
    TEST_DATABASE_URL: z
      .string({
        required_error: "Missing required environment variable 'TEST_DATABASE_URL'",
      })
      .min(1, "Missing required environment variable 'TEST_DATABASE_URL'"),
    JWT_SECRET: z
      .string({
        required_error: "Missing required environment variable 'JWT_SECRET'",
      })
      .min(32, "Invalid environment variable 'JWT_SECRET': must be at least 32 characters long"),
    JWT_EXPIRES_MINUTES: z.coerce
      .number({
        required_error: "Missing required environment variable 'JWT_EXPIRES_MINUTES'",
      })
      .int()
      .min(1, "Invalid environment variable 'JWT_EXPIRES_MINUTES': must be at least 1")
      .max(60, "Invalid environment variable 'JWT_EXPIRES_MINUTES': must be at most 60"),
    BCRYPT_COST: z.coerce.number().int().default(12),
    ANON_MIN_RESPONSES: z.coerce.number().int().min(1).default(5),
    LOGIN_RATE_MAX_FAILED: z.coerce.number().int().min(1).default(10),
    LOGIN_RATE_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    SEED_PASSWORD: z.string().default('change-me-seed-password'),
    APP_VERSION: z.string().default('dev'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .superRefine((data, ctx) => {
    // TEST-NFR-02 / SR-05: In production or development, BCRYPT_COST must be >= 10.
    // In test environment, cost >= 4 is permitted.
    if (data.NODE_ENV === 'test') {
      if (data.BCRYPT_COST < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BCRYPT_COST'],
          message: "Invalid environment variable 'BCRYPT_COST': must be at least 4 in test mode",
        });
      }
    } else {
      if (data.BCRYPT_COST < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BCRYPT_COST'],
          message: "Invalid environment variable 'BCRYPT_COST': must be at least 10 in production and development",
        });
      }
    }
  });

export type Config = z.infer<typeof configSchema>;

export function loadConfig(customEnv: Record<string, any> = process.env): Config {
  const parsed = configSchema.safeParse(customEnv);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((issue) => {
      return issue.message;
    });
    // Never leak secret values in error output
    const cleanError = new Error(`Configuration Error:\n - ${errorMessages.join('\n - ')}`);
    throw cleanError;
  }
  return parsed.data;
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

