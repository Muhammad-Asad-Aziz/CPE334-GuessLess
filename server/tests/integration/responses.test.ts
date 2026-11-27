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
  createParticipation,
} from '../helpers/factories';
import { mapPrismaError, DuplicateResponseError } from '../../src/errors';

describe('F-03 Responses Integration Tests (TDD)', () => {
  let owner: any;
  let resp1: any;
  let resp1Token: string;
  let sPub: any;
  let q1: any;
  let q2: any;
  let o1: any;
  let o2: any;

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

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resp1.email, password: 'Password1!' });
    resp1Token = loginRes.body.data.token;

    // Fixture S-PUB: Published identified survey
    sPub = await createSurvey(owner.id, {
      title: 'Course Evaluation',
      status: 'PUBLISHED',
      mode: 'IDENTIFIED',
    });

    // Q1: Single choice (required)
    q1 = await createQuestion(sPub.id, {
      position: 1,
      type: 'SINGLE_CHOICE',
      text: 'How was the course pace?',
      required: true,
    });
    o1 = await createOption(q1.id, { position: 1, text: 'Too slow' });
    o2 = await createOption(q1.id, { position: 2, text: 'About right' });

    // Q2: Rating (required)
    q2 = await createQuestion(sPub.id, {
      position: 2,
      type: 'RATING',
      text: 'Rate overall satisfaction',
      required: true,
    });
  });

  describe('TEST-F03-02: Valid Response Persistence and Transactional Rollback (AC-F03-02)', () => {
    it('persists response, participation, answers, and selections in one atomic transaction', async () => {
      const resp2 = await createUser({
        email: 'resp2@example.edu',
        password: 'Password1!',
        role: 'RESPONDENT',
      });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: resp2.email, password: 'Password1!' });
      const resp2Token = loginRes.body.data.token;

      const res = await request(app)
        .post(`/api/v1/surveys/${sPub.id}/responses`)
        .set('Authorization', `Bearer ${resp2Token}`)
        .send({
          answers: [
            { questionId: q1.id, optionIds: [o2.id] },
            { questionId: q2.id, rating: 5 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.responseId).toBeDefined();
      expect(res.body.data.surveyId).toBe(sPub.id);
      expect(res.body.data.submittedAt).toBeDefined();

      // Database verification
      const participation = await prisma.participation.findUnique({
        where: {
          surveyId_respondentId: {
            surveyId: sPub.id,
            respondentId: resp2.id,
          },
        },
      });
      expect(participation).toBeDefined();

      const response = await prisma.response.findUnique({
        where: {
          surveyId_respondentId: {
            surveyId: sPub.id,
            respondentId: resp2.id,
          },
        },
        include: {
          answers: {
            include: {
              selections: true,
            },
          },
        },
      });
      expect(response).toBeDefined();
      expect(response?.mode).toBe('IDENTIFIED');
      expect(response?.respondentId).toBe(resp2.id);
      expect(response?.submittedAt).toBeDefined();
      expect(response?.answers.length).toBe(2);

      const singleChoiceAns = response?.answers.find((a) => a.questionId === q1.id);
      expect(singleChoiceAns?.selections.length).toBe(1);
      expect(singleChoiceAns?.selections[0].optionId).toBe(o2.id);

      const ratingAns = response?.answers.find((a) => a.questionId === q2.id);
      expect(ratingAns?.ratingValue).toBe(5);
    });

    it('rolls back everything when failure occurs during answer writing (0 rows created)', async () => {
      const resp2 = await createUser({
        email: 'resp2-fail@example.edu',
        password: 'Password1!',
        role: 'RESPONDENT',
      });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: resp2.email, password: 'Password1!' });
      const resp2Token = loginRes.body.data.token;

      // Inject answer writer failure into app.locals
      app.locals.testAnswerWriter = async () => {
        throw new Error('Injected failure during answer writing');
      };

      try {
        const res = await request(app)
          .post(`/api/v1/surveys/${sPub.id}/responses`)
          .set('Authorization', `Bearer ${resp2Token}`)
          .send({
            answers: [
              { questionId: q1.id, optionIds: [o2.id] },
              { questionId: q2.id, rating: 5 },
            ],
          });

        expect(res.status).toBe(500);
        expect(res.body.error.code).toBe('INTERNAL_ERROR');

        // Verify that Participation, Response, Answer, and AnswerSelection all rolled back to 0 rows
        const participationCount = await prisma.participation.count({
          where: { surveyId: sPub.id, respondentId: resp2.id },
        });
        const responseCount = await prisma.response.count({
          where: { surveyId: sPub.id, respondentId: resp2.id },
        });
        const answerCount = await prisma.answer.count({
          where: { questionId: { in: [q1.id, q2.id] } },
        });

        expect(participationCount).toBe(0);
        expect(responseCount).toBe(0);
        expect(answerCount).toBe(0);
      } finally {
        delete app.locals.testAnswerWriter;
      }
    });
  });

  describe('TEST-F03-05: Duplicate Response Handling (BR-01, AC-F03-05)', () => {
    it('returns 409 DUPLICATE_RESPONSE on second submission and maintains exactly 1 response', async () => {
      const validPayload = {
        answers: [
          { questionId: q1.id, optionIds: [o2.id] },
          { questionId: q2.id, rating: 4 },
        ],
      };

      // First submission succeeds
      const firstRes = await request(app)
        .post(`/api/v1/surveys/${sPub.id}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send(validPayload);

      expect(firstRes.status).toBe(201);
      expect(firstRes.body.data.responseId).toBeDefined();

      // Second submission fails with 409 DUPLICATE_RESPONSE
      const secondRes = await request(app)
        .post(`/api/v1/surveys/${sPub.id}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send(validPayload);

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.error.code).toBe('DUPLICATE_RESPONSE');

      // Database verification: still exactly 1 participation and 1 response
      const participationCount = await prisma.participation.count({
        where: { surveyId: sPub.id, respondentId: resp1.id },
      });
      const responseCount = await prisma.response.count({
        where: { surveyId: sPub.id, respondentId: resp1.id },
      });
      expect(participationCount).toBe(1);
      expect(responseCount).toBe(1);
    });

    it('database enforces unique (surveyId, respondentId) on Participation and maps to DUPLICATE_RESPONSE', async () => {
      await createParticipation(sPub.id, resp1.id);

      // Attempting to insert a duplicate Participation directly throws a Prisma unique-constraint error
      let thrownError: any;
      try {
        await createParticipation(sPub.id, resp1.id);
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError.code).toBe('P2002');

      const mapped = mapPrismaError(thrownError);
      expect(mapped).toBeInstanceOf(DuplicateResponseError);
      expect((mapped as DuplicateResponseError).statusCode).toBe(409);
      expect((mapped as DuplicateResponseError).code).toBe('DUPLICATE_RESPONSE');
    });
  });

  describe('TEST-F03-06: Only Open Surveys Accept Responses (BR-02, AC-F03-06)', () => {
    it('returns 404 NOT_FOUND when submitting to a DRAFT survey', async () => {
      const sDraft = await createSurvey(owner.id, {
        title: 'Draft Survey',
        status: 'DRAFT',
      });
      const qDraft = await createQuestion(sDraft.id, {
        position: 1,
        type: 'RATING',
        required: true,
      });

      const res = await request(app)
        .post(`/api/v1/surveys/${sDraft.id}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({
          answers: [{ questionId: qDraft.id, rating: 5 }],
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');

      const participations = await prisma.participation.count({
        where: { surveyId: sDraft.id },
      });
      expect(participations).toBe(0);
    });

    it('returns 409 SURVEY_NOT_OPEN when submitting to a CLOSED survey', async () => {
      const sClosed = await createSurvey(owner.id, {
        title: 'Closed Survey',
        status: 'CLOSED',
      });
      const qClosed = await createQuestion(sClosed.id, {
        position: 1,
        type: 'RATING',
        required: true,
      });

      const res = await request(app)
        .post(`/api/v1/surveys/${sClosed.id}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({
          answers: [{ questionId: qClosed.id, rating: 5 }],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SURVEY_NOT_OPEN');

      const participations = await prisma.participation.count({
        where: { surveyId: sClosed.id },
      });
      expect(participations).toBe(0);
    });

    it('returns 409 SURVEY_NOT_OPEN when submitting to a survey whose closeAt is in the past', async () => {
      const sPast = await createSurvey(owner.id, {
        title: 'Past Close Survey',
        status: 'PUBLISHED',
        closeAt: new Date(Date.now() - 3600000), // 1 hour ago
      });
      const qPast = await createQuestion(sPast.id, {
        position: 1,
        type: 'RATING',
        required: true,
      });

      const res = await request(app)
        .post(`/api/v1/surveys/${sPast.id}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({
          answers: [{ questionId: qPast.id, rating: 5 }],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SURVEY_NOT_OPEN');

      const participations = await prisma.participation.count({
        where: { surveyId: sPast.id },
      });
      expect(participations).toBe(0);
    });

    it('returns 404 NOT_FOUND for non-UUID or non-existent survey id', async () => {
      const res = await request(app)
        .post('/api/v1/surveys/not-a-valid-uuid/responses')
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({ answers: [] });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('TEST-F03-07: Answer Validation and Boundaries (BR-06, AC-F03-07)', () => {
    it.each([
      ['missing required question Q2', { answers: [{ questionId: 'q1', optionIds: ['o2'] }] }, 'answers'],
      ['empty answers array', { answers: [] }, 'answers'],
      ['questionId belongs to another survey', { answers: [{ questionId: '00000000-0000-0000-0000-000000000099', optionIds: ['o1'] }] }, 'answers[0].questionId'],
      ['question answered twice', { answers: [{ questionId: 'q1', optionIds: ['o1'] }, { questionId: 'q1', optionIds: ['o2'] }, { questionId: 'q2', rating: 4 }] }, 'answers[1].questionId'],
      ['single-choice has two optionIds', { answers: [{ questionId: 'q1', optionIds: ['o1', 'o2'] }, { questionId: 'q2', rating: 4 }] }, 'answers[0].optionIds'],
      ['single-choice answered with rating', { answers: [{ questionId: 'q1', rating: 3 }, { questionId: 'q2', rating: 4 }] }, 'answers[0].optionIds'],
      ['rating is 0', { answers: [{ questionId: 'q1', optionIds: ['o2'] }, { questionId: 'q2', rating: 0 }] }, 'answers[1].rating'],
      ['rating is 6', { answers: [{ questionId: 'q1', optionIds: ['o2'] }, { questionId: 'q2', rating: 6 }] }, 'answers[1].rating'],
      ['rating is 3.5', { answers: [{ questionId: 'q1', optionIds: ['o2'] }, { questionId: 'q2', rating: 3.5 }] }, 'answers[1].rating'],
      ['rating answered with optionIds', { answers: [{ questionId: 'q1', optionIds: ['o2'] }, { questionId: 'q2', optionIds: ['o1'] }] }, 'answers[1].rating'],
    ])('rejects "%s" with 400 VALIDATION_ERROR and details on field "%s"', async (_label, payloadGenerator, expectedField) => {
      // Replace placeholder IDs with real fixture IDs
      const payload = {
        answers: (payloadGenerator.answers as any[]).map((ans) => {
          let questionId = ans.questionId;
          if (questionId === 'q1') questionId = q1.id;
          if (questionId === 'q2') questionId = q2.id;
          let optionIds = ans.optionIds;
          if (optionIds) {
            optionIds = optionIds.map((oid: string) => {
              if (oid === 'o1') return o1.id;
              if (oid === 'o2') return o2.id;
              return oid;
            });
          }
          return {
            questionId,
            ...(optionIds !== undefined ? { optionIds } : {}),
            ...(ans.rating !== undefined ? { rating: ans.rating } : {}),
          };
        }),
      };

      const res = await request(app)
        .post(`/api/v1/surveys/${sPub.id}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: expectedField })])
      );

      // Verify nothing is stored
      const pCount = await prisma.participation.count({
        where: { surveyId: sPub.id, respondentId: resp1.id },
      });
      expect(pCount).toBe(0);
    });

    it('rejects unknown/server-owned field "respondentId" in request body with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post(`/api/v1/surveys/${sPub.id}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({
          respondentId: '00000000-0000-0000-0000-000000000001',
          answers: [
            { questionId: q1.id, optionIds: [o2.id] },
            { questionId: q2.id, rating: 4 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'respondentId' })])
      );
    });

    it('accepts boundary values: rating 1 with optional question omitted', async () => {
      // Second survey with required rating and optional single-choice
      const sBoundary = await createSurvey(owner.id, {
        title: 'Boundary Survey',
        status: 'PUBLISHED',
      });
      const qReq = await createQuestion(sBoundary.id, {
        position: 1,
        type: 'RATING',
        required: true,
      });
      const qOpt = await createQuestion(sBoundary.id, {
        position: 2,
        type: 'SINGLE_CHOICE',
        required: false,
      });
      await createOption(qOpt.id, { position: 1, text: 'Opt A' });

      const res = await request(app)
        .post(`/api/v1/surveys/${sBoundary.id}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({
          answers: [{ questionId: qReq.id, rating: 1 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.responseId).toBeDefined();
    });

    it('accepts boundary values: rating 5 with optional question answered', async () => {
      const resp2 = await createUser({
        email: 'resp2@example.edu',
        password: 'Password1!',
        role: 'RESPONDENT',
      });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: resp2.email, password: 'Password1!' });
      const resp2Token = loginRes.body.data.token;

      const sBoundary = await createSurvey(owner.id, {
        title: 'Boundary Survey 2',
        status: 'PUBLISHED',
      });
      const qReq = await createQuestion(sBoundary.id, {
        position: 1,
        type: 'RATING',
        required: true,
      });
      const qOpt = await createQuestion(sBoundary.id, {
        position: 2,
        type: 'SINGLE_CHOICE',
        required: false,
      });
      const opt = await createOption(qOpt.id, { position: 1, text: 'Opt B' });

      const res = await request(app)
        .post(`/api/v1/surveys/${sBoundary.id}/responses`)
        .set('Authorization', `Bearer ${resp2Token}`)
        .send({
          answers: [
            { questionId: qReq.id, rating: 5 },
            { questionId: qOpt.id, optionIds: [opt.id] },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.responseId).toBeDefined();
    });
  });

  describe('TEST-F03-10: Quota Auto-Closure & Post-Closure Effects (AC-F03-10, FR-03, FR-08, FR-09, FR-11, BR-02, BR-04, CHG-14)', () => {
    it('atomically closes survey at maxResponses = 2, hides from available-surveys, blocks resp3 and redundant close, and preserves /my-responses', async () => {
      const ownerLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password: 'Password1!' });
      expect(ownerLogin.status).toBe(200);
      const ownerToken = ownerLogin.body.data.token as string;

      const resp2 = await createUser({
        email: 'resp2-quota@example.edu',
        password: 'Password1!',
        role: 'RESPONDENT',
      });
      const resp3 = await createUser({
        email: 'resp3-quota@example.edu',
        password: 'Password1!',
        role: 'RESPONDENT',
      });

      const resp2Login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: resp2.email, password: 'Password1!' });
      const resp2Token = resp2Login.body.data.token as string;

      const resp3Login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: resp3.email, password: 'Password1!' });
      const resp3Token = resp3Login.body.data.token as string;

      // Owner creates and publishes a survey with maxResponses = 2
      const createRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Quota 2 Survey',
          description: 'Closes automatically after 2 submissions.',
          maxResponses: 2,
          questions: [
            {
              type: 'SINGLE_CHOICE',
              text: 'Pick one',
              required: true,
              options: [{ text: 'Opt A' }, { text: 'Opt B' }],
            },
            {
              type: 'RATING',
              text: 'Rate this',
              required: true,
            },
          ],
        });
      expect(createRes.status).toBe(201);
      const cappedSurvey = createRes.body.data;
      const cappedId = cappedSurvey.id as string;
      const cq1 = cappedSurvey.questions[0];
      const cq2 = cappedSurvey.questions[1];

      const pubRes = await request(app)
        .post(`/api/v1/surveys/${cappedId}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});
      expect(pubRes.status).toBe(200);

      // 1st submission (resp1): 201, survey stays PUBLISHED with closedAt null
      const sub1 = await request(app)
        .post(`/api/v1/surveys/${cappedId}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({
          answers: [
            { questionId: cq1.id, optionIds: [cq1.options[0].id] },
            { questionId: cq2.id, rating: 4 },
          ],
        });
      expect(sub1.status).toBe(201);

      const afterFirstDb = await prisma.survey.findUnique({ where: { id: cappedId } });
      expect(afterFirstDb!.status).toBe('PUBLISHED');
      expect(afterFirstDb!.closedAt).toBeNull();

      // Still listed in GET /api/v1/available-surveys with maxResponses: 2
      const browseMid = await request(app)
        .get('/api/v1/available-surveys')
        .set('Authorization', `Bearer ${resp2Token}`);
      expect(browseMid.status).toBe(200);
      const midItem = browseMid.body.data.find((s: any) => s.id === cappedId);
      expect(midItem).toBeDefined();
      expect(midItem.maxResponses).toBe(2);

      // 2nd submission (resp2): 201, survey atomically transitions to CLOSED with closedAt set
      const sub2 = await request(app)
        .post(`/api/v1/surveys/${cappedId}/responses`)
        .set('Authorization', `Bearer ${resp2Token}`)
        .send({
          answers: [
            { questionId: cq1.id, optionIds: [cq1.options[1].id] },
            { questionId: cq2.id, rating: 5 },
          ],
        });
      expect(sub2.status).toBe(201);

      const afterSecondDb = await prisma.survey.findUnique({ where: { id: cappedId } });
      expect(afterSecondDb!.status).toBe('CLOSED');
      expect(afterSecondDb!.closedAt).not.toBeNull();

      // Hidden immediately from resp3's /available-surveys; /available-surveys/:id returns 409 SURVEY_NOT_OPEN
      const browseAfter = await request(app)
        .get('/api/v1/available-surveys')
        .set('Authorization', `Bearer ${resp3Token}`);
      expect(browseAfter.status).toBe(200);
      expect(browseAfter.body.data.some((s: any) => s.id === cappedId)).toBe(false);

      const formAfter = await request(app)
        .get(`/api/v1/available-surveys/${cappedId}`)
        .set('Authorization', `Bearer ${resp3Token}`);
      expect(formAfter.status).toBe(409);
      expect(formAfter.body.error.code).toBe('SURVEY_NOT_OPEN');

      // 3rd submission (resp3) rejected with 409 SURVEY_NOT_OPEN; 0 new rows created
      const sub3 = await request(app)
        .post(`/api/v1/surveys/${cappedId}/responses`)
        .set('Authorization', `Bearer ${resp3Token}`)
        .send({
          answers: [
            { questionId: cq1.id, optionIds: [cq1.options[0].id] },
            { questionId: cq2.id, rating: 3 },
          ],
        });
      expect(sub3.status).toBe(409);
      expect(sub3.body.error.code).toBe('SURVEY_NOT_OPEN');

      expect(await prisma.response.count({ where: { surveyId: cappedId } })).toBe(2);
      expect(await prisma.participation.count({ where: { surveyId: cappedId } })).toBe(2);
      expect(
        await prisma.participation.count({ where: { surveyId: cappedId, respondentId: resp3.id } })
      ).toBe(0);

      // Redundant manual close returns 409 INVALID_STATE_TRANSITION
      const redundantClose = await request(app)
        .post(`/api/v1/surveys/${cappedId}/close`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});
      expect(redundantClose.status).toBe(409);
      expect(redundantClose.body.error.code).toBe('INVALID_STATE_TRANSITION');

      // resp1 & resp2 still see survey in /my-responses (CLOSED) and can retrieve own answers
      for (const token of [resp1Token, resp2Token]) {
        const myList = await request(app)
          .get('/api/v1/my-responses')
          .set('Authorization', `Bearer ${token}`);
        expect(myList.status).toBe(200);
        const item = myList.body.data.find((r: any) => r.surveyId === cappedId);
        expect(item).toBeDefined();
        expect(item.status).toBe('CLOSED');

        const myDetail = await request(app)
          .get(`/api/v1/surveys/${cappedId}/my-response`)
          .set('Authorization', `Bearer ${token}`);
        expect(myDetail.status).toBe(200);
        expect(myDetail.body.data.answers).toHaveLength(2);
      }
    });

    it('keeps unlimited surveys (maxResponses = null) open across submissions', async () => {
      const ownerLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password: 'Password1!' });
      const ownerToken = ownerLogin.body.data.token as string;

      const resp2 = await createUser({
        email: 'resp2-unlim@example.edu',
        password: 'Password1!',
        role: 'RESPONDENT',
      });
      const resp2Login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: resp2.email, password: 'Password1!' });
      const resp2Token = resp2Login.body.data.token as string;

      const createRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Unlimited Survey',
          questions: [{ type: 'RATING', text: 'Rate unlimited', required: true }],
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.data.maxResponses).toBeNull();
      const unlimId = createRes.body.data.id as string;
      const uq = createRes.body.data.questions[0];

      await request(app)
        .post(`/api/v1/surveys/${unlimId}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});

      const s1 = await request(app)
        .post(`/api/v1/surveys/${unlimId}/responses`)
        .set('Authorization', `Bearer ${resp1Token}`)
        .send({ answers: [{ questionId: uq.id, rating: 4 }] });
      expect(s1.status).toBe(201);

      const s2 = await request(app)
        .post(`/api/v1/surveys/${unlimId}/responses`)
        .set('Authorization', `Bearer ${resp2Token}`)
        .send({ answers: [{ questionId: uq.id, rating: 5 }] });
      expect(s2.status).toBe(201);

      const dbSurvey = await prisma.survey.findUnique({ where: { id: unlimId } });
      expect(dbSurvey!.status).toBe('PUBLISHED');
      expect(dbSurvey!.closedAt).toBeNull();

      const availRes = await request(app)
        .get('/api/v1/available-surveys')
        .set('Authorization', `Bearer ${resp1Token}`);
      expect(availRes.status).toBe(200);
      const found = availRes.body.data.find((s: any) => s.id === unlimId);
      expect(found).toBeDefined();
      expect(found.maxResponses).toBeNull();
    });
  });
});
