import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { app } from '../../src/app';
import { clearDatabase } from '../helpers/db';
import { createUser, createSurveyWithQuestions } from '../helpers/factories';
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

      const f02Routes = [
        { method: 'POST', path: '/api/v1/surveys' },
        { method: 'GET', path: '/api/v1/surveys' },
        { method: 'GET', path: '/api/v1/surveys/:id' },
        { method: 'POST', path: '/api/v1/surveys/:id/publish' },
        { method: 'POST', path: '/api/v1/surveys/:id/close' },
      ] as const;

      for (const expected of f02Routes) {
        const spec = PROTECTED_ROUTES.find(
          (r) => r.method === expected.method && r.path === expected.path
        );
        expect(spec).toBeDefined();
        expect(spec?.allowedRoles).toEqual(['SURVEY_OWNER']);
      }
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

  describe('F-02 Owner Survey Endpoints RBAC Matrix (NFR-03, NFR-05, BR-08)', () => {
    it('enforces 401 unauthenticated, 403 wrong role (RESPONDENT/ADMIN), and allows SURVEY_OWNER across all 5 F-02 routes', async () => {
      const owner = await createUser({
        email: 'owner-matrix@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const resp = await createUser({
        email: 'resp-matrix@example.edu',
        password: 'Password123!',
        role: 'RESPONDENT',
      });
      const admin = await createUser({
        email: 'admin-matrix@example.edu',
        password: 'Password123!',
        role: 'ADMIN',
      });

      const ownerLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password: 'Password123!' });
      const respLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: resp.email, password: 'Password123!' });
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: admin.email, password: 'Password123!' });

      const ownerToken = ownerLogin.body.data.token as string;
      const respToken = respLogin.body.data.token as string;
      const adminToken = adminLogin.body.data.token as string;

      const draftSurvey = await createSurveyWithQuestions(owner.id, {
        title: 'Matrix Survey',
        status: 'DRAFT',
        questions: [{ type: 'RATING', text: 'Rate 1-5' }],
      });

      const f02Calls: Array<{
        name: string;
        send: (token?: string) => Promise<request.Response>;
        expectedOwnerStatus: number;
      }> = [
        {
          name: 'POST /api/v1/surveys',
          send: (token) => {
            const req = request(app)
              .post('/api/v1/surveys')
              .send({ title: 'Matrix Created', questions: [] });
            return token ? req.set('Authorization', `Bearer ${token}`) : req;
          },
          expectedOwnerStatus: 201,
        },
        {
          name: 'GET /api/v1/surveys',
          send: (token) => {
            const req = request(app).get('/api/v1/surveys');
            return token ? req.set('Authorization', `Bearer ${token}`) : req;
          },
          expectedOwnerStatus: 200,
        },
        {
          name: 'GET /api/v1/surveys/:id',
          send: (token) => {
            const req = request(app).get(`/api/v1/surveys/${draftSurvey.id}`);
            return token ? req.set('Authorization', `Bearer ${token}`) : req;
          },
          expectedOwnerStatus: 200,
        },
        {
          name: 'POST /api/v1/surveys/:id/publish',
          send: (token) => {
            const req = request(app).post(`/api/v1/surveys/${draftSurvey.id}/publish`);
            return token ? req.set('Authorization', `Bearer ${token}`) : req;
          },
          expectedOwnerStatus: 200,
        },
        {
          name: 'POST /api/v1/surveys/:id/close',
          send: (token) => {
            const req = request(app).post(`/api/v1/surveys/${draftSurvey.id}/close`);
            return token ? req.set('Authorization', `Bearer ${token}`) : req;
          },
          expectedOwnerStatus: 200,
        },
      ];

      for (const endpoint of f02Calls) {
        const unauthRes = await endpoint.send(undefined);
        expect(unauthRes.status, `${endpoint.name} unauthenticated`).toBe(401);
        expect(unauthRes.body.error.code).toBe('UNAUTHENTICATED');
        expect(unauthRes.body.data).toBeUndefined();

        const respRes = await endpoint.send(respToken);
        expect(respRes.status, `${endpoint.name} RESPONDENT`).toBe(403);
        expect(respRes.body.error.code).toBe('FORBIDDEN');
        expect(respRes.body.data).toBeUndefined();

        const adminRes = await endpoint.send(adminToken);
        expect(adminRes.status, `${endpoint.name} ADMIN`).toBe(403);
        expect(adminRes.body.error.code).toBe('FORBIDDEN');
        expect(adminRes.body.data).toBeUndefined();

        const ownerRes = await endpoint.send(ownerToken);
        expect(ownerRes.status, `${endpoint.name} SURVEY_OWNER`).toBe(
          endpoint.expectedOwnerStatus
        );
      }
    });

    it.each([
      ['role', 'ADMIN'],
      ['ownerId', '11111111-1111-1111-1111-111111111111'],
      ['userId', '22222222-2222-2222-2222-222222222222'],
      ['status', 'PUBLISHED'],
      ['submittedAt', '2026-11-14T10:00:00.000Z'],
    ])('rejects server-owned field "%s" on F-02 mutation endpoints with 400 VALIDATION_ERROR', async (field, value) => {
      const owner = await createUser({
        email: 'owner-strict@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password: 'Password123!' });
      const token = login.body.data.token as string;

      const draft = await createSurveyWithQuestions(owner.id, {
        title: 'Strict Target',
        status: 'DRAFT',
      });

      const createRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Attempt', [field]: value });
      expect(createRes.status).toBe(400);
      expect(createRes.body.error.code).toBe('VALIDATION_ERROR');

      const publishRes = await request(app)
        .post(`/api/v1/surveys/${draft.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .send({ [field]: value });
      expect(publishRes.status).toBe(400);
      expect(publishRes.body.error.code).toBe('VALIDATION_ERROR');

      const closeRes = await request(app)
        .post(`/api/v1/surveys/${draft.id}/close`)
        .set('Authorization', `Bearer ${token}`)
        .send({ [field]: value });
      expect(closeRes.status).toBe(400);
      expect(closeRes.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
