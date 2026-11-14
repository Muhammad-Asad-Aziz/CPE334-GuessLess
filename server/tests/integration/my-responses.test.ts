import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { clearDatabase } from '../helpers/db';
import {
  createUser,
  createSurvey,
  createQuestion,
  createOption,
} from '../helpers/factories';

describe('F-03 Respondent History & Retrieval Integration Tests', () => {
  let owner: any;
  let resp1: any;
  let resp1Token: string;
  let resp2: any;
  let resp2Token: string;
  let resp3: any;
  let resp3Token: string;
  let sPub: any;
  let q1: any;
  let q2: any;
  let o1: any;
  let o2: any;
  let r1Id: string;

  beforeEach(async () => {
    await clearDatabase();

    owner = await createUser({
      email: 'owner@example.edu',
      password: 'Password1!',
      role: 'SURVEY_OWNER',
    });

    resp1 = await createUser({
      email: 'resp1@example.edu',
      password: 'Password1!',
      role: 'RESPONDENT',
    });
    resp2 = await createUser({
      email: 'resp2@example.edu',
      password: 'Password1!',
      role: 'RESPONDENT',
    });
    resp3 = await createUser({
      email: 'resp3@example.edu',
      password: 'Password1!',
      role: 'RESPONDENT',
    });

    const l1 = await request(app).post('/api/v1/auth/login').send({ email: resp1.email, password: 'Password1!' });
    resp1Token = l1.body.data.token;

    const l2 = await request(app).post('/api/v1/auth/login').send({ email: resp2.email, password: 'Password1!' });
    resp2Token = l2.body.data.token;

    const l3 = await request(app).post('/api/v1/auth/login').send({ email: resp3.email, password: 'Password1!' });
    resp3Token = l3.body.data.token;

    // Fixture S-PUB
    sPub = await createSurvey(owner.id, {
      title: 'Course Evaluation S-PUB',
      status: 'PUBLISHED',
      mode: 'IDENTIFIED',
    });
    q1 = await createQuestion(sPub.id, { position: 1, type: 'SINGLE_CHOICE', text: 'Workload?' });
    o1 = await createOption(q1.id, { position: 1, text: 'Too light' });
    o2 = await createOption(q1.id, { position: 2, text: 'About right' });
    q2 = await createQuestion(sPub.id, { position: 2, type: 'RATING', text: 'Overall rating' });

    // resp1 submits R1 to S-PUB
    const submitRes = await request(app)
      .post(`/api/v1/surveys/${sPub.id}/responses`)
      .set('Authorization', `Bearer ${resp1Token}`)
      .send({
        answers: [
          { questionId: q1.id, optionIds: [o2.id] },
          { questionId: q2.id, rating: 4 },
        ],
      });
    expect(submitRes.status).toBe(201);
    r1Id = submitRes.body.data.responseId;
  });

  describe('TEST-F03-04: View Own Submission (AC-F03-04, FR-09)', () => {
    it('retrieves submission answers and submittedAt by surveyId and responseId, even after survey closes', async () => {
      // 1. By surveyId
      const bySurvey = await request(app)
        .get(`/api/v1/surveys/${sPub.id}/my-response`)
        .set('Authorization', `Bearer ${resp1Token}`);

      expect(bySurvey.status).toBe(200);
      expect(bySurvey.body.data.responseId).toBe(r1Id);
      expect(bySurvey.body.data.surveyId).toBe(sPub.id);
      expect(bySurvey.body.data.title).toBe('Course Evaluation S-PUB');
      expect(bySurvey.body.data.mode).toBe('IDENTIFIED');
      expect(bySurvey.body.data.answers.length).toBe(2);

      const q1Ans = bySurvey.body.data.answers.find((a: any) => a.questionId === q1.id);
      expect(q1Ans.selectedOptions[0].text).toBe('About right');
      const q2Ans = bySurvey.body.data.answers.find((a: any) => a.questionId === q2.id);
      expect(q2Ans.rating).toBe(4);

      // 2. By responseId
      const byResponseId = await request(app)
        .get(`/api/v1/responses/${r1Id}`)
        .set('Authorization', `Bearer ${resp1Token}`);

      expect(byResponseId.status).toBe(200);
      expect(byResponseId.body.data).toEqual(bySurvey.body.data);

      // 3. Owner closes survey -> respondent can still retrieve submission
      await prisma.survey.update({
        where: { id: sPub.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      const afterClose = await request(app)
        .get(`/api/v1/surveys/${sPub.id}/my-response`)
        .set('Authorization', `Bearer ${resp1Token}`);
      expect(afterClose.status).toBe(200);
      expect(afterClose.body.data.responseId).toBe(r1Id);
    });

    it('returns 404 NOT_FOUND when respondent has not answered survey', async () => {
      const res = await request(app)
        .get(`/api/v1/surveys/${sPub.id}/my-response`)
        .set('Authorization', `Bearer ${resp3Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when attempting to view another respondent response by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/responses/${r1Id}`)
        .set('Authorization', `Bearer ${resp2Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.data).toBeUndefined();
    });
  });

  describe('TEST-F03-08: Cross-Respondent Access Isolation (BR-07, AC-F03-08)', () => {
    it('strictly isolates respondent submissions across respondents', async () => {
      // resp2 submits R2 to S-PUB
      const r2Res = await request(app)
        .post(`/api/v1/surveys/${sPub.id}/responses`)
        .set('Authorization', `Bearer ${resp2Token}`)
        .send({
          answers: [
            { questionId: q1.id, optionIds: [o1.id] },
            { questionId: q2.id, rating: 2 },
          ],
        });
      const r2Id = r2Res.body.data.responseId;

      // resp2 reading R1 -> 404 with no R1 data or resp1 identity
      const resp2ReadsR1 = await request(app)
        .get(`/api/v1/responses/${r1Id}`)
        .set('Authorization', `Bearer ${resp2Token}`);
      expect(resp2ReadsR1.status).toBe(404);
      expect(JSON.stringify(resp2ReadsR1.body)).not.toContain('resp1');
      expect(JSON.stringify(resp2ReadsR1.body)).not.toContain('About right');

      // resp2 reading my-response -> returns R2
      const resp2MyResponse = await request(app)
        .get(`/api/v1/surveys/${sPub.id}/my-response`)
        .set('Authorization', `Bearer ${resp2Token}`);
      expect(resp2MyResponse.status).toBe(200);
      expect(resp2MyResponse.body.data.responseId).toBe(r2Id);

      // resp2 listing my-responses -> 1 item (R2 only)
      const resp2List = await request(app)
        .get('/api/v1/my-responses')
        .set('Authorization', `Bearer ${resp2Token}`);
      expect(resp2List.status).toBe(200);
      expect(resp2List.body.data.length).toBe(1);
      expect(resp2List.body.data[0].responseId).toBe(r2Id);
    });
  });

  describe('TEST-F03-09: Respondent Lists Own Responses Including Closed Surveys (FR-09, AC-F03-09)', () => {
    it('lists all answered surveys including closed surveys with Bangkok participatedDay', async () => {
      // Survey T (will be closed)
      const surveyT = await createSurvey(owner.id, {
        title: 'Survey T',
        status: 'PUBLISHED',
      });
      const qT = await createQuestion(surveyT.id, { position: 1, type: 'RATING' });

      // resp1 submits to Survey T
      await request(app)
        .post(`/api/v1/surveys/${surveyT.id}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({ answers: [{ questionId: qT.id, rating: 5 }] });

      // Owner closes Survey T
      await prisma.survey.update({
        where: { id: surveyT.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      // resp2 submits to S-PUB
      await request(app)
        .post(`/api/v1/surveys/${sPub.id}/responses`)
        .set('Authorization', `Bearer ${resp2Token}`)
        .send({ answers: [{ questionId: q1.id, optionIds: [o1.id] }, { questionId: q2.id, rating: 3 }] });

      // resp1 calls GET /api/v1/my-responses
      const res = await request(app)
        .get('/api/v1/my-responses')
        .set('Authorization', `Bearer ${resp1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);

      const sPubItem = res.body.data.find((item: any) => item.surveyId === sPub.id);
      expect(sPubItem).toBeDefined();
      expect(sPubItem.status).toBe('PUBLISHED');
      expect(sPubItem.participatedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(sPubItem.responseId).toBe(r1Id);

      const sTItem = res.body.data.find((item: any) => item.surveyId === surveyT.id);
      expect(sTItem).toBeDefined();
      expect(sTItem.status).toBe('CLOSED');
      expect(sTItem.participatedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify resp3 has answered nothing -> empty list
      const resp3Res = await request(app)
        .get('/api/v1/my-responses')
        .set('Authorization', `Bearer ${resp3Token}`);

      expect(resp3Res.status).toBe(200);
      expect(resp3Res.body.data).toEqual([]);
      expect(resp3Res.body.meta.total).toBe(0);
    });
  });
});
