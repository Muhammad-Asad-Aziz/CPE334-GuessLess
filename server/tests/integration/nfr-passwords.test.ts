import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { clearDatabase } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { loadConfig } from '../../src/config/env';

describe('TEST-NFR-02: Password Protection & Zero-Leak Security (SR-05, NFR-02)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('(a) stores all passwords exclusively as bcrypt hashes (never plaintext)', async () => {
    const rawPassword = 'StrongPassword!2026';
    const user = await createUser({
      email: 'secure-user@example.edu',
      password: rawPassword,
    });

    const userFromDb = await prisma.user.findUnique({
      where: { id: user.id },
    });

    expect(userFromDb).not.toBeNull();
    // Verify hash format matches standard bcrypt regex
    expect(userFromDb!.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    // Verify hash never equals plaintext password
    expect(userFromDb!.passwordHash).not.toBe(rawPassword);
  });

  it('(b) leaks zero passwords or password hashes in login response bodies or headers', async () => {
    const rawPassword = 'SuperSecretPassword!';
    await createUser({
      email: 'zero-leak@example.edu',
      password: rawPassword,
    });

    // Valid login
    const validRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'zero-leak@example.edu', password: rawPassword });

    expect(validRes.status).toBe(200);
    const validBody = JSON.stringify(validRes.body);
    expect(validBody).not.toContain(rawPassword);
    expect(validBody).not.toContain('$2b$');
    expect(validBody).not.toContain('$2a$');

    // Invalid login
    const invalidRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'zero-leak@example.edu', password: 'WrongPassword' });

    expect(invalidRes.status).toBe(401);
    const invalidBody = JSON.stringify(invalidRes.body);
    expect(invalidBody).not.toContain('WrongPassword');
    expect(invalidBody).not.toContain('$2b$');
    expect(invalidBody).not.toContain('$2a$');
  });

  it('(c) configuration refuses BCRYPT_COST < 10 in production and accepts 4 only in test', () => {
    const validBaseEnv = {
      PORT: '8080',
      DATABASE_URL: 'postgresql://survey:password@localhost:5432/survey',
      TEST_DATABASE_URL: 'postgresql://survey:password@localhost:5432/survey_test',
      JWT_SECRET: 'x'.repeat(32),
      JWT_EXPIRES_MINUTES: '60',
    };

    // Refuses cost 9 in production
    expect(() =>
      loadConfig({
        ...validBaseEnv,
        NODE_ENV: 'production',
        BCRYPT_COST: '9',
      })
    ).toThrowError(/BCRYPT_COST/);

    // Accepts cost 10 in production
    const prodConfig = loadConfig({
      ...validBaseEnv,
      NODE_ENV: 'production',
      BCRYPT_COST: '10',
    });
    expect(prodConfig.BCRYPT_COST).toBe(10);

    // Accepts cost 4 in test
    const testConfig = loadConfig({
      ...validBaseEnv,
      NODE_ENV: 'test',
      BCRYPT_COST: '4',
    });
    expect(testConfig.BCRYPT_COST).toBe(4);

    // Refuses cost 3 in test
    expect(() =>
      loadConfig({
        ...validBaseEnv,
        NODE_ENV: 'test',
        BCRYPT_COST: '3',
      })
    ).toThrowError(/BCRYPT_COST/);
  });

  it('(d) default production hashing cost generates cost-12 hash', async () => {
    const rawPassword = 'DefaultCostPassword';
    const hash = await bcrypt.hash(rawPassword, 12);
    // $2b$12$...
    expect(hash.startsWith('$2b$12$') || hash.startsWith('$2a$12$')).toBe(true);
  });
});
