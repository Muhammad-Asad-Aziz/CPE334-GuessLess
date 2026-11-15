import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { clearDatabase } from '../helpers/db';
import { createUser, createSurveyWithQuestions } from '../helpers/factories';

async function loginAs(email: string, password: string = 'Password123!') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

function stripRequestId(body: any) {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...body };
  if (copy.error && typeof copy.error === 'object') {
    const { requestId: _omit, ...restError } = copy.error;
    copy.error = restError;
  }
  return copy;
}

describe('TEST-F02-09: Survey Ownership & Visibility Isolation (AC-F02-09, BR-05, NFR-05)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('returns identical 404 NOT_FOUND (apart from requestId) for another owner survey, random UUID, and non-UUID', async () => {
    const owner1 = await createUser({
      email: 'owner1@example.edu',
      password: 'Password123!',
      role: 'SURVEY_OWNER',
    });
    const owner2 = await createUser({
      email: 'owner2@example.edu',
      password: 'Password123!',
      role: 'SURVEY_OWNER',
    });

    const draftSurvey = await createSurveyWithQuestions(owner1.id, {
      title: 'Confidential Draft Title',
      status: 'DRAFT',
      questions: [{ type: 'RATING', text: 'Secret Question' }],
    });
    const pubSurvey = await createSurveyWithQuestions(owner1.id, {
      title: 'Confidential Published Title',
      status: 'PUBLISHED',
      questions: [{ type: 'RATING', text: 'Secret Question' }],
    });

    const owner2Token = await loginAs(owner2.email);
    const missingId = crypto.randomUUID();

    // 1. GET /surveys/:id
    const otherGet = await request(app)
      .get(`/api/v1/surveys/${draftSurvey.id}`)
      .set('Authorization', `Bearer ${owner2Token}`);
    const missingGet = await request(app)
      .get(`/api/v1/surveys/${missingId}`)
      .set('Authorization', `Bearer ${owner2Token}`);
    const invalidGet = await request(app)
      .get('/api/v1/surveys/not-a-uuid')
      .set('Authorization', `Bearer ${owner2Token}`);

    expect(otherGet.status).toBe(404);
    expect(missingGet.status).toBe(404);
    expect(invalidGet.status).toBe(404);
    expect(otherGet.body.error.code).toBe('NOT_FOUND');
    expect(otherGet.body.error.requestId).toBeTruthy();
    expect(otherGet.headers['x-request-id']).toBe(otherGet.body.error.requestId);
    expect(JSON.stringify(otherGet.body)).not.toContain(owner1.id);
    expect(JSON.stringify(otherGet.body)).not.toContain('Confidential Draft Title');
    expect(JSON.stringify(otherGet.body)).not.toContain('Secret Question');
    expect(stripRequestId(otherGet.body)).toEqual(stripRequestId(missingGet.body));
    expect(stripRequestId(invalidGet.body)).toEqual(stripRequestId(missingGet.body));

    // 2. POST /surveys/:id/publish
    const otherPublish = await request(app)
      .post(`/api/v1/surveys/${draftSurvey.id}/publish`)
      .set('Authorization', `Bearer ${owner2Token}`);
    const missingPublish = await request(app)
      .post(`/api/v1/surveys/${missingId}/publish`)
      .set('Authorization', `Bearer ${owner2Token}`);
    const invalidPublish = await request(app)
      .post('/api/v1/surveys/not-a-uuid/publish')
      .set('Authorization', `Bearer ${owner2Token}`);

    expect(otherPublish.status).toBe(404);
    expect(missingPublish.status).toBe(404);
    expect(invalidPublish.status).toBe(404);
    expect(stripRequestId(otherPublish.body)).toEqual(stripRequestId(missingPublish.body));
    expect(stripRequestId(invalidPublish.body)).toEqual(stripRequestId(missingPublish.body));

    // 3. POST /surveys/:id/close
    const otherClose = await request(app)
      .post(`/api/v1/surveys/${pubSurvey.id}/close`)
      .set('Authorization', `Bearer ${owner2Token}`);
    const missingClose = await request(app)
      .post(`/api/v1/surveys/${missingId}/close`)
      .set('Authorization', `Bearer ${owner2Token}`);
    const invalidClose = await request(app)
      .post('/api/v1/surveys/not-a-uuid/close')
      .set('Authorization', `Bearer ${owner2Token}`);

    expect(otherClose.status).toBe(404);
    expect(missingClose.status).toBe(404);
    expect(invalidClose.status).toBe(404);
    expect(stripRequestId(otherClose.body)).toEqual(stripRequestId(missingClose.body));
    expect(stripRequestId(invalidClose.body)).toEqual(stripRequestId(missingClose.body));

    // Verify owner1's surveys remained completely untouched in PostgreSQL
    const dbDraft = await prisma.survey.findUnique({ where: { id: draftSurvey.id } });
    const dbPub = await prisma.survey.findUnique({ where: { id: pubSurvey.id } });
    expect(dbDraft!.status).toBe('DRAFT');
    expect(dbDraft!.publishedAt).toBeNull();
    expect(dbPub!.status).toBe('PUBLISHED');
    expect(dbPub!.closedAt).toBeNull();
  });

  it('forbids RESPONDENT and ADMIN from accessing any owner survey route (403 FORBIDDEN)', async () => {
    const owner1 = await createUser({
      email: 'owner1@example.edu',
      password: 'Password123!',
      role: 'SURVEY_OWNER',
    });
    const resp1 = await createUser({
      email: 'resp1@example.edu',
      password: 'Password123!',
      role: 'RESPONDENT',
    });
    const admin1 = await createUser({
      email: 'admin1@example.edu',
      password: 'Password123!',
      role: 'ADMIN',
    });

    const survey = await createSurveyWithQuestions(owner1.id, {
      title: 'Owner Survey',
      status: 'DRAFT',
    });

    const respToken = await loginAs(resp1.email);
    const adminToken = await loginAs(admin1.email);

    const respGet = await request(app)
      .get(`/api/v1/surveys/${survey.id}`)
      .set('Authorization', `Bearer ${respToken}`);
    expect(respGet.status).toBe(403);
    expect(respGet.body.error.code).toBe('FORBIDDEN');

    const adminGet = await request(app)
      .get(`/api/v1/surveys/${survey.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminGet.status).toBe(403);
    expect(adminGet.body.error.code).toBe('FORBIDDEN');
  });
});
