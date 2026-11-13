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

- **Current Sprint:** Sprint 1 (`sprint-1` staging branch)
- **Active Baseline:** `v1.0` (`docs/srs.md`, `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md`, `docs/sprints/plan.md`, `docs/sprints/sprint-1/*`)
- **Last Completed:** Issue #1 (`v1.0` baseline and Sprint 1 contracts locked)
- **Next Up:** Issue #2 (`feat/2-project-scaffold`), followed by parallel Wave 1 (Issue #3 `F-01` & Issue #4 Domain TDD + Owner UI)