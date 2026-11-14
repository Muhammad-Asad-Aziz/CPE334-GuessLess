import { test, expect } from '@playwright/test';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../../src/lib/prisma';

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'change-me-seed-password';

async function cleanupRespondent(respondentId: string) {
  const responses = await prisma.response.findMany({
    where: { respondentId },
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
  await prisma.participation.deleteMany({ where: { respondentId } });
  await prisma.surveyEligibility.deleteMany({ where: { respondentId } });
  await prisma.user.deleteMany({ where: { id: respondentId } });
}

test.describe('F-03 Respondent Discovery, Submission & History E2E', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('TEST-F03-01 & TEST-F03-03 & TEST-F03-04 & TEST-F03-09: Complete Respondent Journey', async ({
    page,
  }, testInfo) => {
    const owner1 = await prisma.user.findUnique({ where: { email: 'owner1@example.edu' } });
    expect(owner1, 'Seeded owner1@example.edu missing; run npm run seed first.').toBeTruthy();

    const sPub = await prisma.survey.findFirst({
      where: { ownerId: owner1!.id, title: 'Seed: CPE334 Course Evaluation' },
      select: { id: true, title: true },
    });
    expect(sPub, 'Seeded S-PUB survey missing; run npm run seed first.').toBeTruthy();

    // Isolated synthetic respondent prevents cross-worker races on resp1 and leaves seeded accounts clean
    const suffix = `${testInfo.project.name}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
    const tempResp = await prisma.user.create({
      data: {
        email: `e2e-f03-resp-${suffix}@example.edu`,
        displayName: 'Respondent One',
        passwordHash,
        role: 'RESPONDENT',
        isActive: true,
      },
    });

    try {
      // 1. Log in as synthetic respondent
      await page.goto('/login');
      await page.fill('#email', tempResp.email);
      await page.fill('#password', SEED_PASSWORD);
      await page.click('button[type="submit"]');

      // Directed to /available
      await expect(page).toHaveURL(/\/available/);

      // TEST-F03-03: Browse available surveys -> shows S-PUB, does NOT show draft or closed surveys
      await expect(page.locator('body')).toContainText('Seed: CPE334 Course Evaluation');
      await expect(page.locator('body')).not.toContainText('Seed: Draft Feedback Form');
      await expect(page.locator('body')).not.toContainText('Seed: Closed Alumni Survey');
      await expect(page.locator('body')).not.toContainText('Seed: Workshop Feedback');
      await expect(page.locator('body')).not.toContainText('Seed: Orientation Survey 2026');

      // Click "Answer Survey" specifically on the S-PUB card
      const sPubAnswerLink = page.locator(`a[href="/available/${sPub!.id}"]`);
      await expect(sPubAnswerLink).toContainText('Answer Survey');
      await sPubAnswerLink.click();
      await expect(page).toHaveURL(new RegExp(`/available/${sPub!.id}$`));

      // TEST-F03-01: Notice check and positioning ABOVE submit button
      const noticeLocator = page.locator(
        'text=Identified survey: your answers are linked to your name and the survey owner can see them.'
      );
      await expect(noticeLocator).toBeVisible();

      const submitButton = page.locator('button[type="submit"]:has-text("Submit")');
      await expect(submitButton).toBeVisible();

      // Verify notice is positioned vertically above the submit button
      const noticeBox = await noticeLocator.boundingBox();
      const submitBox = await submitButton.boundingBox();
      expect(noticeBox).toBeTruthy();
      expect(submitBox).toBeTruthy();
      expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(submitBox!.y);

      // Select Q1 "About right"
      await page.locator('label').filter({ hasText: 'About right' }).click();

      // Select Q2 rating 4 (click visible label button)
      await page.locator('label').filter({ hasText: /^4$/ }).click();

      // Submit response
      await submitButton.click();

      // Verify confirmation panel appears with Bangkok date/time
      await expect(page.locator('body')).toContainText('Response submitted on');
      await expect(page.locator('a:has-text("View my submission")')).toBeVisible();

      // Return to /available
      await page.goto('/available');

      // TEST-F03-03: Verify S-PUB card now shows "Responded" badge and "View my submission"
      const sPubViewLink = page.locator(`a[href="/my-responses/${sPub!.id}"]`);
      await expect(sPubViewLink).toBeVisible();
      const sPubCard = page.locator('div.bg-white', { has: sPubViewLink });
      await expect(sPubCard).toContainText('Seed: CPE334 Course Evaluation');
      await expect(sPubCard).toContainText('Responded');
      await expect(sPubViewLink).toContainText('View my submission');

      // TEST-F03-04: Click "View my submission"
      await sPubViewLink.click();
      await expect(page).toHaveURL(new RegExp(`/my-responses/${sPub!.id}$`));

      // Verify submission details page shows answers: "About right" and rating 4
      await expect(page.locator('body')).toContainText('Seed: CPE334 Course Evaluation');
      await expect(page.locator('body')).toContainText('About right');
      await expect(page.locator('body')).toContainText('4');

      // TEST-F03-09: Navigate to /my-responses
      await page.goto('/my-responses');
      await expect(page.locator('body')).toContainText('Seed: CPE334 Course Evaluation');
      await expect(page.locator('body')).toContainText('Published');
    } finally {
      await cleanupRespondent(tempResp.id);
    }
  });

  test('TEST-F03-09: Respondent with no answers sees empty state', async ({ page }) => {
    // Log in as resp3 (who has answered nothing)
    await page.goto('/login');
    await page.fill('#email', 'resp3@example.edu');
    await page.fill('#password', SEED_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/available/);

    // Visit /my-responses
    await page.goto('/my-responses');

    // Verify empty state text
    await expect(page.locator('body')).toContainText('You have not answered any surveys yet.');
  });
});
