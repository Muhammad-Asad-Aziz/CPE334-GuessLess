import { test, expect, type Page } from '@playwright/test';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../src/lib/prisma';
import { calendarDay } from '../../src/domain/calendarDay';

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'change-me-seed-password';
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCREENSHOTS_ROOT = path.join(REPO_ROOT, 'artifacts', 'screenshots');

interface ControlBox {
  tag: string;
  label: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface GeometryAuditResult {
  scrollWidth: number;
  innerWidth: number;
  outOfBounds: ControlBox[];
  overlaps: Array<{
    a: ControlBox;
    b: ControlBox;
    overlapX: number;
    overlapY: number;
  }>;
}

async function loginViaUi(
  page: Page,
  email: string,
  expectedUrlPattern: RegExp
) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', SEED_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(expectedUrlPattern);
}

async function logoutViaStorage(page: Page) {
  await page.evaluate(() => {
    sessionStorage.removeItem('auth_token');
  });
}

async function assertResponsiveLayoutAndCapture(
  page: Page,
  width: number,
  screenSlug: string
) {
  // Wait for any initial spinner to finish before measuring geometry
  await expect(page.locator('[role="status"][aria-label*="Loading"], .animate-spin')).toHaveCount(0, {
    timeout: 10000,
  }).catch(() => {
    // Fallback if page has no spinner locator
  });

  const audit: GeometryAuditResult = await page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('button, input, select, textarea, a')
    );

    const visibleControls: Array<{ el: HTMLElement; box: ControlBox }> = [];

    for (const el of candidates) {
      if (el.closest('dialog:not([open])')) continue;
      if (el.classList.contains('sr-only')) continue;

      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity) === 0
      ) {
        continue;
      }

      if (style.clip === 'rect(0px, 0px, 0px, 0px)') {
        continue;
      }

      if (
        typeof el.checkVisibility === 'function' &&
        !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      ) {
        continue;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) {
        continue;
      }

      const rawLabel =
        el.getAttribute('aria-label') ||
        el.innerText ||
        (el as HTMLInputElement).placeholder ||
        el.id ||
        el.getAttribute('name') ||
        el.tagName.toLowerCase();

      visibleControls.push({
        el,
        box: {
          tag: el.tagName.toLowerCase(),
          label: rawLabel.replace(/\s+/g, ' ').trim().slice(0, 60),
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      });
    }

    const outOfBounds: ControlBox[] = [];
    for (const item of visibleControls) {
      if (item.box.left < -0.5 || item.box.right > innerWidth + 0.5) {
        outOfBounds.push(item.box);
      }
    }

    const overlaps: GeometryAuditResult['overlaps'] = [];
    const EPS = 1; // Ignore <=1px shared border contact
    for (let i = 0; i < visibleControls.length; i++) {
      for (let j = i + 1; j < visibleControls.length; j++) {
        const a = visibleControls[i];
        const b = visibleControls[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) {
          continue;
        }
        const overlapX = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
        const overlapY = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
        if (overlapX > EPS && overlapY > EPS) {
          overlaps.push({
            a: a.box,
            b: b.box,
            overlapX: Math.round(overlapX * 100) / 100,
            overlapY: Math.round(overlapY * 100) / 100,
          });
        }
      }
    }

    return {
      scrollWidth,
      innerWidth,
      outOfBounds,
      overlaps,
    };
  });

  expect(
    audit.scrollWidth,
    `Horizontal overflow on ${screenSlug} at ${width}px: scrollWidth=${audit.scrollWidth}, innerWidth=${audit.innerWidth}`
  ).toBeLessThanOrEqual(audit.innerWidth);

  expect(
    audit.outOfBounds,
    `Controls extend outside viewport on ${screenSlug} at ${width}px: ${JSON.stringify(audit.outOfBounds)}`
  ).toEqual([]);

  expect(
    audit.overlaps,
    `Overlapping interactive controls on ${screenSlug} at ${width}px: ${JSON.stringify(audit.overlaps)}`
  ).toEqual([]);

  const outDir = path.join(SCREENSHOTS_ROOT, `${width}px`);
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({
    path: path.join(outDir, `${screenSlug}.png`),
    fullPage: true,
  });
}

test.describe('TEST-NFR-04 Responsive UI & Screenshots (360 / 768 / 1280 px)', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('verifies zero horizontal overflow, zero overlapping controls, and captures all 7 Sprint 1 screens', async ({
    page,
  }, testInfo) => {
    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    const width = viewport!.width;
    expect([360, 768, 1280]).toContain(width);

    const owner1 = await prisma.user.findUnique({ where: { email: 'owner1@example.edu' } });
    expect(owner1, 'Seeded owner1@example.edu missing; run npm run seed first.').toBeTruthy();

    const sPub = await prisma.survey.findFirst({
      where: { ownerId: owner1!.id, title: 'Seed: CPE334 Course Evaluation' },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          include: { options: { orderBy: { position: 'asc' } } },
        },
      },
    });
    const sDraft = await prisma.survey.findFirst({
      where: { ownerId: owner1!.id, title: 'Seed: Workshop Feedback' },
    });
    const sClosed = await prisma.survey.findFirst({
      where: { ownerId: owner1!.id, title: 'Seed: Orientation Survey 2026' },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          include: { options: { orderBy: { position: 'asc' } } },
        },
      },
    });

    expect(sPub, 'Seeded S-PUB survey missing; run npm run seed first.').toBeTruthy();
    expect(sDraft, 'Seeded S-DRAFT survey missing; run npm run seed first.').toBeTruthy();
    expect(sClosed, 'Seeded S-CLOSED survey missing; run npm run seed first.').toBeTruthy();

    // Create an isolated synthetic respondent with 1 recorded response on S-CLOSED so
    // /my-responses is verified in its populated state across parallel viewport projects
    // without mutating resp1 or S-PUB.
    const suffix = `${testInfo.project.name}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const tempRespEmail = `e2e-nfr04-resp-${suffix}@example.edu`;
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
    const tempResp = await prisma.user.create({
      data: {
        email: tempRespEmail,
        displayName: 'Responsive Check Resp',
        passwordHash,
        role: 'RESPONDENT',
        isActive: true,
      },
    });

    try {
      const submittedAt = new Date();
      const dayDate = new Date(`${calendarDay(submittedAt)}T00:00:00.000Z`);
      const closedQ1 = sClosed!.questions[0];

      await prisma.$transaction(async (tx) => {
        await tx.participation.create({
          data: {
            surveyId: sClosed!.id,
            respondentId: tempResp.id,
            participatedDay: dayDate,
          },
        });
        await tx.response.create({
          data: {
            surveyId: sClosed!.id,
            mode: 'IDENTIFIED',
            respondentId: tempResp.id,
            submittedDay: dayDate,
            submittedAt,
            answers: {
              create: [
                {
                  questionId: closedQ1.id,
                  selections: {
                    create: [{ optionId: closedQ1.options[0].id }],
                  },
                },
              ],
            },
          },
        });
      });

      // 1. /login (Public)
      await page.goto('/login');
      await expect(page.locator('h1')).toContainText('Sign in to GuessLess');
      await assertResponsiveLayoutAndCapture(page, width, '01-login');

      // 2. /available (Seeded Respondent: resp2 — isolated from respondent-submit.spec.ts resp1)
      await loginViaUi(page, 'resp2@example.edu', /\/available$/);
      await expect(page.locator('h1')).toContainText('Available Surveys');
      await expect(page.locator('body')).toContainText(sPub!.title);
      await assertResponsiveLayoutAndCapture(page, width, '02-available');

      // 3. /available/{S-PUB} (Rendered survey form before resp2 submits)
      await page.goto(`/available/${sPub!.id}`);
      await expect(page.locator('h1')).toContainText(sPub!.title);
      await expect(page.locator('button[type="submit"]:has-text("Submit")')).toBeVisible();
      await assertResponsiveLayoutAndCapture(page, width, '03-available-survey-form');

      // 4a. /my-responses (Empty state for clean resp2)
      await page.goto('/my-responses');
      await expect(page.locator('h1')).toContainText('My Submissions');
      await expect(page.locator('body')).toContainText('You have not answered any surveys yet.');
      await assertResponsiveLayoutAndCapture(page, width, '04a-my-responses-empty');

      // 4b. /my-responses (Populated state with isolated synthetic respondent)
      await logoutViaStorage(page);
      await loginViaUi(page, tempRespEmail, /\/available$/);
      await page.goto('/my-responses');
      await expect(page.locator('h1')).toContainText('My Submissions');
      await expect(page.locator('body')).toContainText(sClosed!.title);
      await assertResponsiveLayoutAndCapture(page, width, '04-my-responses');

      // 5. /my-surveys/new (Seeded Survey Owner: owner1)
      await logoutViaStorage(page);
      await loginViaUi(page, 'owner1@example.edu', /\/my-surveys$/);
      await page.goto('/my-surveys/new');
      await expect(page.locator('h1')).toContainText('Create Survey');
      await page.getByRole('button', { name: 'Add question' }).click();
      await page.getByRole('button', { name: 'Add option' }).click();
      await page.getByRole('button', { name: 'Add option' }).click();
      await assertResponsiveLayoutAndCapture(page, width, '05-my-surveys-new');

      // 6. /my-surveys/{S-DRAFT} (Seeded Survey Owner: owner1)
      await page.goto(`/my-surveys/${sDraft!.id}`);
      await expect(page.locator('h1')).toContainText(sDraft!.title);
      await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
      await assertResponsiveLayoutAndCapture(page, width, '06-my-surveys-draft');

      // 7. /my-surveys/{S-PUB}/summary (Seeded Survey Owner: owner1)
      await page.goto(`/my-surveys/${sPub!.id}/summary`);
      await expect(page.locator('h1')).toContainText(sPub!.title);
      await expect(page.locator('body')).toContainText('Total responses:');
      await assertResponsiveLayoutAndCapture(page, width, '07-my-surveys-summary');
    } finally {
      const tempResponses = await prisma.response.findMany({
        where: { respondentId: tempResp.id },
        select: { id: true },
      });
      const responseIds = tempResponses.map((r) => r.id);
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
      await prisma.participation.deleteMany({ where: { respondentId: tempResp.id } });
      await prisma.user.deleteMany({ where: { id: tempResp.id } });
    }
  });
});
