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

describe('TEST-NFR-06: Concurrency Safety Under 20 Parallel Submissions (AC-F03-05, BR-01, NFR-06)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  // Repeat 3 independent runs with fresh fixtures
  for (let run = 1; run <= 3; run++) {
    it(`Run ${run}/3: 20 simultaneous submissions store exactly 1 response and reject 19 with 409`, async () => {
      const owner = await createUser({
        email: `owner-conc-${run}@example.edu`,
        password: 'Password1!',
        role: 'SURVEY_OWNER',
      });

      const respondent = await createUser({
        email: `resp-conc-${run}@example.edu`,
        password: 'Password1!',
        role: 'RESPONDENT',
      });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: respondent.email, password: 'Password1!' });
      const token = loginRes.body.data.token;

      const survey = await createSurvey(owner.id, {
        title: `Concurrency Survey Run ${run}`,
        status: 'PUBLISHED',
        mode: 'IDENTIFIED',
      });

      const q1 = await createQuestion(survey.id, {
        position: 1,
        type: 'SINGLE_CHOICE',
        required: true,
      });
      const o1 = await createOption(q1.id, { position: 1, text: 'Opt 1' });

      const q2 = await createQuestion(survey.id, {
        position: 2,
        type: 'RATING',
        required: true,
      });

      const payload = {
        answers: [
          { questionId: q1.id, optionIds: [o1.id] },
          { questionId: q2.id, rating: 5 },
        ],
      };

      // Fire 20 identical submissions simultaneously
      const requests = Array.from({ length: 20 }, () =>
        request(app)
          .post(`/api/v1/surveys/${survey.id}/responses`)
          .set('Authorization', `Bearer ${token}`)
          .send(payload)
      );

      const responses = await Promise.all(requests);

      // Verify HTTP statuses
      const successResponses = responses.filter((r) => r.status === 201);
      const duplicateResponses = responses.filter(
        (r) => r.status === 409 && r.body.error?.code === 'DUPLICATE_RESPONSE'
      );

      expect(successResponses.length).toBe(1);
      expect(duplicateResponses.length).toBe(19);

      // Verify Database state: exactly 1 Participation and 1 Response
      const participationCount = await prisma.participation.count({
        where: { surveyId: survey.id, respondentId: respondent.id },
      });
      const responseCount = await prisma.response.count({
        where: { surveyId: survey.id, respondentId: respondent.id },
      });
      const answerCount = await prisma.answer.count({
        where: { response: { surveyId: survey.id, respondentId: respondent.id } },
      });

      expect(participationCount).toBe(1);
      expect(responseCount).toBe(1);
      expect(answerCount).toBe(2);
    });
  }
});

describe('TEST-F03-11: Concurrency Safety Under 10 Parallel Distinct Respondents on maxResponses = 1 (AC-F03-11, FR-03, BR-02, NFR-06, CHG-14)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  for (let run = 1; run <= 3; run++) {
    it(`Run ${run}/3: 10 parallel distinct respondents on maxResponses = 1 yield 1x201 and 9x409 SURVEY_NOT_OPEN`, async () => {
      const owner = await createUser({
        email: `owner-quota-conc-${run}@example.edu`,
        password: 'Password1!',
        role: 'SURVEY_OWNER',
      });
      const ownerLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password: 'Password1!' });
      expect(ownerLogin.status).toBe(200);
      const ownerToken = ownerLogin.body.data.token as string;

      const respondents = await Promise.all(
        Array.from({ length: 10 }, (_, idx) =>
          createUser({
            email: `resp-quota-conc-${run}-${idx}@example.edu`,
            password: 'Password1!',
            role: 'RESPONDENT',
          })
        )
      );

      const tokens = await Promise.all(
        respondents.map(async (r) => {
          const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: r.email, password: 'Password1!' });
          expect(loginRes.status).toBe(200);
          return loginRes.body.data.token as string;
        })
      );

      const createRes = await request(app)
        .post('/api/v1/surveys')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: `Quota Concurrency Survey Run ${run}`,
          maxResponses: 1,
          questions: [
            {
              type: 'SINGLE_CHOICE',
              text: 'Choice question',
              required: true,
              options: [{ text: 'Opt 1' }, { text: 'Opt 2' }],
            },
            {
              type: 'RATING',
              text: 'Rating question',
              required: true,
            },
          ],
        });
      expect(createRes.status).toBe(201);
      const survey = createRes.body.data;
      const q1 = survey.questions[0];
      const q2 = survey.questions[1];

      const pubRes = await request(app)
        .post(`/api/v1/surveys/${survey.id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});
      expect(pubRes.status).toBe(200);

      const payload = {
        answers: [
          { questionId: q1.id, optionIds: [q1.options[0].id] },
          { questionId: q2.id, rating: 5 },
        ],
      };

      const responses = await Promise.all(
        tokens.map((token) =>
          request(app)
            .post(`/api/v1/surveys/${survey.id}/responses`)
            .set('Authorization', `Bearer ${token}`)
            .send(payload)
        )
      );

      const created = responses.filter((r) => r.status === 201);
      const rejectedClosed = responses.filter(
        (r) => r.status === 409 && r.body.error?.code === 'SURVEY_NOT_OPEN'
      );

      expect(created.length).toBe(1);
      expect(rejectedClosed.length).toBe(9);

      const responseCount = await prisma.response.count({ where: { surveyId: survey.id } });
      const participationCount = await prisma.participation.count({ where: { surveyId: survey.id } });
      const answerCount = await prisma.answer.count({
        where: { response: { surveyId: survey.id } },
      });
      const dbSurvey = await prisma.survey.findUnique({ where: { id: survey.id } });

      expect(responseCount).toBe(1);
      expect(participationCount).toBe(1);
      expect(answerCount).toBe(2);
      expect(dbSurvey!.status).toBe('CLOSED');
      expect(dbSurvey!.closedAt).not.toBeNull();
    });
  }
});
