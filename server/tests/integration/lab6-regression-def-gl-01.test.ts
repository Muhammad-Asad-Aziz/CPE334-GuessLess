import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
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

describe('Lab 6 DEF-GL-01 Regression (FR-02, BR-04, AC-F02-04): publish requires non-empty title', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('DEF-GL-01 (UAT-GL-02): rejects publishing draft with blank title and 1 option with both title and questions[0].options errors and keeps DRAFT in DB', async () => {
    const owner = await createUser({
      email: 'owner1@example.edu',
      password: 'Password123!',
      role: 'SURVEY_OWNER',
    });
    const token = await loginAs(owner.email);

    const draft = await createSurveyWithQuestions(owner.id, {
      title: '',
      status: 'DRAFT',
      questions: [
        {
          type: 'SINGLE_CHOICE',
          text: 'Was the session helpful?',
          options: [{ text: 'Only option' }],
        },
      ],
    });

    const res = await request(app)
      .post(`/api/v1/surveys/${draft.id}/publish`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('The survey cannot be published yet.');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { field: 'title', issue: 'must not be empty to publish' },
        {
          field: 'questions[0].options',
          issue: 'a choice question needs at least 2 options to publish',
        },
      ])
    );

    const dbSurvey = await prisma.survey.findUnique({ where: { id: draft.id } });
    expect(dbSurvey?.status).toBe('DRAFT');
    expect(dbSurvey?.publishedAt).toBeNull();
  });

  it.each([
    { label: 'blank ("")', title: '' },
    { label: 'whitespace-only ("   ")', title: '   ' },
  ])(
    'DEF-GL-01 root cause: rejects publishing draft with $label title and valid 2-option question and keeps DRAFT in DB',
    async ({ title }) => {
      const owner = await createUser({
        email: 'owner1@example.edu',
        password: 'Password123!',
        role: 'SURVEY_OWNER',
      });
      const token = await loginAs(owner.email);

      const draft = await createSurveyWithQuestions(owner.id, {
        title,
        status: 'DRAFT',
        questions: [
          {
            type: 'SINGLE_CHOICE',
            text: 'Was the session helpful?',
            options: [{ text: 'Yes' }, { text: 'No' }],
          },
        ],
      });

      const res = await request(app)
        .post(`/api/v1/surveys/${draft.id}/publish`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          { field: 'title', issue: 'must not be empty to publish' },
        ])
      );

      const dbSurvey = await prisma.survey.findUnique({ where: { id: draft.id } });
      expect(dbSurvey?.status).toBe('DRAFT');
      expect(dbSurvey?.publishedAt).toBeNull();
    }
  );
});
