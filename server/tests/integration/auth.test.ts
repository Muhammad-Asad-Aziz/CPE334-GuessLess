import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { clearDatabase } from '../helpers/db';
import { createUser } from '../helpers/factories';

describe('F-01 Authentication & Session Integration Tests', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe('TEST-F01-01: login: valid credentials (AC-F01-01, FR-05)', () => {
    it('authenticates owner with mixed-case email and returns token without role claim or password leak', async () => {
      const owner = await createUser({
        email: 'owner1@example.edu',
        displayName: 'Owner One',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'Owner1@Example.edu', // Mixed-case email
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      const { data } = res.body;

      expect(data.tokenType).toBe('Bearer');
      expect(typeof data.token).toBe('string');
      expect(data.user).toEqual({
        id: owner.id,
        displayName: 'Owner One',
        role: 'SURVEY_OWNER',
      });

      // Verify expiresAt is within 60 minutes
      const expiresAt = new Date(data.expiresAt).getTime();
      const now = Date.now();
      const diffMinutes = (expiresAt - now) / (1000 * 60);
      expect(diffMinutes).toBeGreaterThan(0);
      expect(diffMinutes).toBeLessThanOrEqual(60);

      // Verify token payload contains sub, jti ONLY — NO role claim
      const decoded: any = jwt.decode(data.token);
      expect(decoded.sub).toBe(owner.id);
      expect(decoded.jti).toBeDefined();
      expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(3600);
      expect(decoded.role).toBeUndefined(); // Crucial: no role claim inside JWT

      // Verify no password or bcrypt hash leak in response
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('Password123!');
      expect(serialized).not.toContain('$2b$');
    });

    it('authenticates respondent with lowercase email', async () => {
      const resp = await createUser({
        email: 'resp1@example.edu',
        displayName: 'Respondent One',
        password: 'RespPassword456!',
        role: 'RESPONDENT',
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'resp1@example.edu',
          password: 'RespPassword456!',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('RESPONDENT');
      expect(res.body.data.user.id).toBe(resp.id);
    });
  });

  describe('TEST-F01-02: login: invalid credentials & malformed body (AC-F01-02, FR-05, BR-08)', () => {
    it('rejects wrong password with 401 INVALID_CREDENTIALS and identical message', async () => {
      await createUser({
        email: 'resp1@example.edu',
        password: 'CorrectPassword1!',
        role: 'RESPONDENT',
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'resp1@example.edu',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
        requestId: expect.any(String),
      });
      expect(res.body.data).toBeUndefined();
    });

    it('rejects non-existent email with identical 401 INVALID_CREDENTIALS (no account enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nobody@example.edu',
          password: 'AnyPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
        requestId: expect.any(String),
      });
      expect(res.body.data).toBeUndefined();
    });

    it('rejects disabled account (isActive = false) with identical 401 INVALID_CREDENTIALS', async () => {
      await createUser({
        email: 'disabled@example.edu',
        password: 'Password123!',
        isActive: false,
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'disabled@example.edu',
          password: 'Password123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
        requestId: expect.any(String),
      });
      expect(res.body.data).toBeUndefined();
    });

    it('rejects missing password with 400 VALIDATION_ERROR naming password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'owner1@example.edu',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })])
      );
      expect(res.body.data).toBeUndefined();
    });

    it('rejects empty body {} with 400 VALIDATION_ERROR naming email and password', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const fields = res.body.error.details.map((d: any) => d.field);
      expect(fields).toContain('email');
      expect(fields).toContain('password');
    });

    it('rejects request body with server-owned field "role" (BR-08 strict schema)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'owner1@example.edu',
          password: 'Password123!',
          role: 'SURVEY_OWNER',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'role' })])
      );
    });

    it('rejects request body with extra unknown field "ownerId"', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'owner1@example.edu',
          password: 'Password123!',
          ownerId: '99999999-9999-9999-9999-999999999999',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'ownerId' })])
      );
    });
  });

  describe('TEST-F01-03: logout & token revocation (AC-F01-03, FR-06)', () => {
    it('revokes token, writes RevokedToken row, and rejects subsequent calls with 401', async () => {
      const resp = await createUser({
        email: 'resp1@example.edu',
        password: 'Password123!',
        role: 'RESPONDENT',
      });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'resp1@example.edu', password: 'Password123!' });

      const token = loginRes.body.data.token;
      const decoded: any = jwt.decode(token);

      // 1. Logout with token
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutRes.status).toBe(204);

      // 2. Database verification: RevokedToken row exists
      const revokedRow = await prisma.revokedToken.findUnique({
        where: { jti: decoded.jti },
      });
      expect(revokedRow).not.toBeNull();
      expect(revokedRow!.jti).toBe(decoded.jti);

      // 3. Subsequent request to /auth/me returns 401 UNAUTHENTICATED
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(401);
      expect(meRes.body.error.code).toBe('UNAUTHENTICATED');

      // 4. Repeated logout with same token returns 401 UNAUTHENTICATED
      const repeatLogoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(repeatLogoutRes.status).toBe(401);
      expect(repeatLogoutRes.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('TEST-F01-04: current user identity & live database state (AC-F01-04, FR-07, BR-08, BR-13)', () => {
    it('retrieves identity and ignores spoofed X-User-Id header', async () => {
      const owner = await createUser({
        email: 'owner1@example.edu',
        displayName: 'Owner One',
        role: 'SURVEY_OWNER',
      });

      const resp = await createUser({
        email: 'resp1@example.edu',
        displayName: 'Respondent One',
        password: 'Password123!',
        role: 'RESPONDENT',
      });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'resp1@example.edu', password: 'Password123!' });

      const token = loginRes.body.data.token;

      // Attempt to spoof identity via X-User-Id
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('X-User-Id', owner.id);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data).toEqual({
        id: resp.id,
        displayName: 'Respondent One',
        role: 'RESPONDENT',
      });
    });

    it('reads role dynamically from PostgreSQL on every request', async () => {
      const user = await createUser({
        email: 'user1@example.edu',
        displayName: 'Dynamic User',
        password: 'Password123!',
        role: 'RESPONDENT',
      });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'user1@example.edu', password: 'Password123!' });

      const token = loginRes.body.data.token;

      // First check: role is RESPONDENT
      const firstCheck = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(firstCheck.status).toBe(200);
      expect(firstCheck.body.data.role).toBe('RESPONDENT');

      // Update role directly in the database
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'SURVEY_OWNER' },
      });

      // Second check: role reflects SURVEY_OWNER immediately without re-login
      const secondCheck = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(secondCheck.status).toBe(200);
      expect(secondCheck.body.data.role).toBe('SURVEY_OWNER');
    });

    it('rejects tokens immediately when account is disabled in PostgreSQL', async () => {
      const user = await createUser({
        email: 'user2@example.edu',
        password: 'Password123!',
        role: 'RESPONDENT',
        isActive: true,
      });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'user2@example.edu', password: 'Password123!' });

      const token = loginRes.body.data.token;

      // Disable account directly in the database
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(401);
      expect(meRes.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects missing or malformed Bearer token with 401 UNAUTHENTICATED', async () => {
      const noHeaderRes = await request(app).get('/api/v1/auth/me');
      expect(noHeaderRes.status).toBe(401);
      expect(noHeaderRes.body.error.code).toBe('UNAUTHENTICATED');

      const malformedRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-string');
      expect(malformedRes.status).toBe(401);
      expect(malformedRes.body.error.code).toBe('UNAUTHENTICATED');
    });
  });
});
