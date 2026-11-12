# Sprint 1 NFR Test Specification

**Product:** Survey and Feedback System (Theme 10: Review, Feedback, and Survey System)
**File:** `docs/sprints/sprint-1/nfr-test-specification.md` | **Version:** 1.0 (Specified) | **Date:** 12 November 2026
**Baseline:** `docs/srs.md` v1.0 Section 5, `docs/features.md` v1.0 Section 3 (SR-01 – SR-05), `docs/system-sds.md` v1.0

| Role | Name | Student ID |
|---|---|---|
| Author 1 | Muhammad Asad Aziz | 67070503472 |
| Author 2 | Al Xander James Codino Ybanez | 67070503450 |

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-07 | Muhammad Asad Aziz (Author 1, AI-assisted draft) | Initial NFR test specification for NFR-01 to NFR-10 |
| 1.0 | 2026-11-12 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Partner review complete; NFR test specification approved as v1.0 aligned with v1.0 baseline |

---

## 1. Scope

This document specifies how each NFR established in Sprint 1 (NFR-01 to NFR-10) is verified against its measurable target in the SRS. NFRs have no feature AC; each test states the target it checks and the result to record. NFR-11 (login throttling) and the verification of NFR-12 (accessibility) are planned for Sprint 3; the Sprint 1 screens are built to the NFR-12 basics (labels, keyboard operation, visible focus) but are not formally verified until then.

| NFR | Target (SRS Section 5) | Owner | Test |
|---|---|---|---|
| NFR-01 | p95 < 300 ms for four endpoints | SR-02, F-03, F-04 | TEST-NFR-01 |
| NFR-02 | bcrypt (cost ≥ 10) or Argon2id only; 0 plaintext passwords | SR-05, F-01 | TEST-NFR-02 |
| NFR-03 | 100% of protected endpoints return 401 for bad tokens | F-01 | TEST-NFR-03 |
| NFR-04 | No horizontal scrolling or overlapping controls at 360/768/1280 px | SR-03 | TEST-NFR-04 |
| NFR-05 | 100% of protected endpoints tested for 401, 403 and 404 | F-01 – F-04 | TEST-NFR-05 |
| NFR-06 | 20 parallel submissions → 1 stored, 19 rejected | SR-02, F-03 | TEST-NFR-06 |
| NFR-07 | 100% of data retrievable after restart | SR-02 | TEST-NFR-07 |
| NFR-08 | Structured 4xx/5xx; 0 leaks | SR-04 | TEST-NFR-08 |
| NFR-09 | 0 secrets in Git; refuses to start without a ≥ 32-character key | SR-05 | TEST-NFR-09 |
| NFR-10 | ≤ 6 README commands from clean checkout to passing suite | SR-01 | TEST-NFR-10 |

---

## 2. Sprint 1 protected endpoints

Used by TEST-NFR-03 and TEST-NFR-05. The list is kept in `tests/helpers/routes.ts`; a test compares it with the routes registered in the Express app and fails if a protected route is missing from the list, so that "100% of protected endpoints" stays true as routes are added.

| # | Endpoint | Allowed role | 401 (no or bad token) | 403 (wrong role) | 404 (other user's record or unknown id) |
|---|---|---|---|---|---|
| 1 | `POST /auth/logout` | Any | TEST-NFR-03 | – (any role) | – (acts on own token) |
| 2 | `GET /auth/me` | Any | TEST-NFR-03 | – (any role) | – (identity from token; spoofing in TEST-F01-04) |
| 3 | `POST /surveys` | Survey Owner | TEST-NFR-03 | TEST-NFR-05 (Respondent, Administrator) | – (creates own) |
| 4 | `GET /surveys` | Survey Owner | TEST-NFR-03 | TEST-NFR-05 | Own-only list: TEST-F02-05 |
| 5 | `GET /surveys/{id}` | Survey Owner | TEST-NFR-03 | TEST-NFR-05 | TEST-F02-09 |
| 6 | `POST /surveys/{id}/publish` | Survey Owner | TEST-NFR-03 | TEST-NFR-05 | TEST-F02-09 |
| 7 | `POST /surveys/{id}/close` | Survey Owner | TEST-NFR-03 | TEST-NFR-05 | TEST-F02-09 |
| 8 | `GET /surveys/{id}/summary` | Survey Owner | TEST-NFR-03 | TEST-F04-04 | TEST-F04-03 |
| 9 | `GET /available-surveys` | Respondent | TEST-NFR-03 | TEST-NFR-05 (Survey Owner, Administrator) | – (drafts hidden: TEST-F03-03) |
| 10 | `GET /available-surveys/{id}` | Respondent | TEST-NFR-03 | TEST-NFR-05 | Draft or unknown id: TEST-F03-03 |
| 11 | `POST /surveys/{id}/responses` | Respondent | TEST-NFR-03 | TEST-NFR-05 | Draft or unknown id: TEST-F03-06 |
| 12 | `GET /my-responses` | Respondent | TEST-NFR-03 | TEST-NFR-05 | Own-only list: TEST-F03-08, TEST-F03-09 |
| 13 | `GET /surveys/{id}/my-response` | Respondent | TEST-NFR-03 | TEST-NFR-05 | TEST-F03-04, TEST-F03-08 |
| 14 | `GET /responses/{responseId}` | Respondent | TEST-NFR-03 | TEST-NFR-05 | TEST-F03-08 |

Public routes: `POST /auth/login`, `GET /health`.

---

## 3. Test specifications

| Test ID | NFR | Level | Preconditions / input | Action | Expected result (pass criterion) | Planned file |
|---|---|---|---|---|---|---|
| TEST-NFR-01 | NFR-01 | Performance (API) | `npm run seed:benchmark` on the test database: one identified survey with 10 questions (5 single-choice, 5 rating), 1,000 respondents with one response each, 50 respondents who have not answered (SDS Section 4.7). API built and started on the same machine. Tokens obtained by login before timing starts | Send 5 warm-up requests per endpoint (discarded), then 50 sequential timed requests to each: `GET /available-surveys`, `POST /surveys/{id}/responses` (one per unanswered respondent), `GET /surveys/{id}/my-response` (50 respondents who answered), `GET /surveys/{id}/summary` (owner) | For each endpoint, p95 (nearest-rank: the 48th of 50 sorted times) is below 300 ms. The script prints p50, p95 and max per endpoint and exits non-zero if any p95 ≥ 300 ms. Record: CPU, RAM, OS, Node and PostgreSQL versions, commit id | `tests/perf/benchmark.ts` (run with `npm run test:perf`) |
| TEST-NFR-02 | NFR-02 | API + DB + Unit | Test database with the six seeded accounts; log output captured in memory | (a) Read every `User.passwordHash`. (b) Log in with a valid and an invalid password; capture the responses and logs. (c) Call `loadConfig` with `NODE_ENV=production` and `BCRYPT_COST` 9, then 10; with `NODE_ENV=test` and 4. (d) Hash a password with the default configuration | (a) Every hash matches `^\$2[aby]\$\d{2}\$` (or starts with `$argon2id$`) and none equals `SEED_PASSWORD`. (b) Neither response body nor captured logs contain the password or any `$2b$` hash. (c) Cost 9 in production is refused with an error naming `BCRYPT_COST`; 10 is accepted; 4 is accepted only in test. (d) The hash's cost field is `12` | `tests/integration/nfr-passwords.test.ts`; `tests/unit/config.test.ts` |
| TEST-NFR-03 | NFR-03 | API | The 14 protected endpoints of Section 2 with valid path ids; resp1 logged in, then logged out to obtain a revoked token | For every endpoint, send the request with: no header; `Bearer not-a-jwt`; a token signed with another secret; a token with the right secret and `exp` in the past; the revoked token. Also call the two public routes without a token | All 70 protected requests return `401 UNAUTHENTICATED` with an `error` object and no `data` key. `GET /health` returns `200`; `POST /auth/login` is reachable without a token. The route-list check passes | `tests/integration/nfr-token-auth.test.ts` |
| TEST-NFR-04 | NFR-04 | E2E | Demo seed; Playwright projects at widths 360, 768 and 1280 px | At each width open `/login`, `/available`, `/available/{S-PUB}`, `/my-responses`, `/my-surveys/new`, `/my-surveys/{S-DRAFT}`, `/my-surveys/{S-PUB}/summary` (logged in with the right role); take a full-page screenshot | On every page and width: `document.documentElement.scrollWidth <= window.innerWidth`; the bounding boxes of visible buttons, inputs and links do not intersect each other and lie inside the viewport width. Screenshots saved for the evidence PDF | `tests/e2e/responsive.spec.ts` |
| TEST-NFR-05 | NFR-05 | API | Seeded accounts; one survey per state owned by owner1; responses by resp1 and resp2 | Table-driven: for each endpoint in Section 2, call it with every role that is not allowed; together with the record-level tests named in Section 2 | Every wrong-role call returns `403` with no `data` key and no database change. Every cell of Section 2 points to a test that passes. The route-list check passes | `tests/integration/rbac-matrix.test.ts` (shared with TEST-F01-05) |
| TEST-NFR-06 | NFR-06 | API + DB | Fresh fixture: open survey S; resp1 has not answered; one valid body | Send 20 identical `POST /surveys/{S}/responses` requests at once with `Promise.all`; count rows. Repeat 3 times with fresh fixtures | Each run: exactly 1 × `201` and 19 × `409 DUPLICATE_RESPONSE`; exactly 1 `Response`, 1 `Participation` and that response's answers in the database | `tests/integration/nfr-concurrency.test.ts` |
| TEST-NFR-07 | NFR-07 | API + DB (process restart) | Test database; API started as a child process | Create a survey (owner1), publish it, submit a response (resp1); stop the API process; start it again; log in again; read the survey, the summary and resp1's submission | All three reads return the same data as before the restart (compared field by field) | `tests/integration/nfr-restart.test.ts` |
| TEST-NFR-08 | NFR-08 | API | Seeded accounts; a test-only failing dependency for one request (as in TEST-F03-02) | Send: malformed JSON; wrong `Content-Type`; a non-UUID id; an unknown route; invalid answers; no token; wrong role; another owner's survey; the forced internal failure | Every response is 4xx or `500` with body `{ "error": { "code", "message", "requestId" } }` and an `X-Request-Id` header equal to `requestId`; the `500` has code `INTERNAL_ERROR` and a generic message. No body contains a stack frame (`at … (…:line:col)`), `SELECT`, `INSERT`, `prisma`, `/src/`, `node_modules`, `$2b$`, or another user's email | `tests/integration/nfr-errors.test.ts` |
| TEST-NFR-09 | NFR-09 | Unit + tool | `loadConfig` with controlled environments; the Git repository | (a) `loadConfig` without `JWT_SECRET`; with 31 characters; with 32; with `JWT_EXPIRES_MINUTES` 61. (b) Check `.gitignore` and `.env.example`. (c) Run `gitleaks detect --source .` on the repository, which scans the full Git history | (a) Missing, 31 characters and 61 minutes are refused with an error naming the variable but never printing its value; 32 characters accepted. (b) `.env` is ignored; every secret entry in `.env.example` is a `change-me` placeholder. (c) 0 findings, output saved with the commit id | `tests/unit/config.test.ts`; gitleaks output saved in the release evidence |
| TEST-NFR-10 | NFR-10 | Manual walkthrough | A folder with no previous checkout, Docker running, Node LTS from `.nvmrc`; performed by the student who did not write the README | Clone the release tag; follow the README commands exactly; log in once with each seeded role | At most 6 commands reach a running application, seeded accounts for every role log in, and the required test suite passes. Record each command, its output summary, the count and the commit id | Evidence in the Deliverable 1 PDF, Part F |

---

## 4. Recording results

For every test, the result recorded in `docs/traceability.md` Section 5 includes the commit id, the command used and the measured value where the target is numeric (TEST-NFR-01 p95 per endpoint; TEST-NFR-06 counts; TEST-NFR-10 command count). A failed or skipped NFR test is reported with its value and is not removed or relaxed to pass (Product DoD R-3, R-7).
