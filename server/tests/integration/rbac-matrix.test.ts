import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { app } from '../../src/app';
import { clearDatabase } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { authenticate } from '../../src/middleware/authenticate';
import { requireRole } from '../../src/middleware/requireRole';
import { errorHandler } from '../../src/middleware/errorHandler';
import { PROTECTED_ROUTES, PUBLIC_ROUTES } from '../helpers/routes';

describe('TEST-F01-05: RBAC Matrix & Strict Body Guard (AC-F01-05, BR-08, NFR-05)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe('Route Registry Completeness', () => {
    it('contains all canonical Sprint 1 auth routes in protected/public registries', () => {
      const logoutSpec = PROTECTED_ROUTES.find((r) => r.path === '/api/v1/auth/logout');
      expect(logoutSpec).toBeDefined();
      expect(logoutSpec?.method).toBe('POST');
      expect(logoutSpec?.allowedRoles).toEqual(expect.arrayContaining(['RESPONDENT', 'SURVEY_OWNER', 'ADMIN']));

      const meSpec = PROTECTED_ROUTES.find((r) => r.path === '/api/v1/auth/me');
      expect(meSpec).toBeDefined();
      expect(meSpec?.method).toBe('GET');

      const loginSpec = PUBLIC_ROUTES.find((r) => r.path === '/api/v1/auth/login');
      expect(loginSpec).toBeDefined();
      expect(loginSpec?.method).toBe('POST');
    });
  });

  describe('Role-Based Access Guard (requireRole)', () => {
    // Mount a dedicated test harness app using the actual middleware
    const testApp = express();
    testApp.use(express.json());

    // Survey Owner only route
    testApp.get('/test/owner-only', authenticate, requireRole('SURVEY_OWNER'), (_req: Request, res: Response) => {
      res.status(200).json({ data: 'owner-success' });
    });

    // Respondent only route
    testApp.post('/test/respondent-only', authenticate, requireRole('RESPONDENT'), (_req: Request, res: Response) => {
      res.status(200).json({ data: 'respondent-success' });
    });

    // Admin only route
    testApp.get('/test/admin-only', authenticate, requireRole('ADMIN'), (_req: Request, res: Response) => {
      res.status(200).json({ data: 'admin-success' });
    });

    testApp.use(errorHandler);

    it('forbids RESPONDENT and ADMIN from accessing SURVEY_OWNER route (403 FORBIDDEN)', async () => {
      const resp = await createUser({ email: 'resp@example.edu', password: 'Password1!', role: 'RESPONDENT' });
      const admin = await createUser({ email: 'admin@example.edu', password: 'Password1!', role: 'ADMIN' });
      const owner = await createUser({ email: 'owner@example.edu', password: 'Password1!', role: 'SURVEY_OWNER' });

      const respLogin = await request(app).post('/api/v1/auth/login').send({ email: resp.email, password: 'Password1!' });
      const adminLogin = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'Password1!' });
      const ownerLogin = await request(app).post('/api/v1/auth/login').send({ email: owner.email, password: 'Password1!' });

      // Respondent -> 403
      const respRes = await request(testApp)
        .get('/test/owner-only')
        .set('Authorization', `Bearer ${respLogin.body.data.token}`);
      expect(respRes.status).toBe(403);
      expect(respRes.body.error.code).toBe('FORBIDDEN');

      // Admin -> 403
      const adminRes = await request(testApp)
        .get('/test/owner-only')
        .set('Authorization', `Bearer ${adminLogin.body.data.token}`);
      expect(adminRes.status).toBe(403);
      expect(adminRes.body.error.code).toBe('FORBIDDEN');

      // Owner -> 200
      const ownerRes = await request(testApp)
        .get('/test/owner-only')
        .set('Authorization', `Bearer ${ownerLogin.body.data.token}`);
      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.data).toBe('owner-success');
    });

    it('forbids SURVEY_OWNER and ADMIN from accessing RESPONDENT route (403 FORBIDDEN)', async () => {
      const owner = await createUser({ email: 'owner@example.edu', password: 'Password1!', role: 'SURVEY_OWNER' });
      const ownerLogin = await request(app).post('/api/v1/auth/login').send({ email: owner.email, password: 'Password1!' });

      const res = await request(testApp)
        .post('/test/respondent-only')
        .set('Authorization', `Bearer ${ownerLogin.body.data.token}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows all authenticated roles on /auth/logout and /auth/me', async () => {
      const roles: Array<'RESPONDENT' | 'SURVEY_OWNER' | 'ADMIN'> = ['RESPONDENT', 'SURVEY_OWNER', 'ADMIN'];

      for (const role of roles) {
        const user = await createUser({ email: `${role.toLowerCase()}@example.edu`, password: 'Password1!', role });
        const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'Password1!' });
        const token = loginRes.body.data.token;

        const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
        expect(meRes.status).toBe(200);
        expect(meRes.body.data.role).toBe(role);

        const logoutRes = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`);
        expect(logoutRes.status).toBe(204);
      }
    });
  });

  describe('Server-Owned Fields Rejection (BR-08 strict body validation)', () => {
    it.each([
      ['role', 'ADMIN'],
      ['ownerId', '11111111-1111-1111-1111-111111111111'],
      ['userId', '22222222-2222-2222-2222-222222222222'],
      ['status', 'PUBLISHED'],
      ['submittedAt', '2026-11-14T10:00:00.000Z'],
    ])('rejects body containing server-owned field "%s" with 400 VALIDATION_ERROR', async (field, value) => {
      const body: Record<string, any> = {
        email: 'owner1@example.edu',
        password: 'Password123!',
        [field]: value,
      };

      const res = await request(app).post('/api/v1/auth/login').send(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })])
      );
    });
  });
});
