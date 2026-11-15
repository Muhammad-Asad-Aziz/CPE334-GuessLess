# Sprint 1 Engineering Contracts

**Product:** Survey and Feedback System (Theme 10: Review, Feedback, and Survey System)
**Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents, Semester 1/2026
**Folder:** `docs/sprints/sprint-1/` | **Version:** 1.0 (approved contracts) | **Date:** 12 November 2026
**Baseline:** `docs/srs.md` v1.0, `docs/system-sds.md` v1.0, `docs/features.md` v1.0, `docs/traceability.md` v1.0, `docs/sprints/plan.md` v1.0

| Role | Name | Student ID |
|---|---|---|
| Author 1 | Muhammad Asad Aziz | 67070503472 |
| Author 2 | Al Xander James Codino Ybanez | 67070503450 |

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-07 | Muhammad Asad Aziz (Author 1, AI-assisted draft) | Initial Sprint 1 contract set: index, Product Definition of Done, contracts for F-01 to F-04, NFR test specification |
| 1.0 | 2026-11-12 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Partner review complete; Sprint 1 contracts (F-01 to F-04), NFR test specification and Definition of Done approved as v1.0 before implementation |

---

## 1. Contents

| Document | Contents | AC | Tests |
|---|---|---|---|
| [`F-01-authentication.md`](F-01-authentication.md) | F-01 Authentication, session revocation and role guard | AC-F01-01 – AC-F01-05 | TEST-F01-01 – TEST-F01-05 |
| [`F-02-survey-lifecycle.md`](F-02-survey-lifecycle.md) | F-02 Survey creation, lifecycle and owner management | AC-F02-01 – AC-F02-09 | TEST-F02-01 – TEST-F02-09 |
| [`F-03-responses.md`](F-03-responses.md) | F-03 Survey discovery, response submission and respondent history | AC-F03-01 – AC-F03-09 | TEST-F03-01 – TEST-F03-09 |
| [`F-04-summary.md`](F-04-summary.md) | F-04 Aggregate results summary | AC-F04-01 – AC-F04-04 | TEST-F04-01 – TEST-F04-04 |
| [`nfr-test-specification.md`](nfr-test-specification.md) | Sprint 1 tests for NFR-01 to NFR-10 (system responsibilities SR-01 to SR-05) | – | TEST-NFR-01 – TEST-NFR-10 |
| [`definition-of-done.md`](definition-of-done.md) | Product Definition of Done for features and for the Sprint 1 release | – | – |

Totals: 4 feature contracts, 27 acceptance criteria, 27 feature tests and 10 NFR tests. The requirement-to-AC-to-test mapping and the execution status are kept in `docs/traceability.md` (Sections 2 to 5).

Every feature contract has the same sections: 1 Identification, 2 Feature-level design, 3 UI specification, 4 API specification, 5 Data specification, 6 Acceptance criteria, 7 Software Test Specification, 8 Feature Definition of Done. A section states "No change" when a layer is not affected.

---

## 2. Contract lifecycle and versioning

1. A contract starts as **v0.x (draft)**. Both authors review it.
2. When both approve it, it becomes **v1.0 (Specified)** and is committed on the `sprint-1` branch in a specification-only commit **before** any implementation commit for that feature. The commit id is recorded in the feature's Issue.
3. Any later change to behavior, AC or tests raises the version (v1.1, v1.2 …) and adds a revision-history row with the reason. Earlier versions stay visible in Git history; nothing is rewritten.
4. A change that affects a requirement or another feature is also logged in `docs/traceability.md` Section 7.

---

## 3. Conventions used in all contracts

### 3.1 Acceptance criteria

Each AC has a stable ID (`AC-Fxx-yy`), the requirements it verifies, and one or more scenarios written as **Given / When / Then**. "Given" states the starting data and the logged-in user, "When" states one action, and "Then" states outcomes that can be observed through the API, the UI or the database. A **Scenario Outline** with an **Examples** table is used when the same rule is checked with several inputs (boundary and negative cases).

### 3.2 Software Test Specification (STS)

Each test has a stable ID (`TEST-Fxx-yy`), the AC it verifies, a level, preconditions and input, the action, the expected result, and the planned test file. Levels:

| Level | Tool | What it proves |
|---|---|---|
| Unit | Vitest | Pure domain logic and validation schemas, with no database |
| API | Vitest + Supertest against the Express app and a real PostgreSQL test database | Endpoint behavior, status codes, error bodies, permissions |
| API + DB | As API, plus direct database reads in the assertion | Persistence, transactions, constraints |
| E2E | Playwright against the running SPA and API | Critical user journeys through the real UI |

Persistence is never proven with mocks. "TDD" in the level column marks rule work where the failing test is committed before the implementation (Product DoD item D-4).

### 3.3 Test environment and fixtures

- `NODE_ENV=test`, `BCRYPT_COST=4`, `DATABASE_URL` = `TEST_DATABASE_URL` (separate database, SDS Section 9).
- The test database is migrated once per run and truncated between test files. API tests create their own fixtures through helper factories (`tests/helpers/factories.ts`) so that each test states its own Given.
- Tokens for API tests are obtained through the real `POST /api/v1/auth/login`, never minted with a client-chosen role. The only hand-made tokens are the expired and tampered tokens of TEST-NFR-03.
- E2E tests run against the demo seed below, re-seeded before the E2E run.

**Seeded accounts** (password from `SEED_PASSWORD`, never committed):

| Key | Email | Display name | Role |
|---|---|---|---|
| owner1 | `owner1@example.edu` | Owner One | `SURVEY_OWNER` |
| owner2 | `owner2@example.edu` | Owner Two | `SURVEY_OWNER` |
| resp1 | `resp1@example.edu` | Respondent One | `RESPONDENT` |
| resp2 | `resp2@example.edu` | Respondent Two | `RESPONDENT` |
| resp3 | `resp3@example.edu` | Respondent Three | `RESPONDENT` |
| admin1 | `admin1@example.edu` | Admin One | `ADMIN` |

**Seeded surveys** (all owned by owner1, mode `IDENTIFIED`, eligibility `ALL`):

| Key | Title | Status | Questions |
|---|---|---|---|
| S-PUB | Seed: CPE334 Course Evaluation | `PUBLISHED` | Q1 single-choice "How was the lab workload?" (Too light, About right, Too heavy), required; Q2 rating "Rate the course overall", required |
| S-DRAFT | Seed: Workshop Feedback | `DRAFT` | Q1 rating "Rate the workshop", required (complete, so it can be published in a demo) |
| S-CLOSED | Seed: Orientation Survey 2026 | `CLOSED` | Q1 single-choice "Was orientation useful?" (Yes, No), required |

---

## 4. Shared API rules used by every contract

These come from the System-Level SDS and are not repeated in each contract.

- Base path `/api/v1`; JSON bodies; success body `{ "data": … }`, lists add `"meta": { "page", "pageSize", "total" }` (default page size 20, maximum 100; larger values give `400`).
- Every route except `POST /auth/login` and `GET /health` requires `Authorization: Bearer <token>`; a missing, malformed, tampered, expired or revoked token, or a disabled account, gives `401 UNAUTHENTICATED` (NFR-03).
- A role that may never use an operation gets `403 FORBIDDEN`; a record that exists but is not the caller's, or does not exist, or has an id that is not a UUID, gives `404 NOT_FOUND` with no record data (SDS Section 5.2 visibility policy).
- Request bodies are validated with strict Zod schemas: unknown fields, including server-owned fields such as `ownerId`, `role`, `userId`, `status` or `submittedAt`, give `400 VALIDATION_ERROR` and change nothing (BR-08).
- Error body: `{ "error": { "code", "message", "details"?, "requestId" } }`; no stack traces, SQL, file paths or hashes (NFR-08).
- Times in responses are UTC ISO-8601; calendar days are `YYYY-MM-DD` in Asia/Bangkok (D-14). The UI shows times in Asia/Bangkok.

---

## 5. Sprint 1 test inventory

| Level | Feature tests | NFR tests |
|---|---|---|
| Unit | TEST-F02-01, TEST-F02-04 (unit part), TEST-F02-07, TEST-F02-08 (unit part), TEST-F03-05 (unit part), TEST-F03-07 (unit part), TEST-F04-01 | TEST-NFR-09 (start-up part), TEST-NFR-02 (start-up part) |
| API / API + DB | TEST-F01-01 – TEST-F01-05, TEST-F02-02 – TEST-F02-06, TEST-F02-08, TEST-F02-09, TEST-F03-02 – TEST-F03-09, TEST-F04-02 – TEST-F04-04 | TEST-NFR-01 – TEST-NFR-03, TEST-NFR-05 – TEST-NFR-08 |
| E2E | TEST-F01-03, TEST-F01-04, TEST-F02-02, TEST-F02-03, TEST-F02-05, TEST-F02-06, TEST-F03-01, TEST-F03-03, TEST-F03-04, TEST-F03-09, TEST-F04-02 (UI parts) | TEST-NFR-04 |
| Manual | – | TEST-NFR-10 (clean-environment walkthrough) |

TDD is planned for TEST-F02-04, TEST-F02-07, TEST-F03-05, TEST-F03-06 and TEST-F03-07 (rules BR-04, BR-03, BR-01, BR-02, BR-06).
