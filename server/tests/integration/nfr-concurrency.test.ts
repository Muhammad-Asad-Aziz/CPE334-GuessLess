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
