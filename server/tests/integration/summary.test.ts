import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app';
import { clearDatabase } from '../helpers/db';
import {
  createUser,
  createSurveyWithQuestions,
  createResponse,
} from '../helpers/factories';

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

describe('F-04 Aggregate Survey Results Summary Integration Tests', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe('TEST-F04-02: summary values, empty, and draft (AC-F04-02, FR-04)', () => {
    it('returns exact aggregate metrics before and after close with zero respondent PII', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        displayName: 'Owner One',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const resp1 = await createUser({
        email: 'resp1@example.edu',
        displayName: 'Respondent One',
        password: 'Password123!',
        role: 'RESPONDENT',
      });
      const resp2 = await createUser({
        email: 'resp2@example.edu',
        displayName: 'Respondent Two',
        password: 'Password123!',
        role: 'RESPONDENT',
      });
      const resp3 = await createUser({
        email: 'resp3@example.edu',
        displayName: 'Respondent Three',
        password: 'Password123!',
        role: 'RESPONDENT',
      });

      const survey = await createSurveyWithQuestions(owner1.id, {
        title: 'Seed: CPE334 Course Evaluation',
        status: 'PUBLISHED',
        questions: [
          {
            type: 'SINGLE_CHOICE',
            text: 'How was the lab workload?',
            required: true,
            options: [
              { text: 'Too light' },
              { text: 'About right' },
              { text: 'Too heavy' },
            ],
          },
          {
            type: 'RATING',
            text: 'Rate the course overall',
            required: true,
          },
        ],
      });

      const q1 = survey.questions[0];
      const q2 = survey.questions[1];
      const [optLight, optRight, optHeavy] = q1.options;

      // Seed 3 responses directly via factory: Q1 = About right, About right, Too heavy; Q2 = 4, 5, 5
      await createResponse(survey.id, resp1.id, [
        { questionId: q1.id, optionId: optRight.id },
        { questionId: q2.id, ratingValue: 4 },
      ]);
      await createResponse(survey.id, resp2.id, [
        { questionId: q1.id, optionId: optRight.id },
        { questionId: q2.id, ratingValue: 5 },
      ]);
      await createResponse(survey.id, resp3.id, [
        { questionId: q1.id, optionId: optHeavy.id },
        { questionId: q2.id, ratingValue: 5 },
      ]);

      const ownerToken = await loginAs(owner1.email);

      const pubRes = await request(app)
        .get(`/api/v1/surveys/${survey.id}/summary`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(pubRes.status).toBe(200);
      expect(pubRes.headers['x-request-id']).toBeTruthy();

      const pubData = pubRes.body.data;
      expect(pubData).toEqual({
        surveyId: survey.id,
        title: 'Seed: CPE334 Course Evaluation',
        status: 'PUBLISHED',
        totalResponses: 3,
        suppressed: false,
        suppressionReason: null,
        questions: [
          {
            questionId: q1.id,
            position: 1,
            text: 'How was the lab workload?',
            type: 'SINGLE_CHOICE',
            answered: 3,
            options: [
              { optionId: optLight.id, text: 'Too light', count: 0, percent: 0 },
              { optionId: optRight.id, text: 'About right', count: 2, percent: 66.7 },
              { optionId: optHeavy.id, text: 'Too heavy', count: 1, percent: 33.3 },
            ],
          },
          {
            questionId: q2.id,
            position: 2,
            text: 'Rate the course overall',
            type: 'RATING',
            answered: 3,
            mean: 4.67,
            distribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 2 },
          },
        ],
      });

      const serialized = JSON.stringify(pubRes.body);
      for (const sensitive of [
        resp1.id,
        resp2.id,
        resp3.id,
        resp1.displayName,
        resp2.displayName,
        resp3.displayName,
        resp1.email,
        resp2.email,
        resp3.email,
        owner1.id,
      ]) {
        expect(serialized).not.toContain(sensitive);
      }

      // Close survey and verify identical summary metrics with CLOSED status
      const closeRes = await request(app)
        .post(`/api/v1/surveys/${survey.id}/close`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(closeRes.status).toBe(200);

      const closedRes = await request(app)
        .get(`/api/v1/surveys/${survey.id}/summary`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(closedRes.status).toBe(200);
      expect(closedRes.body.data).toEqual({
        ...pubData,
        status: 'CLOSED',
      });
    });

    it('returns 200 with zero counts and null percentages/means for an empty published survey', async () => {
      const owner1 = await createUser({
        email: 'owner-empty@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });

      const emptySurvey = await createSurveyWithQuestions(owner1.id, {
        title: 'Empty Published Survey',
        status: 'PUBLISHED',
        questions: [
          {
            type: 'SINGLE_CHOICE',
            text: 'Did you attend?',
            required: true,
            options: [{ text: 'Yes' }, { text: 'No' }],
          },
          {
            type: 'RATING',
            text: 'Overall score',
            required: true,
          },
        ],
      });

      const ownerToken = await loginAs(owner1.email);
      const res = await request(app)
        .get(`/api/v1/surveys/${emptySurvey.id}/summary`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        surveyId: emptySurvey.id,
        title: 'Empty Published Survey',
        status: 'PUBLISHED',
        totalResponses: 0,
        suppressed: false,
        suppressionReason: null,
        questions: [
          {
            questionId: emptySurvey.questions[0].id,
            position: 1,
            text: 'Did you attend?',
            type: 'SINGLE_CHOICE',
            answered: 0,
            options: [
              {
                optionId: emptySurvey.questions[0].options[0].id,
                text: 'Yes',
                count: 0,
                percent: null,
              },
              {
                optionId: emptySurvey.questions[0].options[1].id,
                text: 'No',
                count: 0,
                percent: null,
              },
            ],
          },
          {
            questionId: emptySurvey.questions[1].id,
            position: 2,
            text: 'Overall score',
            type: 'RATING',
            answered: 0,
            mean: null,
            distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
          },
        ],
      });
    });

    it('computes optional question percentages over answered count and respects closeAt effective status', async () => {
      const owner1 = await createUser({
        email: 'owner-opt@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const resp1 = await createUser({
        email: 'resp-opt1@example.edu',
        password: 'Password123!',
        role: 'RESPONDENT',
      });
      const resp2 = await createUser({
        email: 'resp-opt2@example.edu',
        password: 'Password123!',
        role: 'RESPONDENT',
      });

      const survey = await createSurveyWithQuestions(owner1.id, {
        title: 'Optional & Past CloseAt Survey',
        status: 'PUBLISHED',
        closeAt: new Date(Date.now() - 60_000),
        questions: [
          {
            type: 'SINGLE_CHOICE',
            text: 'Required choice',
            required: true,
            options: [{ text: 'A' }, { text: 'B' }],
          },
          {
            type: 'SINGLE_CHOICE',
            text: 'Optional choice',
            required: false,
            options: [{ text: 'X' }, { text: 'Y' }],
          },
          {
            type: 'RATING',
            text: 'Optional rating',
            required: false,
          },
        ],
      });

      const [qReq, qOptChoice, qOptRating] = survey.questions;

      await createResponse(survey.id, resp1.id, [
        { questionId: qReq.id, optionId: qReq.options[0].id },
        { questionId: qOptChoice.id, optionId: qOptChoice.options[0].id },
      ]);
      await createResponse(survey.id, resp2.id, [
        { questionId: qReq.id, optionId: qReq.options[1].id },
      ]);

      const ownerToken = await loginAs(owner1.email);
      const res = await request(app)
        .get(`/api/v1/surveys/${survey.id}/summary`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CLOSED');
      expect(res.body.data.totalResponses).toBe(2);
      expect(res.body.data.questions[1]).toMatchObject({
        questionId: qOptChoice.id,
        answered: 1,
        options: [
          { text: 'X', count: 1, percent: 100 },
          { text: 'Y', count: 0, percent: 0 },
        ],
      });
      expect(res.body.data.questions[2]).toMatchObject({
        questionId: qOptRating.id,
        answered: 0,
        mean: null,
        distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      });
    });

    it('rejects summary requests for own DRAFT survey with 409 SURVEY_NOT_PUBLISHED', async () => {
      const owner1 = await createUser({
        email: 'owner-draft@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });

      const draft = await createSurveyWithQuestions(owner1.id, {
        title: 'Seed: Workshop Feedback',
        status: 'DRAFT',
        questions: [{ type: 'RATING', text: 'Rate the workshop', required: true }],
      });

      const ownerToken = await loginAs(owner1.email);
      const res = await request(app)
        .get(`/api/v1/surveys/${draft.id}/summary`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.data).toBeUndefined();
      expect(res.body.error.code).toBe('SURVEY_NOT_PUBLISHED');
      expect(res.body.error.requestId).toBeTruthy();
      expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
    });
  });

  describe('TEST-F04-03: other owner isolation (AC-F04-03, BR-05)', () => {
    it('returns identical 404 NOT_FOUND for another owner survey, random UUID, and non-UUID', async () => {
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
      const resp1 = await createUser({
        email: 'resp1@example.edu',
        password: 'Password123!',
        role: 'RESPONDENT',
      });

      const pubSurvey = await createSurveyWithQuestions(owner1.id, {
        title: 'Confidential Owner1 Published',
        status: 'PUBLISHED',
        questions: [{ type: 'RATING', text: 'Secret Owner1 Question' }],
      });
      const draftSurvey = await createSurveyWithQuestions(owner1.id, {
        title: 'Confidential Owner1 Draft',
        status: 'DRAFT',
        questions: [{ type: 'RATING', text: 'Secret Draft Question' }],
      });

      await createResponse(pubSurvey.id, resp1.id, [
        { questionId: pubSurvey.questions[0].id, ratingValue: 5 },
      ]);

      const owner2Token = await loginAs(owner2.email);
      const missingUuid = crypto.randomUUID();

      const otherPubRes = await request(app)
        .get(`/api/v1/surveys/${pubSurvey.id}/summary`)
        .set('Authorization', `Bearer ${owner2Token}`);
      const otherDraftRes = await request(app)
        .get(`/api/v1/surveys/${draftSurvey.id}/summary`)
        .set('Authorization', `Bearer ${owner2Token}`);
      const missingRes = await request(app)
        .get(`/api/v1/surveys/${missingUuid}/summary`)
        .set('Authorization', `Bearer ${owner2Token}`);
      const invalidRes = await request(app)
        .get('/api/v1/surveys/not-a-uuid/summary')
        .set('Authorization', `Bearer ${owner2Token}`);

      for (const res of [otherPubRes, otherDraftRes, missingRes, invalidRes]) {
        expect(res.status).toBe(404);
        expect(res.body.data).toBeUndefined();
        expect(res.body.error.code).toBe('NOT_FOUND');
        expect(res.body.error.requestId).toBeTruthy();
        expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
        expect(JSON.stringify(res.body)).not.toContain('Confidential Owner1');
        expect(JSON.stringify(res.body)).not.toContain('Secret Owner1 Question');
        expect(JSON.stringify(res.body)).not.toContain(owner1.id);
      }

      expect(stripRequestId(otherPubRes.body)).toEqual(stripRequestId(missingRes.body));
      expect(stripRequestId(otherDraftRes.body)).toEqual(stripRequestId(missingRes.body));
      expect(stripRequestId(invalidRes.body)).toEqual(stripRequestId(missingRes.body));
    });
  });

  describe('TEST-F04-04: wrong role denied (AC-F04-04, BR-07, BR-08)', () => {
    it('returns 403 FORBIDDEN for respondent who answered, respondent who did not answer, and admin', async () => {
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
      const resp3 = await createUser({
        email: 'resp3@example.edu',
        password: 'Password123!',
        role: 'RESPONDENT',
      });
      const admin1 = await createUser({
        email: 'admin1@example.edu',
        password: 'Password123!',
        role: 'ADMIN',
      });

      const survey = await createSurveyWithQuestions(owner1.id, {
        title: 'Restricted Summary Survey',
        status: 'PUBLISHED',
        questions: [{ type: 'RATING', text: 'Rate course' }],
      });

      await createResponse(survey.id, resp1.id, [
        { questionId: survey.questions[0].id, ratingValue: 4 },
      ]);

      const resp1Token = await loginAs(resp1.email);
      const resp3Token = await loginAs(resp3.email);
      const adminToken = await loginAs(admin1.email);

      for (const token of [resp1Token, resp3Token, adminToken]) {
        const res = await request(app)
          .get(`/api/v1/surveys/${survey.id}/summary`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
        expect(res.body.data).toBeUndefined();
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect(res.body.error.requestId).toBeTruthy();
        expect(JSON.stringify(res.body)).not.toContain('Restricted Summary Survey');
        expect(JSON.stringify(res.body)).not.toContain('Rate course');
      }
    });
  });
});
