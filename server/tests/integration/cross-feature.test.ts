import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { clearDatabase } from '../helpers/db';
import { createUser } from '../helpers/factories';

describe('Cross-Feature Integration Tests (F-02, F-03, F-04)', () => {
  let owner1: { id: string; email: string };
  let resp1: { id: string; email: string };
  let resp2: { id: string; email: string };
  let resp3: { id: string; email: string };

  let owner1Token: string;
  let resp1Token: string;
  let resp2Token: string;
  let resp3Token: string;

  beforeEach(async () => {
    await clearDatabase();

    owner1 = await createUser({
      email: 'owner1-cross@example.edu',
      password: 'Password123!',
      role: 'SURVEY_OWNER',
    });
    resp1 = await createUser({
      email: 'resp1-cross@example.edu',
      displayName: 'Respondent One',
      password: 'Password123!',
      role: 'RESPONDENT',
    });
    resp2 = await createUser({
      email: 'resp2-cross@example.edu',
      displayName: 'Respondent Two',
      password: 'Password123!',
      role: 'RESPONDENT',
    });
    resp3 = await createUser({
      email: 'resp3-cross@example.edu',
      displayName: 'Respondent Three',
      password: 'Password123!',
      role: 'RESPONDENT',
    });

    const o1Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: owner1.email, password: 'Password123!' });
    const r1Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resp1.email, password: 'Password123!' });
    const r2Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resp2.email, password: 'Password123!' });
    const r3Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resp3.email, password: 'Password123!' });

    owner1Token = o1Login.body.data.token;
    resp1Token = r1Login.body.data.token;
    resp2Token = r2Login.body.data.token;
    resp3Token = r3Login.body.data.token;
  });

  describe('(a) TEST-F02-03: Publish -> Available Surveys visibility', () => {
    it('draft survey is invisible to respondents, becomes visible upon publication via HTTP', async () => {
      // 1. Owner creates a draft survey with valid questions
      const createRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({
          title: 'Lifecycle Cross Test Survey',
          questions: [
            {
              type: 'SINGLE_CHOICE',
              text: 'Are you ready?',
              required: true,
              options: [{ text: 'Yes' }, { text: 'No' }],
            },
          ],
        });
      expect(createRes.status).toBe(201);
      const surveyId = createRes.body.data.id;

      // 2. Before publish: Respondent browse available surveys does NOT list the draft
      const beforeListRes = await request(app)
        .get('/api/v1/available-surveys')
        .set('Authorization', `Bearer ${resp1Token}`);
      expect(beforeListRes.status).toBe(200);
      const beforeItems = beforeListRes.body.data;
      expect(beforeItems.some((s: any) => s.id === surveyId)).toBe(false);

      // 3. Before publish: Direct access to survey form returns 404
      const beforeFormRes = await request(app)
        .get(`/api/v1/available-surveys/${surveyId}`)
        .set('Authorization', `Bearer ${resp1Token}`);
      expect(beforeFormRes.status).toBe(404);
      expect(beforeFormRes.body.error.code).toBe('NOT_FOUND');

      // 4. Owner publishes the draft
      const publishRes = await request(app)
        .post(`/api/v1/surveys/${surveyId}/publish`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({});
      expect(publishRes.status).toBe(200);
      expect(publishRes.body.data.status).toBe('PUBLISHED');
      expect(publishRes.body.data.publishedAt).toBeDefined();

      // 5. After publish: Survey appears in respondent's available list
      const afterListRes = await request(app)
        .get('/api/v1/available-surveys')
        .set('Authorization', `Bearer ${resp1Token}`);
      expect(afterListRes.status).toBe(200);
      const afterItems = afterListRes.body.data;
      const found = afterItems.find((s: any) => s.id === surveyId);
      expect(found).toBeDefined();
      expect(found.title).toBe('Lifecycle Cross Test Survey');
      expect(found.alreadyResponded).toBe(false);

      // 6. After publish: Form endpoint returns complete question structure
      const afterFormRes = await request(app)
        .get(`/api/v1/available-surveys/${surveyId}`)
        .set('Authorization', `Bearer ${resp1Token}`);
      expect(afterFormRes.status).toBe(200);
      expect(afterFormRes.body.data.id).toBe(surveyId);
      expect(afterFormRes.body.data.questions).toHaveLength(1);
      expect(afterFormRes.body.data.questions[0].options).toHaveLength(2);
    });
  });

  describe('(b) TEST-F02-06: Close -> 409 on submit & hidden from Available Surveys', () => {
    it('closing survey removes it from available list and rejects subsequent submissions with 409 SURVEY_NOT_OPEN', async () => {
      // 1. Create and publish a survey
      const createRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({
          title: 'Close Behavior Survey',
          questions: [
            {
              type: 'RATING',
              text: 'Rate testing efficiency',
              required: true,
            },
          ],
        });
      const survey = createRes.body.data;
      const surveyId = survey.id;
      const ratingQ = survey.questions[0];

      await request(app)
        .post(`/api/v1/surveys/${surveyId}/publish`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({});

      // 2. resp1 successfully submits while open
      const submit1Res = await request(app)
        .post(`/api/v1/surveys/${surveyId}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({
          answers: [{ questionId: ratingQ.id, rating: 5 }],
        });
      expect(submit1Res.status).toBe(201);

      // 3. Owner closes the survey
      const closeRes = await request(app)
        .post(`/api/v1/surveys/${surveyId}/close`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({});
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.status).toBe('CLOSED');
      expect(closeRes.body.data.closedAt).toBeDefined();

      // 4. Closed survey is hidden from resp2's available surveys list
      const listRes = await request(app)
        .get('/api/v1/available-surveys')
        .set('Authorization', `Bearer ${resp2Token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((s: any) => s.id === surveyId)).toBe(false);

      // 5. resp2 attempts to submit to the closed survey -> 409 SURVEY_NOT_OPEN
      const submit2Res = await request(app)
        .post(`/api/v1/surveys/${surveyId}/responses`)
        .set('Authorization', `Bearer ${resp2Token}`)
        .send({
          answers: [{ questionId: ratingQ.id, rating: 4 }],
        });
      expect(submit2Res.status).toBe(409);
      expect(submit2Res.body.error.code).toBe('SURVEY_NOT_OPEN');

      // 6. resp1 can still retrieve their own past submission
      const myRespRes = await request(app)
        .get(`/api/v1/surveys/${surveyId}/my-response`)
        .set('Authorization', `Bearer ${resp1Token}`);
      expect(myRespRes.status).toBe(200);
      expect(myRespRes.body.data.surveyId).toBe(surveyId);
      expect(myRespRes.body.data.answers[0].rating).toBe(5);
    });
  });

  describe('(c) TEST-F04-02: 3 Real Submissions -> Aggregate Results Summary calculation', () => {
    it('computes exact aggregate count, percentages, and rating mean from 3 HTTP submissions', async () => {
      // 1. Owner creates survey with choice + rating
      const createRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({
          title: 'Course Aggregate Feedback',
          questions: [
            {
              type: 'SINGLE_CHOICE',
              text: 'Difficulty level?',
              required: true,
              options: [{ text: 'Easy' }, { text: 'Medium' }, { text: 'Hard' }],
            },
            {
              type: 'RATING',
              text: 'Overall course rating',
              required: true,
            },
          ],
        });
      expect(createRes.status).toBe(201);
      const survey = createRes.body.data;
      const surveyId = survey.id;
      const [qChoice, qRating] = survey.questions;
      const [optEasy, optMedium, optHard] = qChoice.options;

      // 2. Publish survey
      await request(app)
        .post(`/api/v1/surveys/${surveyId}/publish`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({});

      // 3. Submit 3 real responses via HTTP POST /surveys/:id/responses
      // resp1: Medium (optMedium), Rating 4
      const r1Res = await request(app)
        .post(`/api/v1/surveys/${surveyId}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({
          answers: [
            { questionId: qChoice.id, optionIds: [optMedium.id] },
            { questionId: qRating.id, rating: 4 },
          ],
        });
      expect(r1Res.status).toBe(201);

      // resp2: Medium (optMedium), Rating 5
      const r2Res = await request(app)
        .post(`/api/v1/surveys/${surveyId}/responses`)
        .set('Authorization', `Bearer ${resp2Token}`)
        .send({
          answers: [
            { questionId: qChoice.id, optionIds: [optMedium.id] },
            { questionId: qRating.id, rating: 5 },
          ],
        });
      expect(r2Res.status).toBe(201);

      // resp3: Hard (optHard), Rating 5
      const r3Res = await request(app)
        .post(`/api/v1/surveys/${surveyId}/responses`)
        .set('Authorization', `Bearer ${resp3Token}`)
        .send({
          answers: [
            { questionId: qChoice.id, optionIds: [optHard.id] },
            { questionId: qRating.id, rating: 5 },
          ],
        });
      expect(r3Res.status).toBe(201);

      // 4. Owner reads summary while survey is PUBLISHED
      const summaryPubRes = await request(app)
        .get(`/api/v1/surveys/${surveyId}/summary`)
        .set('Authorization', `Bearer ${owner1Token}`);
      expect(summaryPubRes.status).toBe(200);

      const pubSummary = summaryPubRes.body.data;
      expect(pubSummary.surveyId).toBe(surveyId);
      expect(pubSummary.title).toBe('Course Aggregate Feedback');
      expect(pubSummary.status).toBe('PUBLISHED');
      expect(pubSummary.totalResponses).toBe(3);
      expect(pubSummary.suppressed).toBe(false);

      // Question 1 (SINGLE_CHOICE) calculations:
      // Total answered: 3
      // Easy: 0 / 3 = 0.0%
      // Medium: 2 / 3 = 66.7%
      // Hard: 1 / 3 = 33.3%
      const q1Data = pubSummary.questions.find((q: any) => q.questionId === qChoice.id);
      expect(q1Data).toBeDefined();
      expect(q1Data.answered).toBe(3);
      expect(q1Data.options).toEqual([
        { optionId: optEasy.id, text: 'Easy', count: 0, percent: 0 },
        { optionId: optMedium.id, text: 'Medium', count: 2, percent: 66.7 },
        { optionId: optHard.id, text: 'Hard', count: 1, percent: 33.3 },
      ]);

      // Question 2 (RATING) calculations:
      // Ratings: [4, 5, 5] -> mean: (4+5+5)/3 = 14/3 = 4.67 (half-up rounded to 2 decimal places)
      // Distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 }
      const q2Data = pubSummary.questions.find((q: any) => q.questionId === qRating.id);
      expect(q2Data).toBeDefined();
      expect(q2Data.answered).toBe(3);
      expect(q2Data.mean).toBe(4.67);
      expect(q2Data.distribution).toEqual({ '1': 0, '2': 0, '3': 0, '4': 1, '5': 2 });

      // 5. Owner closes survey and re-checks summary
      await request(app)
        .post(`/api/v1/surveys/${surveyId}/close`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({});

      const summaryClosedRes = await request(app)
        .get(`/api/v1/surveys/${surveyId}/summary`)
        .set('Authorization', `Bearer ${owner1Token}`);
      expect(summaryClosedRes.status).toBe(200);

      const closedSummary = summaryClosedRes.body.data;
      expect(closedSummary.status).toBe('CLOSED');
      expect(closedSummary.totalResponses).toBe(3);
      expect(closedSummary.questions).toEqual(pubSummary.questions);

      // 6. Verify zero sensitive respondent PII in serialized summary body
      const rawSummary = JSON.stringify(summaryClosedRes.body);
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
      ]) {
        expect(rawSummary).not.toContain(sensitive);
      }
    });
  });
});
