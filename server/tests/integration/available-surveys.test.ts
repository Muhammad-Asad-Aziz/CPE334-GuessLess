import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { clearDatabase } from '../helpers/db';
import {
  createUser,
  createSurvey,
  createQuestion,
  createOption,
  createParticipation,
} from '../helpers/factories';

describe('TEST-F03-03: Browse Available Surveys (FR-08, BR-02, AC-F03-03)', () => {
  let owner: any;
  let resp1: any;
  let resp1Token: string;
  let resp3: any;
  let resp3Token: string;
  let sPub: any;
  let sDraft: any;
  let sClosed: any;

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

    resp3 = await createUser({
      email: 'resp3@example.edu',
      password: 'Password1!',
      role: 'RESPONDENT',
    });

    const resp1Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resp1.email, password: 'Password1!' });
    resp1Token = resp1Login.body.data.token;

    const resp3Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resp3.email, password: 'Password1!' });
    resp3Token = resp3Login.body.data.token;

    // Fixtures
    sPub = await createSurvey(owner.id, {
      title: 'Published Survey',
      status: 'PUBLISHED',
      mode: 'IDENTIFIED',
    });
    const qPub = await createQuestion(sPub.id, { position: 1, type: 'RATING', text: 'Rate this' });
    await createOption(qPub.id, { position: 1, text: 'Opt 1' });

    sDraft = await createSurvey(owner.id, {
      title: 'Draft Survey',
      status: 'DRAFT',
    });
    await createQuestion(sDraft.id, { position: 1, type: 'RATING' });

    sClosed = await createSurvey(owner.id, {
      title: 'Closed Survey',
      status: 'CLOSED',
    });
    await createQuestion(sClosed.id, { position: 1, type: 'RATING' });

    // resp1 answered S-PUB; resp3 did not
    await createParticipation(sPub.id, resp1.id);
  });

  describe('Browse list (GET /api/v1/available-surveys)', () => {
    it('returns only open surveys with alreadyResponded flag', async () => {
      // resp1 has responded -> alreadyResponded: true
      const res1 = await request(app)
        .get('/api/v1/available-surveys')
        .set('Authorization', `Bearer ${resp1Token}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data.length).toBe(1);
      expect(res1.body.data[0].id).toBe(sPub.id);
      expect(res1.body.data[0].title).toBe('Published Survey');
      expect(res1.body.data[0].mode).toBe('IDENTIFIED');
      expect(res1.body.data[0].questionCount).toBe(1);
      expect(res1.body.data[0].alreadyResponded).toBe(true);

      // resp3 has not responded -> alreadyResponded: false
      const res3 = await request(app)
        .get('/api/v1/available-surveys')
        .set('Authorization', `Bearer ${resp3Token}`);

      expect(res3.status).toBe(200);
      expect(res3.body.data.length).toBe(1);
      expect(res3.body.data[0].id).toBe(sPub.id);
      expect(res3.body.data[0].alreadyResponded).toBe(false);
    });

    it('rejects pageSize > 100 with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/v1/available-surveys?pageSize=101')
        .set('Authorization', `Bearer ${resp1Token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Open survey form (GET /api/v1/available-surveys/:id)', () => {
    it('returns 404 NOT_FOUND when opening a DRAFT survey', async () => {
      const res = await request(app)
        .get(`/api/v1/available-surveys/${sDraft.id}`)
        .set('Authorization', `Bearer ${resp1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 SURVEY_NOT_OPEN when opening a CLOSED survey', async () => {
      const res = await request(app)
        .get(`/api/v1/available-surveys/${sClosed.id}`)
        .set('Authorization', `Bearer ${resp1Token}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SURVEY_NOT_OPEN');
    });

    it('returns 404 NOT_FOUND for non-UUID survey id', async () => {
      const res = await request(app)
        .get('/api/v1/available-surveys/not-a-uuid')
        .set('Authorization', `Bearer ${resp1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns survey questions and options in position order with alreadyResponded indicator', async () => {
      const res = await request(app)
        .get(`/api/v1/available-surveys/${sPub.id}`)
        .set('Authorization', `Bearer ${resp1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(sPub.id);
      expect(res.body.data.alreadyResponded).toBe(true);
      expect(res.body.data.questions.length).toBe(1);
      expect(res.body.data.questions[0].position).toBe(1);
      expect(res.body.data.questions[0].options.length).toBe(1);
    });
  });
});
