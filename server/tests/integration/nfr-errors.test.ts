import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { clearDatabase } from '../helpers/db';
import { createUser, createSurveyWithQuestions } from '../helpers/factories';

describe('TEST-NFR-08: Safe Error Handling & Leak Scan (NFR-08, SDS 5.2)', () => {
  let owner1: { id: string; email: string };
  let owner2: { id: string; email: string };
  let resp1: { id: string; email: string };
  let owner1Token: string;
  let owner2Token: string;
  let resp1Token: string;
  let sPub: { id: string; questions: any[] };

  beforeEach(async () => {
    await clearDatabase();

    owner1 = await createUser({
      email: 'owner1-err@example.edu',
      password: 'Password123!',
      role: 'SURVEY_OWNER',
    });
    owner2 = await createUser({
      email: 'owner2-err@example.edu',
      password: 'Password123!',
      role: 'SURVEY_OWNER',
    });
    resp1 = await createUser({
      email: 'resp1-err@example.edu',
      password: 'Password123!',
      role: 'RESPONDENT',
    });

    const o1Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: owner1.email, password: 'Password123!' });
    const o2Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: owner2.email, password: 'Password123!' });
    const r1Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resp1.email, password: 'Password123!' });

    owner1Token = o1Login.body.data.token;
    owner2Token = o2Login.body.data.token;
    resp1Token = r1Login.body.data.token;

    sPub = await createSurveyWithQuestions(owner1.id, {
      title: 'Published Survey For Errors',
      status: 'PUBLISHED',
      questions: [
        {
          type: 'SINGLE_CHOICE',
          text: 'Favorite Language?',
          options: [{ text: 'TypeScript' }, { text: 'Other' }],
        },
        {
          type: 'RATING',
          text: 'Rate quality',
        },
      ],
    });
  });

  /**
   * Asserts the standard error contract and scans response body for sensitive markers.
   */
  function assertSafeErrorResponse(
    res: request.Response,
    expectedStatusCode: number,
    expectedCode: string,
    sensitiveContext: { otherUserEmail?: string } = {}
  ) {
    expect(res.status).toBe(expectedStatusCode);

    // 1. Central error shape contract
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', expectedCode);
    expect(res.body.error).toHaveProperty('message');
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error).toHaveProperty('requestId');
    expect(typeof res.body.error.requestId).toBe('string');
    expect(res.body.data).toBeUndefined();

    // 2. Correlation ID matching header
    const requestIdHeader = res.headers['x-request-id'];
    expect(requestIdHeader).toBeDefined();
    expect(requestIdHeader).toBe(res.body.error.requestId);

    // 3. Sensitive Data Leak Scan
    const rawBody = JSON.stringify(res.body);

    // No stack frames: "at Function.xyz (file.ts:1:2)"
    expect(rawBody).not.toMatch(/\bat\s+.*\([^)]+:\d+:\d+\)/i);
    // No SQL queries
    expect(rawBody).not.toMatch(/\bSELECT\b/i);
    expect(rawBody).not.toMatch(/\bINSERT\b/i);
    // No ORM identifiers
    expect(rawBody.toLowerCase()).not.toContain('prisma');
    // No filesystem paths
    expect(rawBody).not.toContain('/src/');
    expect(rawBody).not.toContain('\\src\\');
    expect(rawBody).not.toContain('node_modules');
    // No password hashes ($2b$, $2a$, $2y$)
    expect(rawBody).not.toMatch(/\$2[aby]\$\d{2}\$/);

    // No other user's private email
    if (sensitiveContext.otherUserEmail) {
      expect(rawBody).not.toContain(sensitiveContext.otherUserEmail);
    }
  }

  // 1. Malformed JSON
  it('1. handles malformed JSON safely without leaks (400 VALIDATION_ERROR)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ "email": "broken-json", ');

    assertSafeErrorResponse(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.message).toContain('Malformed JSON');
  });

  // 2. Wrong Content-Type
  it('2. handles wrong Content-Type / invalid payload safely (400 VALIDATION_ERROR)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'text/plain')
      .send('not a json string');

    assertSafeErrorResponse(res, 400, 'VALIDATION_ERROR');
  });

  // 3. Non-UUID path id
  it('3. handles non-UUID path id safely with 404 NOT_FOUND', async () => {
    const res = await request(app)
      .get('/api/v1/surveys/not-a-valid-uuid')
      .set('Authorization', `Bearer ${owner1Token}`);

    assertSafeErrorResponse(res, 404, 'NOT_FOUND');
    expect(res.body.error.message).toBe('Survey not found.');
  });

  // 4. Unknown route
  it('4. handles unknown route safely with 404 NOT_FOUND', async () => {
    const res = await request(app)
      .get('/api/v1/completely-unknown-endpoint')
      .set('Authorization', `Bearer ${owner1Token}`);

    assertSafeErrorResponse(res, 404, 'NOT_FOUND');
    expect(res.body.error.message).toContain('not found');
  });

  // 5. Invalid answers
  it('5. handles invalid submission answers safely with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post(`/api/v1/surveys/${sPub.id}/responses`)
      .set('Authorization', `Bearer ${resp1Token}`)
      .send({
        answers: [
          {
            questionId: sPub.questions[1].id,
            rating: 99, // out of bounds: 1-5
          },
        ],
      });

    assertSafeErrorResponse(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  // 6. Missing token
  it('6. handles missing authentication safely with 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/v1/surveys');

    assertSafeErrorResponse(res, 401, 'UNAUTHENTICATED');
  });

  // 7. Wrong role
  it('7. handles forbidden role safely with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/v1/surveys')
      .set('Authorization', `Bearer ${resp1Token}`)
      .send({ title: 'Forbidden for Respondent' });

    assertSafeErrorResponse(res, 403, 'FORBIDDEN');
  });

  // 8. Another owner's survey
  it('8. handles access to another owner\'s survey safely with 404 NOT_FOUND and zero PII leaks', async () => {
    const res = await request(app)
      .get(`/api/v1/surveys/${sPub.id}`)
      .set('Authorization', `Bearer ${owner2Token}`);

    assertSafeErrorResponse(res, 404, 'NOT_FOUND', {
      otherUserEmail: owner1.email,
    });
    // Ensure survey title or questions of owner1 are never revealed to owner2
    expect(JSON.stringify(res.body)).not.toContain(sPub.title);
  });

  // 9. Real forced 500 INTERNAL_ERROR
  it('9. handles forced internal server error safely with generic message (500 INTERNAL_ERROR)', async () => {
    // Inject test answer writer failure hook into app.locals
    app.locals.testAnswerWriter = async () => {
      throw new Error('Fatal connection to database failed: SELECT * FROM password_hashes WHERE secret = $2b$12$fake');
    };

    try {
      const q1 = sPub.questions[0];
      const q2 = sPub.questions[1];

      const res = await request(app)
        .post(`/api/v1/surveys/${sPub.id}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({
          answers: [
            { questionId: q1.id, optionIds: [q1.options[0].id] },
            { questionId: q2.id, rating: 5 },
          ],
        });

      assertSafeErrorResponse(res, 500, 'INTERNAL_ERROR');
      expect(res.body.error.message).toBe('An unexpected error occurred.');

      // Ensure injected secret/SQL did not leak
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('Fatal connection');
      expect(raw).not.toContain('password_hashes');
      expect(raw).not.toContain('SELECT');
      expect(raw).not.toContain('$2b$');
    } finally {
      delete app.locals.testAnswerWriter;
    }
  });
});
