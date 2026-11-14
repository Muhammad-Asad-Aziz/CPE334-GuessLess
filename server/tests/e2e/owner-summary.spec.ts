import { test, expect, type Page } from '@playwright/test';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../../src/lib/prisma';
import { calendarDay } from '../../src/domain/calendarDay';

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'change-me-seed-password';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', SEED_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/my-surveys/);
}

async function assertNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasOverflow).toBe(false);
}

async function cleanupSurveyAndUsers(surveyId: string, userIds: string[]) {
  const responses = await prisma.response.findMany({
    where: { surveyId },
    select: { id: true },
  });
  const responseIds = responses.map((r) => r.id);
  if (responseIds.length > 0) {
    await prisma.answerSelection.deleteMany({
      where: { answer: { responseId: { in: responseIds } } },
    });
    await prisma.answer.deleteMany({
      where: { responseId: { in: responseIds } },
    });
    await prisma.response.deleteMany({
      where: { id: { in: responseIds } },
    });
  }
  await prisma.participation.deleteMany({ where: { surveyId } });
  await prisma.surveyEligibility.deleteMany({ where: { surveyId } });
  await prisma.survey.deleteMany({ where: { id: surveyId } });
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

test.describe('F-04 Owner Aggregate Summary E2E', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('TEST-F04-02 (E2E): displays 3-response summary metrics and navigation from survey detail', async ({
    page,
  }, testInfo) => {
    const owner1 = await prisma.user.findUnique({ where: { email: 'owner1@example.edu' } });
    expect(owner1).toBeTruthy();

    const suffix = `${testInfo.project.name}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
    const respondents = await Promise.all(
      [1, 2, 3].map((idx) =>
        prisma.user.create({
          data: {
            email: `e2e-summary-r${idx}-${suffix}@example.edu`,
            displayName: `E2E Summary Resp ${idx}`,
            passwordHash,
            role: 'RESPONDENT',
            isActive: true,
          },
        })
      )
    );

    const survey = await prisma.survey.create({
      data: {
        ownerId: owner1!.id,
        title: `E2E Summary 3-Resp ${suffix}`,
        description: 'E2E summary verification survey.',
        mode: 'IDENTIFIED',
        status: 'PUBLISHED',
        eligibility: 'ALL',
        publishedAt: new Date('2025-01-01T00:00:00.000Z'),
        questions: {
          create: [
            {
              position: 1,
              type: 'SINGLE_CHOICE',
              text: 'How was the lab workload?',
              required: true,
              options: {
                create: [
                  { position: 1, text: 'Too light' },
                  { position: 2, text: 'About right' },
                  { position: 3, text: 'Too heavy' },
                ],
              },
            },
            {
              position: 2,
              type: 'RATING',
              text: 'Rate the course overall',
              required: true,
            },
          ],
        },
      },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          include: { options: { orderBy: { position: 'asc' } } },
        },
      },
    });

    const userIds = respondents.map((u) => u.id);

    try {
      const q1 = survey.questions[0];
      const q2 = survey.questions[1];
      const optRight = q1.options[1];
      const optHeavy = q1.options[2];

      const submittedAt = new Date();
      const dayDate = new Date(`${calendarDay(submittedAt)}T00:00:00.000Z`);

      const payloads = [
        { respondentId: respondents[0].id, optionId: optRight.id, ratingValue: 4 },
        { respondentId: respondents[1].id, optionId: optRight.id, ratingValue: 5 },
        { respondentId: respondents[2].id, optionId: optHeavy.id, ratingValue: 5 },
      ];

      for (const item of payloads) {
        await prisma.$transaction(async (tx) => {
          await tx.participation.create({
            data: {
              surveyId: survey.id,
              respondentId: item.respondentId,
              participatedDay: dayDate,
            },
          });
          await tx.response.create({
            data: {
              surveyId: survey.id,
              mode: 'IDENTIFIED',
              respondentId: item.respondentId,
              submittedDay: dayDate,
              submittedAt,
              answers: {
                create: [
                  {
                    questionId: q1.id,
                    selections: { create: [{ optionId: item.optionId }] },
                  },
                  {
                    questionId: q2.id,
                    ratingValue: item.ratingValue,
                  },
                ],
              },
            },
          });
        });
      }

      await loginAs(page, 'owner1@example.edu');
      await page.goto(`/my-surveys/${survey.id}`);
      await expect(page.locator('h1')).toContainText(survey.title);

      await page.getByRole('link', { name: 'View summary' }).click();
      await expect(page).toHaveURL(new RegExp(`/my-surveys/${survey.id}/summary$`));

      await expect(page.locator('h1')).toContainText(survey.title);
      await expect(page.locator('body')).toContainText('Total responses: 3');
      await expect(page.locator('body')).toContainText('Too light — 0 (0.0%)');
      await expect(page.locator('body')).toContainText('About right — 2 (66.7%)');
      await expect(page.locator('body')).toContainText('Too heavy — 1 (33.3%)');
      await expect(page.locator('body')).toContainText('Average 4.67 from 3 answers');
      await assertNoHorizontalOverflow(page);
    } finally {
      await cleanupSurveyAndUsers(survey.id, userIds);
    }
  });

  test('TEST-F04-02 (E2E): displays empty state for 0-response published survey and draft notice for draft', async ({
    page,
  }, testInfo) => {
    const owner1 = await prisma.user.findUnique({ where: { email: 'owner1@example.edu' } });
    expect(owner1).toBeTruthy();

    const suffix = `${testInfo.project.name}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const emptySurvey = await prisma.survey.create({
      data: {
        ownerId: owner1!.id,
        title: `E2E Summary Empty ${suffix}`,
        description: 'Zero response survey.',
        mode: 'IDENTIFIED',
        status: 'PUBLISHED',
        eligibility: 'ALL',
        publishedAt: new Date('2025-01-01T00:00:00.000Z'),
        questions: {
          create: [
            {
              position: 1,
              type: 'RATING',
              text: 'Rate this session',
              required: true,
            },
          ],
        },
      },
    });

    const draftSurvey = await prisma.survey.create({
      data: {
        ownerId: owner1!.id,
        title: `E2E Summary Draft ${suffix}`,
        description: 'Draft survey.',
        mode: 'IDENTIFIED',
        status: 'DRAFT',
        eligibility: 'ALL',
        publishedAt: null,
        questions: {
          create: [
            {
              position: 1,
              type: 'RATING',
              text: 'Draft rating',
              required: true,
            },
          ],
        },
      },
    });

    try {
      await loginAs(page, 'owner1@example.edu');
      await page.goto(`/my-surveys/${emptySurvey.id}/summary`);

      await expect(page.locator('h1')).toContainText(emptySurvey.title);
      await expect(page.locator('body')).toContainText('Total responses: 0');
      await expect(page.locator('body')).toContainText('No responses yet.');
      await assertNoHorizontalOverflow(page);

      await page.goto(`/my-surveys/${draftSurvey.id}/summary`);
      await expect(page.locator('body')).toContainText('A draft has no results yet.');
      await assertNoHorizontalOverflow(page);
    } finally {
      await cleanupSurveyAndUsers(emptySurvey.id, []);
      await cleanupSurveyAndUsers(draftSurvey.id, []);
    }
  });
});
