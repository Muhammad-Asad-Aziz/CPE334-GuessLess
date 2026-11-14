import { test, expect } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'change-me-seed-password';

test.describe('F-03 Respondent Discovery, Submission & History E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    // Ensure resp1 has no prior responses or participations before each test run
    const resp1 = await prisma.user.findUnique({ where: { email: 'resp1@example.edu' } });
    if (resp1) {
      const responses = await prisma.response.findMany({
        where: { respondentId: resp1.id },
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
      await prisma.participation.deleteMany({
        where: { respondentId: resp1.id },
      });
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('TEST-F03-01 & TEST-F03-03 & TEST-F03-04 & TEST-F03-09: Complete Respondent Journey', async ({ page }) => {
    // 1. Log in as resp1
    await page.goto('/login');
    await page.fill('#email', 'resp1@example.edu');
    await page.fill('#password', SEED_PASSWORD);
    await page.click('button[type="submit"]');

    // Directed to /available
    await expect(page).toHaveURL(/\/available/);

    // TEST-F03-03: Browse available surveys -> shows S-PUB, does NOT show draft or closed surveys
    await expect(page.locator('body')).toContainText('Seed: CPE334 Course Evaluation');
    await expect(page.locator('body')).not.toContainText('Seed: Draft Feedback Form');
    await expect(page.locator('body')).not.toContainText('Seed: Closed Alumni Survey');

    // Click "Answer Survey"
    await page.click('a:has-text("Answer Survey")');
    await expect(page).toHaveURL(/\/available\/[0-9a-f-]+/);

    // TEST-F03-01: Notice check and positioning ABOVE submit button
    const noticeLocator = page.locator('text=Identified survey: your answers are linked to your name and the survey owner can see them.');
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

    // TEST-F03-03: Verify S-PUB now shows "Responded" badge and "View my submission"
    await expect(page.locator('body')).toContainText('Responded');
    await expect(page.locator('a:has-text("View my submission")')).toBeVisible();

    // TEST-F03-04: Click "View my submission"
    await page.click('a:has-text("View my submission")');
    await expect(page).toHaveURL(/\/my-responses\/[0-9a-f-]+/);

    // Verify submission details page shows answers: "About right" and rating 4
    await expect(page.locator('body')).toContainText('Seed: CPE334 Course Evaluation');
    await expect(page.locator('body')).toContainText('About right');
    await expect(page.locator('body')).toContainText('4');

    // TEST-F03-09: Navigate to /my-responses
    await page.goto('/my-responses');
    await expect(page.locator('body')).toContainText('Seed: CPE334 Course Evaluation');
    await expect(page.locator('body')).toContainText('Published');
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
