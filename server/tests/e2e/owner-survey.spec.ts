import { test, expect, type Page } from '@playwright/test';

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

test.describe('F-02 Owner Survey Lifecycle E2E', () => {
  test('TEST-F02-02 (E2E): create complete draft in builder and save incomplete draft', async ({
    page,
  }, testInfo) => {
    await loginAs(page, 'owner1@example.edu');
    await page.goto('/my-surveys/new');
    await assertNoHorizontalOverflow(page);

    const uniqueTitle = `E2E Complete Draft ${testInfo.project.name} ${Date.now()}`;
    await page.fill('#survey-title', uniqueTitle);
    await page.fill('#survey-description', 'Week 10 lab evaluation');

    // Question 1: Single choice with two options
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.fill('[data-field-key="questions-0-text"]', 'Was the lab clear?');
    await page.getByRole('button', { name: 'Add option' }).click();
    await page.getByRole('button', { name: 'Add option' }).click();
    await page.fill('[data-field-key="questions-0-options-0-text"]', 'Yes');
    await page.fill('[data-field-key="questions-0-options-1-text"]', 'No');

    // Question 2: Rating 1-5
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.selectOption('[data-field-key="questions-1-type"]', 'RATING');
    await page.fill('[data-field-key="questions-1-text"]', 'Rate the lab');

    await page.getByRole('button', { name: 'Save draft' }).click();

    await expect(page).toHaveURL(/\/my-surveys\/[0-9a-f-]+$/);
    await expect(page.getByRole('status')).toContainText('Draft saved.');
    await expect(page.locator('h1')).toContainText(uniqueTitle);
    await expect(page.locator('body')).toContainText('1. Was the lab clear?');
    await expect(page.locator('body')).toContainText('2. Rate the lab');
    await expect(page.locator('body')).toContainText('Editing drafts arrives in Sprint 2.');
    await assertNoHorizontalOverflow(page);

    // Incomplete draft: empty title, 0 questions -> "Untitled survey" + publish fails with both checks
    await page.goto('/my-surveys/new');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\/my-surveys\/[0-9a-f-]+$/);
    await expect(page.locator('h1')).toContainText('Untitled survey');
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('body')).toContainText('This survey cannot be published yet:');
    await expect(page.locator('body')).toContainText('title:');
    await expect(page.locator('body')).toContainText('questions:');
  });

  test('TEST-F02-03 (E2E): publish complete draft from detail page', async ({
    page,
  }, testInfo) => {
    await loginAs(page, 'owner1@example.edu');
    const uniqueTitle = `E2E Publish Survey ${testInfo.project.name} ${Date.now()}`;

    await page.goto('/my-surveys/new');
    await page.fill('#survey-title', uniqueTitle);
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.selectOption('[data-field-key="questions-0-type"]', 'RATING');
    await page.fill('[data-field-key="questions-0-text"]', 'Rate this course');
    await page.getByRole('button', { name: 'Save draft' }).click();

    await expect(page).toHaveURL(/\/my-surveys\/[0-9a-f-]+$/);
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByRole('status')).toContainText('Survey published.');
    await expect(page.locator('body')).toContainText('Published');
    await expect(page.getByRole('button', { name: 'Close survey' })).toBeVisible();
  });

  test('TEST-F02-05 (E2E): owner2 with no surveys sees empty state on /my-surveys', async ({
    page,
  }) => {
    await loginAs(page, 'owner2@example.edu');
    await assertNoHorizontalOverflow(page);
    await expect(page.locator('body')).toContainText(
      'No surveys yet. Create your first survey.'
    );
  });

  test('TEST-F02-06 (E2E): close published survey via confirmation dialog', async ({
    page,
  }, testInfo) => {
    await loginAs(page, 'owner1@example.edu');
    const uniqueTitle = `E2E Close Survey ${testInfo.project.name} ${Date.now()}`;

    // Create and publish via UI so this test is isolated across parallel viewport projects
    await page.goto('/my-surveys/new');
    await page.fill('#survey-title', uniqueTitle);
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.selectOption('[data-field-key="questions-0-type"]', 'RATING');
    await page.fill('[data-field-key="questions-0-text"]', 'Final rating');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\/my-surveys\/[0-9a-f-]+$/);

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByRole('button', { name: 'Close survey' })).toBeVisible();

    await page.getByRole('button', { name: 'Close survey' }).click();

    const dialog = page.locator('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Closing is final. No new responses will be accepted.');

    await dialog.getByRole('button', { name: 'Close survey' }).click();

    await expect(page.getByRole('status')).toContainText('Survey closed.');
    await expect(page.locator('body')).toContainText('Closed');
    await expect(page.getByRole('button', { name: 'Close survey' })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
  });
});
