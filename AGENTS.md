# AGENTS.md — Engineering Rules for AI Coding Agents

**Project:** Survey and Feedback System (`CPE334-GuessLess`, Theme 10)  
**Workflow:** Spec-Driven Development (SDD) + Test-Driven Development (TDD)

At the start of every session, read this file and the relevant specification files before proposing or writing code.

---

## 1. Source-of-Truth Reading Order

1. `AGENTS.md` (this file — workflow, stack, and non-negotiable guardrails)
2. `docs/srs.md` (requirements `FR-01`–`FR-21`, business rules `BR-01`–`BR-14`, `NFR-01`–`NFR-12`, domain limits)
3. `docs/system-sds.md` (architecture, Prisma schema, raw SQL constraints, API/error format, auth, UI conventions)
4. Active sprint contracts in `docs/sprints/sprint-1/`:
   - `README.md` and `definition-of-done.md`
   - The specific feature contract for the current Issue (`F-01-authentication.md` to `F-04-summary.md`)
   - `nfr-test-specification.md`

---

## 2. Tech Stack & Directory Layout

- **Backend (`server/`):** Node.js LTS, TypeScript, Express (`/api/v1`), Prisma ORM, PostgreSQL 16, Zod (`.strict()`), `bcrypt`, `jsonwebtoken`, `helmet`, `pino`
- **Frontend (`client/`):** React, TypeScript, Vite, Tailwind CSS, React Router
- **Testing (`server/tests/`):** Vitest (unit & integration), Supertest (HTTP), Playwright (E2E), `gitleaks` (secret scan)
- **Pure domain rules (`server/src/domain/`):** Must have zero database, Express, or HTTP imports so they remain fast and unit-testable.

---

## 3. Non-Negotiable Engineering Guardrails

1. **Closed-World Rule:** Never invent requirements, endpoints, status codes, database columns, or relax limits. If a contract is silent or ambiguous, stop and ask the developer.
2. **Plan First:** Before editing code for an Issue, list the files to create/modify, tests to add/run, and any assumptions.
3. **TDD for Business Rules (`D-4`):** For tests marked `TDD` (`TEST-F02-04`, `TEST-F02-07`, `TEST-F03-05`, `TEST-F03-06`, `TEST-F03-07`), write the failing test first and capture the failing run **before** implementing the production code. Never weaken, skip, or disable a required test.
4. **Server-Side Authority (`BR-08`, `NFR-05`):**
   - Validate all request bodies with strict Zod schemas (`.strict()`), rejecting unknown or server-owned fields (`ownerId`, `userId`, `role`, `status`, `submittedAt`) with `400 VALIDATION_ERROR`.
   - JWT contains `sub` and `jti` only (no role claim). `authenticate` reads `role` and `isActive` from PostgreSQL on every request and checks `RevokedToken`.
   - Wrong role returns `403 FORBIDDEN`. Another user's record or a non-existent/non-UUID id returns `404 NOT_FOUND` with identical error shape and zero private data.
5. **Error & Logging Safety (`NFR-08`, `NFR-09`):**
   - Use the central error format `{ "error": { "code", "message", "details"?, "requestId" } }` and echo `X-Request-Id`. Never leak stack traces, SQL, file paths, or password hashes.
   - Never commit `.env` or real secrets; `.env.example` holds placeholders only. `config.ts` must reject `JWT_SECRET < 32` chars and `BCRYPT_COST < 10` outside `NODE_ENV=test`.
6. **Time & Calculations (`FR-04`, `D-14`):**
   - Store timestamps in UTC; compute calendar days in `Asia/Bangkok` (UTC+7) via `domain/calendarDay.ts`.
   - Compute summary aggregates in SQL; compute percentages (1 decimal place) and rating means (2 decimal places) with integer half-up rounding, returning `null` when `answered = 0`.
7. **Real Database Tests Only:** Integration tests must run against `TEST_DATABASE_URL` (`NODE_ENV=test`, `BCRYPT_COST=4`), never the development database, and never mock persistence.
8. **UI & Responsive Basics (`NFR-04`):** English UI (UTF-8 content supported), visible form labels, disabled submit buttons while pending, `ErrorBanner` showing `requestId`, response-mode notice above the submit button, and zero horizontal overflow at `360`, `768`, and `1280` px.

---

## 4. Git & PR Norms

- Implement one bounded GitHub Issue at a time on a branch created from `sprint-1`.
- Never commit directly to `main` or approve your own PR.
- Keep separate Red and Green commits for TDD issues; do not squash-merge TDD branches into `sprint-1`.
- An AI claim that "tests pass" is not evidence — always run the exact commands and inspect the pass/fail/skip output.

---

## 5. Current Context Handoff

- **Current Sprint:** Sprint 1 (`sprint1-staging` branch in Git; referred to as `sprint-1` in docs)
- **Active Baseline:** `v1.0` (`docs/srs.md`, `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md`, `docs/sprints/plan.md`, `docs/sprints/sprint-1/*`)
- **Last Completed:** Issue #7 (`F-04` Aggregate Survey Results Summary) implemented & locally verified on `feat/7-f04-summary-api` (ready for PR into `sprint1-staging`; `20` Vitest files / `191` tests passing, `6/6` `owner-summary.spec.ts` E2E passing). Issues #1–#6 integrated on `sprint1-staging` (`8be9c21`).

### Completed Work (Issues #1–#7)

- **Issue #1 (`docs/baseline-and-sprint1-contracts`):** Product baseline (`v1.0`) and approved Sprint 1 contracts (`F-01`–`F-04`, `nfr-test-specification.md`, `definition-of-done.md`).
- **Issue #2 (`feat/2-project-scaffold`):** Monorepo scaffold, 10-model Prisma schema & migrations (`0001`, `0002` check constraints), fail-fast `config/`, Express `/api/v1/health`, Zen Green layout/components, and Vitest/Supertest harness.
- **Issue #3 (`feat/3-f01-authentication` — `F-01`):** `AuthService.ts`, `routes/auth.ts` (`login`, `logout`, `me`), `authenticate` + `requireRole` middleware, `RevokedToken` revocation, `prisma/seed.ts`, `LoginPage.tsx`, `AdminHomePage.tsx`, `Navbar.tsx`, plus `auth.test.ts`, `nfr-passwords.test.ts`, `rbac-matrix.test.ts`, and `auth.spec.ts`.
- **Issue #4 (`feat/4-domain-engine-and-owner-ui` — `F-02`/`F-04` domain + owner UI):** Pure domain rules (`surveyLifecycle.ts`, `effectiveStatus.ts`, `summaryMath.ts` with `buildSummary`, `calendarDay.ts`), strict `createSurveySchema`, and owner UI pages (`MySurveysPage.tsx`, `NewSurveyPage.tsx`, `SurveyDetailPage.tsx`, `SummaryPage.tsx`, `ownerUtils.ts`).
- **Issue #5 (`feat/5-f03-respondent-responses` — `F-03`):** `validateAnswers.ts`, `ResponseService.ts`, `routes/availableSurveys.ts`, `routes/responses.ts`, `routes/myResponses.ts`, `mapPrismaError` (`errors.ts`), respondent UI (`AvailableSurveysPage.tsx`, `TakeSurveyPage.tsx`, `MyResponsesPage.tsx`, `SubmissionDetailPage.tsx`), `seed.ts` relation cleanup, plus `validateAnswers.test.ts`, `errorMapping.test.ts`, `available-surveys.test.ts`, `responses.test.ts`, `my-responses.test.ts`, `nfr-concurrency.test.ts`, and `respondent-submit.spec.ts`.
- **Issue #6 (`feat/6-f02-survey-lifecycle-api` — `F-02` API + UI wiring):** `SurveyService.ts`, `routes/surveys.ts`, expanded `surveySchema.ts`, owner route wiring in `client/src/App.tsx`, overloaded `createResponse` in `factories.ts`, plus `surveys.test.ts`, `surveys.ownership.test.ts`, extended `rbac-matrix.test.ts`, and `owner-survey.spec.ts`.
- **Issue #7 (`feat/7-f04-summary-api` — `F-04` Summary API + UI wiring, pending PR into `sprint1-staging`):** `SummaryService.ts` (SQL count/`groupBy` aggregates passed to `buildSummary`), per-route `GET /api/v1/surveys/:id/summary` in `routes/surveys.ts`, `/my-surveys/:surveyId/summary` route wiring in `client/src/App.tsx` to `SummaryPage.tsx`, plus `tests/integration/summary.test.ts` (`TEST-F04-02`–`04`), extended `rbac-matrix.test.ts` (route `#8`), and `tests/e2e/owner-summary.spec.ts` (`6/6` passing across `360`/`768`/`1280` px).

### Codebase Conventions Established (Important for Upcoming Issues)

- **Per-route role guards on `/api/v1/surveys`:** `surveysRouter`, `responsesRouter`, and `myResponsesRouter` share the `/api/v1/surveys` prefix in `server/src/app.ts`. Always attach `authenticate` and `requireRole(...)` **per route** (never router-level `.use(...)` on `surveysRouter`) so `F-02`, `F-03`, and `F-04` sub-routes never block each other with `403`.
- **Implemented Sprint 1 route & helper baseline:** All `PROTECTED_ROUTES` `#1`–`#14` (`tests/helpers/routes.ts`) are implemented (`F-01`–`F-04`), and overloaded `createResponse` (`tests/helpers/factories.ts`: `(surveyId, respondentId, answers?, submittedAt?)` or `(surveyId, overrides?)`) is available.
- **E2E test isolation:** `GET /api/v1/available-surveys` sorts `publishedAt DESC`. `owner-summary.spec.ts` creates/cleans isolated surveys and synthetic respondents per test; `respondent-submit.spec.ts` and `owner-survey.spec.ts` (`TEST-F02-05`) require a clean re-seed (`npm run seed`), zero `owner2` dev-DB surveys, and non-overlapping `resp1` execution when running the full Playwright suite.

### Next Up (Wave 3 — Issues #8 & #9)

- **Issue #8 (Cross-Feature Integration):** End-to-end HTTP verification across `F-02` + `F-03` + `F-04` (`TEST-F02-03`/`TEST-F02-06`/`TEST-F04-02`, including `POST /api/v1/surveys/:id/responses` -> `GET /api/v1/surveys/:id/summary`).
- **Issue #9 (Sprint 1 NFR Verification):** Remaining Sprint 1 NFR checks (`TEST-NFR-01` 1,000-response p95 benchmark, `TEST-NFR-03` token auth matrix, `TEST-NFR-04` responsive checks + screenshots, `TEST-NFR-05` Express-vs-`routes.ts` audit, `TEST-NFR-07` restart durability, `TEST-NFR-08` safe error handling, `TEST-NFR-09` `gitleaks`, `TEST-NFR-10` clean walkthrough).

### Remaining After Wave 3 (Wave 4 — Issue #10)

- **Issue #10 (Sprint 1 Closeout & Release):** Record all final execution results in `docs/traceability.md` Section 5 & update `docs/features.md` statuses, open reviewed Release PR `sprint1-staging` → `main`, and tag `v0.1.0`.
