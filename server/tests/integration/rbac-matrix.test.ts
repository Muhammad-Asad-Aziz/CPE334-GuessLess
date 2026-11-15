import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { app } from '../../src/app';
import { clearDatabase } from '../helpers/db';
import { createUser, createSurveyWithQuestions, createResponse } from '../helpers/factories';
import { authenticate } from '../../src/middleware/authenticate';
import { requireRole } from '../../src/middleware/requireRole';
import { errorHandler } from '../../src/middleware/errorHandler';
import { PROTECTED_ROUTES, PUBLIC_ROUTES, assertRoutesComplete } from '../helpers/routes';
import { prisma } from '../../src/lib/prisma';
import { Role } from '@prisma/client';

describe('TEST-F01-05 & TEST-NFR-05: Complete RBAC Matrix & Strict Body Guard (BR-08, NFR-05)', () => {
  let ownerId: string;
  let ownerToken: string;
  let respToken: string;
  let adminToken: string;
  let surveyId: string;
  let responseId: string;

  beforeEach(async () => {
    await clearDatabase();

    // 1. Create seeded users for each role
    const owner = await createUser({
      email: 'owner-matrix@example.edu',
      password: 'Password123!',
      role: 'SURVEY_OWNER',
    });
    ownerId = owner.id;
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

    // 2. Log in each user to get valid JWTs
    const ownerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: 'Password123!' });
    const respLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resp.email, password: 'Password123!' });
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: 'Password123!' });

    ownerToken = ownerLogin.body.data.token;
    respToken = respLogin.body.data.token;
    adminToken = adminLogin.body.data.token;

    // 3. Create survey and response fixtures for valid path parameters
    const survey = await createSurveyWithQuestions(owner.id, {
      title: 'RBAC Test Survey',
      status: 'PUBLISHED',
      questions: [
        {
          type: 'SINGLE_CHOICE',
          text: 'Is RBAC enforced?',
          options: [{ text: 'Yes' }, { text: 'No' }],
        },
      ],
    });
    surveyId = survey.id;

    const respObj = await createResponse(survey.id, resp.id, [
      { questionId: survey.questions[0].id, optionId: survey.questions[0].options[0].id },
    ]);
    responseId = respObj.id;
  });

  describe('Route Registry Completeness & Introspection', () => {
    it('introspects live Express router stack and confirms bidirectional parity with catalog', () => {
      expect(() => assertRoutesComplete(app)).not.toThrow();
    });
  });

  describe('requireRole Middleware Unit Behavior', () => {
    const testApp = express();
    testApp.use(express.json());

    testApp.get('/test/owner-only', authenticate, requireRole('SURVEY_OWNER'), (_req: Request, res: Response) => {
      res.status(200).json({ data: 'owner-success' });
    });

    testApp.post('/test/respondent-only', authenticate, requireRole('RESPONDENT'), (_req: Request, res: Response) => {
      res.status(200).json({ data: 'respondent-success' });
    });

    testApp.get('/test/admin-only', authenticate, requireRole('ADMIN'), (_req: Request, res: Response) => {
      res.status(200).json({ data: 'admin-success' });
    });

    testApp.use(errorHandler);

    it('forbids RESPONDENT and ADMIN from accessing SURVEY_OWNER route (403 FORBIDDEN)', async () => {
      const respRes = await request(testApp)
        .get('/test/owner-only')
        .set('Authorization', `Bearer ${respToken}`);
      expect(respRes.status).toBe(403);
      expect(respRes.body.error.code).toBe('FORBIDDEN');

      const adminRes = await request(testApp)
        .get('/test/owner-only')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(403);
      expect(adminRes.body.error.code).toBe('FORBIDDEN');

      const ownerRes = await request(testApp)
        .get('/test/owner-only')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.data).toBe('owner-success');
    });

    it('forbids SURVEY_OWNER and ADMIN from accessing RESPONDENT route (403 FORBIDDEN)', async () => {
      const ownerRes = await request(testApp)
        .post('/test/respondent-only')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(ownerRes.status).toBe(403);
      expect(ownerRes.body.error.code).toBe('FORBIDDEN');

      const adminRes = await request(testApp)
        .post('/test/respondent-only')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(403);
      expect(adminRes.body.error.code).toBe('FORBIDDEN');
    });

    it('allows all authenticated roles on /auth/logout and /auth/me', async () => {
      for (const token of [ownerToken, respToken, adminToken]) {
        const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
        expect(meRes.status).toBe(200);

        const logoutRes = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`);
        expect(logoutRes.status).toBe(204);
      }
    });
  });

  describe('Complete Table-Driven RBAC Matrix Across All 14 Protected Routes (TEST-NFR-05)', () => {
    const ALL_ROLES: Role[] = ['RESPONDENT', 'SURVEY_OWNER', 'ADMIN'];

    const tokenByRole: Record<Role, () => string> = {
      SURVEY_OWNER: () => ownerToken,
      RESPONDENT: () => respToken,
      ADMIN: () => adminToken,
    };

    function resolvePath(rawPath: string): string {
      return rawPath
        .replace(':id', surveyId)
        .replace(':responseId', responseId);
    }

    async function getDbSnapshot() {
      const [users, surveys, responses, answers, participations] = await Promise.all([
        prisma.user.count(),
        prisma.survey.count(),
        prisma.response.count(),
        prisma.answer.count(),
        prisma.participation.count(),
      ]);
      return { users, surveys, responses, answers, participations };
    }

    for (const route of PROTECTED_ROUTES) {
      const disallowedRoles = ALL_ROLES.filter((r) => !route.allowedRoles.includes(r));

      for (const disallowedRole of disallowedRoles) {
        it(`forbids ${disallowedRole} on [${route.method}] ${route.path} (403 FORBIDDEN, no data, no DB mutation)`, async () => {
          const resolvedPath = resolvePath(route.path);
          const beforeCounts = await getDbSnapshot();

          const req = (request(app) as any)[route.method.toLowerCase()](resolvedPath)
            .set('Authorization', `Bearer ${tokenByRole[disallowedRole]()}`);

          if (route.method === 'POST') {
            req.send({ answers: [], title: 'Unauthorized survey' });
          }

          const res = await req;

          expect(
            res.status,
            `Expected 403 FORBIDDEN for ${disallowedRole} on ${route.method} ${resolvedPath}`
          ).toBe(403);
          expect(res.body.error).toBeDefined();
          expect(res.body.error.code).toBe('FORBIDDEN');
          expect(res.body.data).toBeUndefined();
          expect(res.headers['x-request-id']).toBe(res.body.error.requestId);

          const afterCounts = await getDbSnapshot();
          expect(
            afterCounts,
            `Database mutated during unauthorized ${disallowedRole} call to ${route.method} ${resolvedPath}`
          ).toEqual(beforeCounts);
        });
      }
    }
  });

  describe('Server-Owned Fields Rejection (BR-08 strict body validation)', () => {
    it.each([
      ['role', 'ADMIN'],
      ['ownerId', '11111111-1111-1111-1111-111111111111'],
      ['userId', '22222222-2222-2222-2222-222222222222'],
      ['status', 'PUBLISHED'],
      ['submittedAt', '2026-11-14T10:00:00.000Z'],
    ])('rejects body containing server-owned field "%s" with 400 VALIDATION_ERROR on login', async (field, value) => {
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

    it.each([
      ['role', 'ADMIN'],
      ['ownerId', '11111111-1111-1111-1111-111111111111'],
      ['userId', '22222222-2222-2222-2222-222222222222'],
      ['status', 'PUBLISHED'],
      ['submittedAt', '2026-11-14T10:00:00.000Z'],
    ])('rejects server-owned field "%s" on F-02 mutation endpoints with 400 VALIDATION_ERROR', async (field, value) => {
      const draft = await createSurveyWithQuestions(ownerId, {
        title: 'Strict Target',
        status: 'DRAFT',
      });

      const createRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Attempt', [field]: value });
      expect(createRes.status).toBe(400);
      expect(createRes.body.error.code).toBe('VALIDATION_ERROR');

      const publishRes = await request(app)
        .post(`/api/v1/surveys/${draft.id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ [field]: value });
      expect(publishRes.status).toBe(400);
      expect(publishRes.body.error.code).toBe('VALIDATION_ERROR');

      const closeRes = await request(app)
        .post(`/api/v1/surveys/${draft.id}/close`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ [field]: value });
      expect(closeRes.status).toBe(400);
      expect(closeRes.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
