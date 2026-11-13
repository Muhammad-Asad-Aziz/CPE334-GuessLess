import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/env';

describe('Configuration & Fail-Fast Startup (TEST-NFR-02, TEST-NFR-09)', () => {
  const validBaseEnv = {
    NODE_ENV: 'production',
    PORT: '8080',
    DATABASE_URL: 'postgresql://survey:change-me-db-password@localhost:5432/survey',
    TEST_DATABASE_URL: 'postgresql://survey:change-me-db-password@localhost:5432/survey_test',
    JWT_SECRET: 'a'.repeat(32), // exactly 32 chars
    JWT_EXPIRES_MINUTES: '60',
    BCRYPT_COST: '12',
  };

  describe('JWT_SECRET and Expiration Validation (TEST-NFR-09)', () => {
    it('refuses startup without JWT_SECRET', () => {
      const env = { ...validBaseEnv };
      delete (env as any).JWT_SECRET;

      expect(() => loadConfig(env)).toThrowError(/JWT_SECRET/);
    });

    it('refuses startup when JWT_SECRET is 31 characters long (< 32)', () => {
      const secret31 = 's'.repeat(31);
      const env = { ...validBaseEnv, JWT_SECRET: secret31 };

      let caughtError: Error | null = null;
      try {
        loadConfig(env);
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError!.message).toContain('JWT_SECRET');
      // Crucial NFR-09 requirement: error must NOT reveal the secret value itself
      expect(caughtError!.message).not.toContain(secret31);
    });

    it('accepts startup when JWT_SECRET is exactly 32 characters long', () => {
      const secret32 = 's'.repeat(32);
      const env = { ...validBaseEnv, JWT_SECRET: secret32 };

      const config = loadConfig(env);
      expect(config.JWT_SECRET).toBe(secret32);
    });

    it('refuses startup when JWT_EXPIRES_MINUTES is 61 (> 60)', () => {
      const env = { ...validBaseEnv, JWT_EXPIRES_MINUTES: '61' };

      expect(() => loadConfig(env)).toThrowError(/JWT_EXPIRES_MINUTES/);
    });

    it('accepts startup when JWT_EXPIRES_MINUTES is 60', () => {
      const env = { ...validBaseEnv, JWT_EXPIRES_MINUTES: '60' };

      const config = loadConfig(env);
      expect(config.JWT_EXPIRES_MINUTES).toBe(60);
    });

    it('refuses startup when DATABASE_URL is missing', () => {
      const env = { ...validBaseEnv };
      delete (env as any).DATABASE_URL;

      expect(() => loadConfig(env)).toThrowError(/DATABASE_URL/);
    });
  });

  describe('Password Hashing Cost Validation (TEST-NFR-02)', () => {
    it('refuses startup in production when BCRYPT_COST is 9 (< 10)', () => {
      const env = { ...validBaseEnv, NODE_ENV: 'production', BCRYPT_COST: '9' };

      expect(() => loadConfig(env)).toThrowError(/BCRYPT_COST/);
    });

    it('accepts startup in production when BCRYPT_COST is 10 (>= 10)', () => {
      const env = { ...validBaseEnv, NODE_ENV: 'production', BCRYPT_COST: '10' };

      const config = loadConfig(env);
      expect(config.BCRYPT_COST).toBe(10);
    });

    it('accepts BCRYPT_COST of 4 in test mode', () => {
      const env = { ...validBaseEnv, NODE_ENV: 'test', BCRYPT_COST: '4' };

      const config = loadConfig(env);
      expect(config.BCRYPT_COST).toBe(4);
    });

    it('refuses BCRYPT_COST of 3 even in test mode', () => {
      const env = { ...validBaseEnv, NODE_ENV: 'test', BCRYPT_COST: '3' };

      expect(() => loadConfig(env)).toThrowError(/BCRYPT_COST/);
    });
  });
});

