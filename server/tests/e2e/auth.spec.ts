import { test, expect } from '@playwright/test';

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'change-me-seed-password';

test.describe('F-01 Authentication & UI Sessions E2E', () => {
  test('TEST-F01-04 (E2E): Owner login shows identity and role in navbar and redirects to /my-surveys', async ({ page }) => {
    await page.goto('/login');

    // Enter owner credentials
    await page.fill('#email', 'owner1@example.edu');
    await page.fill('#password', SEED_PASSWORD);
    await page.click('button[type="submit"]');

    // Verify redirected to /my-surveys
    await expect(page).toHaveURL(/\/my-surveys/);

    // Verify navbar displays Owner One and Survey Owner
    await expect(page.locator('header')).toContainText('Owner One');
    await expect(page.locator('header')).toContainText('Survey Owner');

    // Verify token exists in sessionStorage
    const token = await page.evaluate(() => sessionStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
  });

  test('TEST-F01-03 (E2E): Respondent logout clears session and redirects to /login', async ({ page }) => {
    await page.goto('/login');

    // Enter respondent credentials
    await page.fill('#email', 'resp1@example.edu');
    await page.fill('#password', SEED_PASSWORD);
    await page.click('button[type="submit"]');

    // Verify redirected to /available
    await expect(page).toHaveURL(/\/available/);
    await expect(page.locator('header')).toContainText('Respondent One');

    // Click Log out button
    await page.click('button[aria-label="Log out"]');

    // Verify redirected to /login
    await expect(page).toHaveURL(/\/login/);

    // Verify sessionStorage has no token
    const tokenAfterLogout = await page.evaluate(() => sessionStorage.getItem('auth_token'));
    expect(tokenAfterLogout).toBeNull();

    // Trying to visit /available directly redirects to /login
    await page.goto('/available');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Admin login redirects to / and shows administrator notice with zero survey links', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', 'admin1@example.edu');
    await page.fill('#password', SEED_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/');
    await expect(page.locator('body')).toContainText('Signed in as Administrator. Account administration arrives in Sprint 3.');

    // Ensure no survey links in navigation
    await expect(page.locator('header a[href="/my-surveys"]')).toHaveCount(0);
    await expect(page.locator('header a[href="/available"]')).toHaveCount(0);
  });

  test('TEST-F01-02 (E2E): Invalid login displays error banner and retains email', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', 'resp1@example.edu');
    await page.fill('#password', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    // Expect error message
    await expect(page.locator('body')).toContainText('Email or password is incorrect.');

    // Email input still retains entered value
    await expect(page.locator('#email')).toHaveValue('resp1@example.edu');

    // Password input is cleared
    await expect(page.locator('#password')).toHaveValue('');
  });
});
