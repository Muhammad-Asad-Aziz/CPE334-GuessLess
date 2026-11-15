import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
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

describe('F-02 Owner Survey Lifecycle Integration Tests', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe('TEST-F02-02: create & retrieve draft (AC-F02-02, FR-01, BR-08)', () => {
    it('creates a complete draft with ordered questions/options, persists ownerId, and returns detail without ownerId', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner1.email);

      const createRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Lab feedback',
          description: 'Week 10 lab evaluation',
          mode: 'IDENTIFIED',
          questions: [
            {
              type: 'SINGLE_CHOICE',
              text: 'Was the lab clear?',
              required: true,
              options: [{ text: 'Yes' }, { text: 'No' }],
            },
            {
              type: 'RATING',
              text: 'Rate the lab',
              required: true,
            },
          ],
        });

      expect(createRes.status).toBe(201);
      const created = createRes.body.data;
      expect(created.ownerId).toBeUndefined();
      expect('ownerId' in created).toBe(false);
      expect(JSON.stringify(createRes.body)).not.toContain(owner1.id);
      expect(created.status).toBe('DRAFT');
      expect(created.mode).toBe('IDENTIFIED');
      expect(created.eligibility).toBe('ALL');
      expect(created.title).toBe('Lab feedback');
      expect(created.description).toBe('Week 10 lab evaluation');
      expect(created.publishedAt).toBeNull();
      expect(created.closeAt).toBeNull();
      expect(created.closedAt).toBeNull();
      expect(created.responseCount).toBe(0);
      expect(created.questions).toHaveLength(2);
      expect(created.questions[0]).toMatchObject({
        position: 1,
        type: 'SINGLE_CHOICE',
        text: 'Was the lab clear?',
        required: true,
      });
      expect(created.questions[0].options).toMatchObject([
        { position: 1, text: 'Yes' },
        { position: 2, text: 'No' },
      ]);
      expect(created.questions[1]).toMatchObject({
        position: 2,
        type: 'RATING',
        text: 'Rate the lab',
        required: true,
        options: [],
      });

      const getRes = await request(app)
        .get(`/api/v1/surveys/${created.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data).toEqual(created);
      expect(JSON.stringify(getRes.body)).not.toContain(owner1.id);

      const dbSurvey = await prisma.survey.findUnique({
        where: { id: created.id },
        include: {
          questions: {
            orderBy: { position: 'asc' },
            include: { options: { orderBy: { position: 'asc' } } },
          },
        },
      });
      expect(dbSurvey).not.toBeNull();
      expect(dbSurvey!.ownerId).toBe(owner1.id);
      expect(dbSurvey!.status).toBe('DRAFT');
      expect(dbSurvey!.questions.map((q) => q.position)).toEqual([1, 2]);
      expect(dbSurvey!.questions[0].options.map((o) => o.position)).toEqual([1, 2]);
    });

    it('creates an incomplete draft with empty title and no questions', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner1.email);

      const createRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: '',
          questions: [],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.status).toBe('DRAFT');
      expect(createRes.body.data.title).toBe('');
      expect(createRes.body.data.questions).toEqual([]);
      expect('ownerId' in createRes.body.data).toBe(false);

      const getRes = await request(app)
        .get(`/api/v1/surveys/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.title).toBe('');
    });

    it('rejects server-owned fields and unsupported Sprint 1 options with 400 VALIDATION_ERROR without writing to DB', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner1.email);

      for (const extraField of ['ownerId', 'status', 'publishedAt', 'id', 'userId', 'role', 'submittedAt']) {
        const res = await request(app)
          .post('/api/v1/surveys')
          .set('Authorization', `Bearer ${token}`)
          .send({
            title: 'Should fail',
            [extraField]: 'spoofed-value',
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: extraField })])
        );
      }

      const anonRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Anon attempt', mode: 'ANONYMOUS' });
      expect(anonRes.status).toBe(400);
      expect(anonRes.body.error.code).toBe('VALIDATION_ERROR');

      const multiChoiceRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Multi attempt',
          questions: [{ type: 'MULTIPLE_CHOICE', text: 'Pick many' }],
        });
      expect(multiChoiceRes.status).toBe(400);
      expect(multiChoiceRes.body.error.code).toBe('VALIDATION_ERROR');

      const count = await prisma.survey.count();
      expect(count).toBe(0);
    });
  });

  describe('TEST-F02-03: publish complete draft (AC-F02-03, FR-02)', () => {
    it('publishes a complete draft, sets publishedAt within window, and persists PUBLISHED in PostgreSQL', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner1.email);

      const draft = await createSurveyWithQuestions(owner1.id, {
        title: 'Course Evaluation',
        status: 'DRAFT',
        questions: [
          {
            type: 'SINGLE_CHOICE',
            text: 'Helpful?',
            options: [{ text: 'Yes' }, { text: 'No' }],
          },
          {
            type: 'RATING',
            text: 'Overall score',
          },
        ],
      });

      const before = new Date();
      const res = await request(app)
        .post(`/api/v1/surveys/${draft.id}/publish`)
        .set('Authorization', `Bearer ${token}`);
      const after = new Date();

      expect(res.status).toBe(200);
      expect('ownerId' in res.body.data).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain(owner1.id);
      expect(res.body.data.status).toBe('PUBLISHED');
      expect(res.body.data.publishedAt).toBeTruthy();

      const publishedTime = new Date(res.body.data.publishedAt).getTime();
      expect(publishedTime).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(publishedTime).toBeLessThanOrEqual(after.getTime() + 1000);

      const dbSurvey = await prisma.survey.findUnique({ where: { id: draft.id } });
      expect(dbSurvey).not.toBeNull();
      expect(dbSurvey!.status).toBe('PUBLISHED');
      expect(dbSurvey!.publishedAt?.toISOString()).toBe(res.body.data.publishedAt);
      expect(dbSurvey!.closedAt).toBeNull();
    });

    it('allows only one request to win when two publish requests race concurrently', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner1.email);

      const draft = await createSurveyWithQuestions(owner1.id, {
        title: 'Concurrent Publish Survey',
        status: 'DRAFT',
        questions: [{ type: 'RATING', text: 'Rate it' }],
      });

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/surveys/${draft.id}/publish`)
          .set('Authorization', `Bearer ${token}`),
        request(app)
          .post(`/api/v1/surveys/${draft.id}/publish`)
          .set('Authorization', `Bearer ${token}`),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);

      const rejected = res1.status === 409 ? res1 : res2;
      expect(rejected.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('TEST-F02-04: publish rejected with all failed checks (AC-F02-04, FR-02, BR-04)', () => {
    it.each([
      {
        label: 'empty title',
        title: '',
        questions: [{ type: 'RATING' as const, text: 'Rate it' }],
        expectedField: 'title',
      },
      {
        label: 'spaces-only title',
        title: '   ',
        questions: [{ type: 'RATING' as const, text: 'Rate it' }],
        expectedField: 'title',
      },
      {
        label: 'no questions',
        title: 'Valid title',
        questions: [],
        expectedField: 'questions',
      },
      {
        label: 'single-choice with 1 option',
        title: 'Valid title',
        questions: [
          { type: 'SINGLE_CHOICE' as const, text: 'Choice', options: [{ text: 'Only one' }] },
        ],
        expectedField: 'questions[0].options',
      },
      {
        label: 'single-choice with 0 options',
        title: 'Valid title',
        questions: [{ type: 'SINGLE_CHOICE' as const, text: 'Choice', options: [] }],
        expectedField: 'questions[0].options',
      },
    ])(
      'rejects draft when $label and leaves survey DRAFT in DB',
      async ({ title, questions, expectedField }) => {
        const owner1 = await createUser({
          email: `owner-${Math.random().toString(36).slice(2)}@example.edu`,
          password: 'Password123!',
          role: 'SURVEY_OWNER',
        });
        const token = await loginAs(owner1.email);

        const draft = await createSurveyWithQuestions(owner1.id, {
          title,
          status: 'DRAFT',
          questions,
        });

        const res = await request(app)
          .post(`/api/v1/surveys/${draft.id}/publish`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: expectedField })])
        );

        const dbSurvey = await prisma.survey.findUnique({ where: { id: draft.id } });
        expect(dbSurvey!.status).toBe('DRAFT');
        expect(dbSurvey!.publishedAt).toBeNull();
      }
    );

    it('reports EVERY failed check together for a multi-defect draft', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner1.email);

      const draft = await createSurveyWithQuestions(owner1.id, {
        title: '',
        status: 'DRAFT',
        questions: [
          {
            type: 'SINGLE_CHOICE',
            text: 'Incomplete choice',
            options: [{ text: 'Only one' }],
          },
        ],
      });

      const res = await request(app)
        .post(`/api/v1/surveys/${draft.id}/publish`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('The survey cannot be published yet.');
      expect(res.body.error.details).toEqual([
        { field: 'title', issue: 'must not be empty to publish' },
        {
          field: 'questions[0].options',
          issue: 'a choice question needs at least 2 options to publish',
        },
      ]);

      const dbSurvey = await prisma.survey.findUnique({ where: { id: draft.id } });
      expect(dbSurvey!.status).toBe('DRAFT');
      expect(dbSurvey!.publishedAt).toBeNull();
    });

    it('reports both title and questions failures together for an empty-title draft with zero questions', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner1.email);

      const draft = await createSurveyWithQuestions(owner1.id, {
        title: '',
        status: 'DRAFT',
        questions: [],
      });

      const res = await request(app)
        .post(`/api/v1/surveys/${draft.id}/publish`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('The survey cannot be published yet.');
      expect(res.body.error.details).toEqual([
        expect.objectContaining({
          field: 'title',
          issue: 'must not be empty to publish',
        }),
        expect.objectContaining({
          field: 'questions',
        }),
      ]);

      const dbSurvey = await prisma.survey.findUnique({ where: { id: draft.id } });
      expect(dbSurvey!.status).toBe('DRAFT');
      expect(dbSurvey!.publishedAt).toBeNull();
    });
  });

  describe('TEST-F02-05: list own surveys & pagination boundaries (AC-F02-05, FR-10, BR-05)', () => {
    it('lists only own surveys newest-first with SQL responseCount, ignoring ownerId query param', async () => {
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
        role: 'RESPONDENT',
      });
      const resp2 = await createUser({
        email: 'resp2@example.edu',
        role: 'RESPONDENT',
      });

      const t1 = new Date('2026-11-10T01:00:00.000Z');
      const t2 = new Date('2026-11-10T02:00:00.000Z');
      const t3 = new Date('2026-11-10T03:00:00.000Z');

      const sClosed = await createSurveyWithQuestions(owner1.id, {
        title: 'Closed Survey',
        status: 'CLOSED',
        publishedAt: t1,
        closedAt: new Date('2026-11-10T01:30:00.000Z'),
        createdAt: t1,
      });
      const sPub = await createSurveyWithQuestions(owner1.id, {
        title: 'Published Survey',
        status: 'PUBLISHED',
        publishedAt: t2,
        createdAt: t2,
      });
      const sDraft = await createSurveyWithQuestions(owner1.id, {
        title: 'Draft Survey',
        status: 'DRAFT',
        createdAt: t3,
      });
      const sOwner2 = await createSurveyWithQuestions(owner2.id, {
        title: 'Other Owner Survey',
        status: 'PUBLISHED',
      });

      const q1 = sPub.questions[0];
      await createResponse(sPub.id, resp1.id, [{ questionId: q1.id, optionId: q1.options[0].id }]);
      await createResponse(sPub.id, resp2.id, [{ questionId: q1.id, optionId: q1.options[1].id }]);

      const token1 = await loginAs(owner1.email);

      const listRes = await request(app)
        .get('/api/v1/surveys')
        .set('Authorization', `Bearer ${token1}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.meta).toEqual({ page: 1, pageSize: 20, total: 3 });
      expect(listRes.body.data).toHaveLength(3);
      expect(listRes.body.data.map((s: any) => s.id)).toEqual([sDraft.id, sPub.id, sClosed.id]);
      expect(listRes.body.data.some((s: any) => s.id === sOwner2.id)).toBe(false);
      expect(JSON.stringify(listRes.body)).not.toContain(owner1.id);
      expect(JSON.stringify(listRes.body)).not.toContain(owner2.id);

      for (const item of listRes.body.data) {
        expect('ownerId' in item).toBe(false);
        expect(item).toHaveProperty('createdAt');
        expect(item).toHaveProperty('publishedAt');
        expect(item).toHaveProperty('closeAt');
        expect(item).toHaveProperty('closedAt');
      }

      const pubItem = listRes.body.data.find((s: any) => s.id === sPub.id);
      expect(pubItem.status).toBe('PUBLISHED');
      expect(pubItem.responseCount).toBe(2);

      const draftItem = listRes.body.data.find((s: any) => s.id === sDraft.id);
      expect(draftItem.status).toBe('DRAFT');
      expect(draftItem.responseCount).toBe(0);

      // Pagination page 2
      const page2Res = await request(app)
        .get('/api/v1/surveys?page=2&pageSize=2')
        .set('Authorization', `Bearer ${token1}`);
      expect(page2Res.status).toBe(200);
      expect(page2Res.body.meta).toEqual({ page: 2, pageSize: 2, total: 3 });
      expect(page2Res.body.data.map((s: any) => s.id)).toEqual([sClosed.id]);

      // Identity values in query strings are ignored (BR-08 / SDS 5.1)
      const spoofQueryRes = await request(app)
        .get(`/api/v1/surveys?ownerId=${owner2.id}`)
        .set('Authorization', `Bearer ${token1}`);
      expect(spoofQueryRes.status).toBe(200);
      expect(spoofQueryRes.body.data.map((s: any) => s.id)).toEqual([sDraft.id, sPub.id, sClosed.id]);
    });

    it('rejects pageSize=101 and invalid page/pageSize values with 400 VALIDATION_ERROR', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner1.email);

      const tooLarge = await request(app)
        .get('/api/v1/surveys?pageSize=101')
        .set('Authorization', `Bearer ${token}`);
      expect(tooLarge.status).toBe(400);
      expect(tooLarge.body.error.code).toBe('VALIDATION_ERROR');
      expect(tooLarge.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'pageSize' })])
      );

      const zeroPage = await request(app)
        .get('/api/v1/surveys?page=0')
        .set('Authorization', `Bearer ${token}`);
      expect(zeroPage.status).toBe(400);
      expect(zeroPage.body.error.code).toBe('VALIDATION_ERROR');
      expect(zeroPage.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'page' })])
      );
    });
  });

  describe('TEST-F02-06: close open survey (AC-F02-06, FR-11)', () => {
    it('closes a PUBLISHED survey, sets closedAt, and preserves responseCount and stored responses in PostgreSQL', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const resp1 = await createUser({ email: 'resp1@example.edu', role: 'RESPONDENT' });
      const resp2 = await createUser({ email: 'resp2@example.edu', role: 'RESPONDENT' });
      const token = await loginAs(owner1.email);

      const pub = await createSurveyWithQuestions(owner1.id, {
        title: 'Course Mid-Term Feedback',
        status: 'PUBLISHED',
        questions: [
          {
            type: 'SINGLE_CHOICE',
            text: 'Pacing?',
            options: [{ text: 'Good' }, { text: 'Fast' }],
          },
          {
            type: 'RATING',
            text: 'Score',
          },
        ],
      });

      const q1 = pub.questions[0];
      const q2 = pub.questions[1];

      await createResponse(pub.id, resp1.id, [
        { questionId: q1.id, optionId: q1.options[0].id },
        { questionId: q2.id, ratingValue: 5 },
      ]);
      await createResponse(pub.id, resp2.id, [
        { questionId: q1.id, optionId: q1.options[1].id },
        { questionId: q2.id, ratingValue: 4 },
      ]);

      const responsesBefore = await prisma.response.findMany({
        where: { surveyId: pub.id },
        orderBy: { id: 'asc' },
        include: {
          answers: {
            orderBy: { id: 'asc' },
            include: { selections: { orderBy: { optionId: 'asc' } } },
          },
        },
      });
      expect(responsesBefore).toHaveLength(2);

      const before = new Date();
      const closeRes = await request(app)
        .post(`/api/v1/surveys/${pub.id}/close`)
        .set('Authorization', `Bearer ${token}`);
      const after = new Date();

      expect(closeRes.status).toBe(200);
      expect('ownerId' in closeRes.body.data).toBe(false);
      expect(JSON.stringify(closeRes.body)).not.toContain(owner1.id);
      expect(closeRes.body.data.status).toBe('CLOSED');
      expect(closeRes.body.data.responseCount).toBe(2);
      expect(closeRes.body.data.closedAt).toBeTruthy();

      const closedTime = new Date(closeRes.body.data.closedAt).getTime();
      expect(closedTime).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(closedTime).toBeLessThanOrEqual(after.getTime() + 1000);

      const dbSurvey = await prisma.survey.findUnique({ where: { id: pub.id } });
      expect(dbSurvey!.status).toBe('CLOSED');
      expect(dbSurvey!.closedAt?.toISOString()).toBe(closeRes.body.data.closedAt);

      const responsesAfter = await prisma.response.findMany({
        where: { surveyId: pub.id },
        orderBy: { id: 'asc' },
        include: {
          answers: {
            orderBy: { id: 'asc' },
            include: { selections: { orderBy: { optionId: 'asc' } } },
          },
        },
      });
      expect(responsesAfter).toEqual(responsesBefore);
    });

    it('treats a PUBLISHED survey with closeAt in the past as effectively CLOSED', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner1.email);

      const pastCloseAt = new Date(Date.now() - 60_000);
      const expired = await createSurveyWithQuestions(owner1.id, {
        title: 'Expired Survey',
        status: 'PUBLISHED',
        closeAt: pastCloseAt,
      });

      const getRes = await request(app)
        .get(`/api/v1/surveys/${expired.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.status).toBe('CLOSED');

      const closeRes = await request(app)
        .post(`/api/v1/surveys/${expired.id}/close`)
        .set('Authorization', `Bearer ${token}`);
      expect(closeRes.status).toBe(409);
      expect(closeRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('allows only one request to win when two close requests race concurrently', async () => {
      const owner1 = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner1.email);

      const pub = await createSurveyWithQuestions(owner1.id, {
        title: 'Concurrent Close Survey',
        status: 'PUBLISHED',
        questions: [{ type: 'RATING', text: 'Rate it' }],
      });

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/surveys/${pub.id}/close`)
          .set('Authorization', `Bearer ${token}`),
        request(app)
          .post(`/api/v1/surveys/${pub.id}/close`)
          .set('Authorization', `Bearer ${token}`),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);

      const rejected = res1.status === 409 ? res1 : res2;
      expect(rejected.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('TEST-F02-08: invalid lifecycle transitions (AC-F02-08, BR-04)', () => {
    it.each([
      { initialStatus: 'PUBLISHED' as const, action: 'publish' as const },
      { initialStatus: 'CLOSED' as const, action: 'publish' as const },
      { initialStatus: 'DRAFT' as const, action: 'close' as const },
      { initialStatus: 'CLOSED' as const, action: 'close' as const },
    ])(
      'rejects $action on $initialStatus survey with 409 INVALID_STATE_TRANSITION and leaves DB unchanged',
      async ({ initialStatus, action }) => {
        const owner1 = await createUser({
          email: `owner-${Math.random().toString(36).slice(2)}@example.edu`,
          password: 'Password123!',
          role: 'SURVEY_OWNER',
        });
        const token = await loginAs(owner1.email);

        const survey = await createSurveyWithQuestions(owner1.id, {
          title: 'Transition Survey',
          status: initialStatus,
          questions: [{ type: 'RATING', text: 'Rate' }],
        });

        const beforeDb = await prisma.survey.findUnique({ where: { id: survey.id } });

        const res = await request(app)
          .post(`/api/v1/surveys/${survey.id}/${action}`)
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');

        const afterDb = await prisma.survey.findUnique({ where: { id: survey.id } });
        expect(afterDb!.status).toBe(beforeDb!.status);
        expect(afterDb!.publishedAt).toEqual(beforeDb!.publishedAt);
        expect(afterDb!.closedAt).toEqual(beforeDb!.closedAt);
      }
    );
  });
});
