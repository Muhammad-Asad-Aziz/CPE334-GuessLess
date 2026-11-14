import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { app } from '../../src/app';
import { clearDatabase } from '../helpers/db';
import { createUser, createSurveyWithQuestions, createResponse } from '../helpers/factories';
import { PROTECTED_ROUTES, PUBLIC_ROUTES, assertRoutesComplete } from '../helpers/routes';
import { getConfig } from '../../src/config/index';

describe('TEST-NFR-03: Token Authentication Sweep Across 14 Protected Endpoints (NFR-03, SDS 6)', () => {
  const config = getConfig();
  let surveyId: string;
  let responseId: string;
  let revokedToken: string;
  let expiredToken: string;
  let wrongSecretToken: string;

  beforeEach(async () => {
    await clearDatabase();

    // 1. Seed accounts
    const owner = await createUser({
      email: 'owner1@example.edu',
      password: 'Password123!',
      role: 'SURVEY_OWNER',
    });

    const resp1 = await createUser({
      email: 'resp1@example.edu',
      password: 'Password123!',
      role: 'RESPONDENT',
    });

    // 2. Create survey and response fixtures for valid path IDs
    const survey = await createSurveyWithQuestions(owner.id, {
      title: 'Auth Sweep Survey',
      status: 'PUBLISHED',
      questions: [
        {
          type: 'SINGLE_CHOICE',
          text: 'Rate testing',
          options: [{ text: 'Good' }, { text: 'Bad' }],
        },
      ],
    });
    surveyId = survey.id;

    const respObj = await createResponse(survey.id, resp1.id, [
      { questionId: survey.questions[0].id, optionId: survey.questions[0].options[0].id },
    ]);
    responseId = respObj.id;

    // 3. Log in as resp1 and then log out to obtain a real revoked token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resp1.email, password: 'Password123!' });
    expect(loginRes.status).toBe(200);
    const tokenToRevoke = loginRes.body.data.token;

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokenToRevoke}`);
    expect(logoutRes.status).toBe(204);
    revokedToken = tokenToRevoke;

    // 4. Token signed with wrong secret
    wrongSecretToken = jwt.sign(
      { sub: resp1.id, jti: crypto.randomUUID() },
      'wrong-secret-that-is-at-least-32-characters-long-12345'
    );

    // 5. Expired token
    expiredToken = jwt.sign(
      {
        sub: resp1.id,
        jti: crypto.randomUUID(),
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      },
      config.JWT_SECRET
    );
  });

  describe('Route Introspection & Completeness', () => {
    it('verifies that the Express app router stack matches the route specification', () => {
      expect(() => assertRoutesComplete(app)).not.toThrow();
    });

    it('fails when an Express app is missing a required protected route', () => {
      const incompleteApp = express();
      incompleteApp.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));
      expect(() => assertRoutesComplete(incompleteApp)).toThrow(
        /Registered router stack is missing protected route/
      );
    });

    it('fails when an Express app registers an undeclared /api/v1 route', () => {
      // Temporarily register an unlisted route directly on app
      app.get('/api/v1/unlisted-backdoor', (_req, res) => res.send('leak'));

      try {
        expect(() => assertRoutesComplete(app)).toThrow(
          /Express app has undeclared \/api\/v1 route not in PROTECTED_ROUTES or PUBLIC_ROUTES: GET \/api\/v1\/unlisted-backdoor/
        );
      } finally {
        // Pop the test route so app._router.stack remains clean
        (app as any)._router.stack.pop();
      }
    });
  });

  describe('Public Endpoints Accessibility (without token)', () => {
    it('allows GET /api/v1/health without token returning 200', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('allows POST /api/v1/auth/login without token reachable (400 validation error on empty body, not 401)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Sweep of 14 Protected Endpoints across 5 Invalid Token States (70 requests)', () => {
    const invalidTokenCases = [
      {
        name: 'missing Authorization header',
        getHeader: () => undefined,
      },
      {
        name: 'malformed Bearer header (Bearer not-a-jwt)',
        getHeader: () => 'Bearer not-a-jwt',
      },
      {
        name: 'token signed with wrong secret',
        getHeader: () => `Bearer ${wrongSecretToken}`,
      },
      {
        name: 'expired token',
        getHeader: () => `Bearer ${expiredToken}`,
      },
      {
        name: 'revoked token after logout',
        getHeader: () => `Bearer ${revokedToken}`,
      },
    ];

    function resolvePath(rawPath: string): string {
      return rawPath
        .replace(':id', surveyId)
        .replace(':responseId', responseId);
    }

    for (const route of PROTECTED_ROUTES) {
      for (const tokenCase of invalidTokenCases) {
        it(`rejects [${route.method}] ${route.path} with 401 UNAUTHENTICATED on ${tokenCase.name}`, async () => {
          const resolvedPath = resolvePath(route.path);
          const req = (request(app) as any)[route.method.toLowerCase()](resolvedPath);

          const authHeader = tokenCase.getHeader();
          if (authHeader) {
            req.set('Authorization', authHeader);
          }

          if (route.method === 'POST') {
            req.send({ answers: [] });
          }

          const res = await req;

          expect(
            res.status,
            `Expected 401 on ${route.method} ${resolvedPath} with ${tokenCase.name}, got ${res.status}`
          ).toBe(401);
          expect(res.body.error).toBeDefined();
          expect(res.body.error.code).toBe('UNAUTHENTICATED');
          expect(res.body.error.requestId).toBeDefined();
          expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
          expect(res.body.data).toBeUndefined();
        });
      }
    }
  });
});
