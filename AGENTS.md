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
- **Last Completed:** **Issue #9** (`test/9-nfr-perf-responsive-setup`, verified on `8ea3071`) — `TEST-NFR-01` latency benchmark, `TEST-NFR-04` responsive E2E + screenshots, `TEST-NFR-09` startup/env hygiene checks, and E2E synthetic-user isolation implemented and verified; Issues #1–#7 + **Issue #8** (`d614e99`) already integrated on `origin/sprint1-staging`.

### Completed Work (Issues #1–#9)

- **Issue #1 (`docs/baseline-and-sprint1-contracts`):** Product baseline (`v1.0`) and approved Sprint 1 contracts (`F-01`–`F-04`, `nfr-test-specification.md`, `definition-of-done.md`).
- **Issue #2 (`feat/2-project-scaffold`):** Monorepo scaffold, 10-model Prisma schema & migrations (`0001`, `0002` check constraints), fail-fast `config/`, Express `/api/v1/health`, Zen Green layout/components, and Vitest/Supertest harness.
- **Issue #3 (`feat/3-f01-authentication` — `F-01`):** `AuthService.ts`, `routes/auth.ts` (`login`, `logout`, `me`), `authenticate` + `requireRole` middleware, `RevokedToken` revocation, `prisma/seed.ts`, `LoginPage.tsx`, `AdminHomePage.tsx`, `Navbar.tsx`, plus `auth.test.ts`, `nfr-passwords.test.ts`, `rbac-matrix.test.ts`, and `auth.spec.ts`.
- **Issue #4 (`feat/4-domain-engine-and-owner-ui` — `F-02`/`F-04` domain + owner UI):** Pure domain rules (`surveyLifecycle.ts`, `effectiveStatus.ts`, `summaryMath.ts` with `buildSummary`, `calendarDay.ts`), strict `createSurveySchema`, and owner UI pages (`MySurveysPage.tsx`, `NewSurveyPage.tsx`, `SurveyDetailPage.tsx`, `SummaryPage.tsx`, `ownerUtils.ts`).
- **Issue #5 (`feat/5-f03-respondent-responses` — `F-03`):** `validateAnswers.ts`, `ResponseService.ts`, `routes/availableSurveys.ts`, `routes/responses.ts`, `routes/myResponses.ts`, `mapPrismaError` (`errors.ts`), respondent UI (`AvailableSurveysPage.tsx`, `TakeSurveyPage.tsx`, `MyResponsesPage.tsx`, `SubmissionDetailPage.tsx`), `seed.ts` relation cleanup, plus `validateAnswers.test.ts`, `errorMapping.test.ts`, `available-surveys.test.ts`, `responses.test.ts`, `my-responses.test.ts`, `nfr-concurrency.test.ts`, and `respondent-submit.spec.ts`.
- **Issue #6 (`feat/6-f02-survey-lifecycle-api` — `F-02` API + UI wiring):** `SurveyService.ts`, `routes/surveys.ts`, expanded `surveySchema.ts`, owner route wiring in `client/src/App.tsx`, overloaded `createResponse` in `factories.ts`, plus `surveys.test.ts`, `surveys.ownership.test.ts`, extended `rbac-matrix.test.ts`, and `owner-survey.spec.ts`.
- **Issue #7 (`feat/7-f04-summary-api` — `F-04` Summary API + UI wiring, merged into `sprint1-staging` at `eac0a62`):** `SummaryService.ts` (SQL count/`groupBy` aggregates passed to `buildSummary`), per-route `GET /api/v1/surveys/:id/summary` in `routes/surveys.ts`, `/my-surveys/:surveyId/summary` route wiring in `client/src/App.tsx` to `SummaryPage.tsx`, plus `tests/integration/summary.test.ts` (`TEST-F04-02`–`04`), extended `rbac-matrix.test.ts` (route `#8`), and `tests/e2e/owner-summary.spec.ts`.
- **Issue #8 (`test/8-nfr-security-durability`, merged into `origin/sprint1-staging` at `d614e99`):** Cross-feature integration & remaining API NFR checks (`cross-feature.test.ts`, `nfr-token-auth.test.ts`, `nfr-errors.test.ts`, `nfr-restart.test.ts`, updated `rbac-matrix.test.ts`, `tests/helpers/routes.ts`, plus `README.md` 6-command Quick Start adding `npm run seed` and scoped card selectors in `respondent-submit.spec.ts`).
- **Issue #9 (`test/9-nfr-perf-responsive-setup`, verified on `8ea3071`):**
  - **Key files created/modified:** `server/prisma/seed-benchmark.ts`, `server/tests/perf/benchmark.ts`, `server/tests/e2e/responsive.spec.ts`, `server/tests/e2e/owner-survey.spec.ts`, `server/tests/e2e/respondent-submit.spec.ts`, `server/tests/unit/config.test.ts`, `.gitignore` (`artifacts/`), `package.json`, and `server/package.json` (`seed:benchmark`, `test:perf`).
  - **`TEST-NFR-01` latency benchmark (`npm run seed:benchmark && npm run test:perf`, `1` survey, `10` questions, `1,000` responses + `50` timed, target `< 300 ms`):** `GET /api/v1/available-surveys` p50 `5.69 ms` / **p95 `7.31 ms`** / max `9.02 ms`; `POST /api/v1/surveys/{id}/responses` p50 `24.52 ms` / **p95 `35.12 ms`** / max `36.50 ms`; `GET /api/v1/surveys/{id}/my-response` p50 `8.81 ms` / **p95 `11.37 ms`** / max `11.90 ms`; `GET /api/v1/surveys/{id}/summary` p50 `9.28 ms` / **p95 `10.73 ms`** / max `12.59 ms` (all **PASS**).
  - **`TEST-NFR-04` responsive E2E & full Playwright suite (`npx playwright test --reporter=list`):** **`39 passed (24.2s)`** across `mobile-360`, `tablet-768`, and `desktop-1280` (`0` overflow/overlap errors; `24` screenshots written under gitignored `artifacts/screenshots/`).
  - **Regression & client checks:** Server `npm test -w server` **`20 passed (20)` files / `195 passed (195)` tests** (`19.66s`, including `tests/unit/config.test.ts` `14/14` passing); `npm run typecheck -w client` and `npm run build -w client` passing (`2.72s`; `client/package.json` has no `test` script).
  - **`TEST-NFR-09` & `TEST-NFR-10` status on `8ea3071`:** `config.test.ts` confirms `JWT_SECRET` unset/`< 32` chars refused, `JWT_EXPIRES_MINUTES=61` refused, `BCRYPT_COST < 10` refused outside test profile, `.gitignore` ignores `.env`, and `.env.example` uses `change-me` placeholders. `gitleaks detect --source . -v` scanned `18` commits and exited `1` with `1` test-fixture finding (`server/vitest.config.ts:10` from `b0599c0`: `JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long'`, no `.gitleaksignore` added yet). Manual `TEST-NFR-10` clean-checkout walkthrough not yet executed on this branch (`origin/sprint1-staging` holds the updated 6-command `README.md`).

### Codebase Conventions Established (Important for Upcoming Issues)

- **Per-route role guards on `/api/v1/surveys`:** `surveysRouter`, `responsesRouter`, and `myResponsesRouter` share the `/api/v1/surveys` prefix in `server/src/app.ts`. Always attach `authenticate` and `requireRole(...)` **per route** (never router-level `.use(...)` on `surveysRouter`) so `F-02`, `F-03`, and `F-04` sub-routes never block each other with `403`.
- **Implemented Sprint 1 route & helper baseline:** All `PROTECTED_ROUTES` `#1`–`#14` (`tests/helpers/routes.ts`) are implemented (`F-01`–`F-04`), and overloaded `createResponse` (`tests/helpers/factories.ts`: `(surveyId, respondentId, answers?, submittedAt?)` or `(surveyId, overrides?)`) is available.
- **E2E test isolation:** `GET /api/v1/available-surveys` sorts `publishedAt DESC`. `owner-summary.spec.ts`, `owner-survey.spec.ts`, `respondent-submit.spec.ts`, and `responsive.spec.ts` isolate empty-state and submission preconditions with per-test synthetic owners/respondents cleaned up in `finally` (requires `npm run seed` base surveys once before running).

### Immediate Next Steps (PR Merge → Issue #10)

- Merge `origin/sprint1-staging` into `test/9-nfr-perf-responsive-setup` (resolving `respondent-submit.spec.ts` overlap and bringing in Issue #8 tests + 6-command `README.md`), decide `.gitleaksignore` handling for the `b0599c0` test fixture (`TEST-NFR-09`), open & review PR into `sprint1-staging` (`sprint-1` in docs), and execute the manual `TEST-NFR-10` clean-checkout walkthrough to unblock **Issue #10** (Sprint 1 integration suite on `sprint1-staging`, `docs/traceability.md` Section 5 + `docs/features.md` closeout, reviewed Release PR `sprint1-staging` → `main`, and `v0.1.0` tag).
