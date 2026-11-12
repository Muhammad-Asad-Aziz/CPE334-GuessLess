# Requirements-to-Features-to-Sprints Traceability Matrix

**Product:** Survey and Feedback System (Theme 10: Review, Feedback, and Survey System)  
**Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents, Semester 1/2026  
**File:** `docs/traceability.md` | **Version:** 1.0 (approved baseline) | **Date:** 12 November 2026 

| Role | Name | Student ID |
|---|---|---|
| Author 1 | Muhammad Asad Aziz | 67070503472 |
| Author 2 | Al Xander James Codino Ybanez | 67070503450 |

**Repository:** [https://github.com/Muhammad-Asad-Aziz/CPE334-GuessLess](https://github.com/Muhammad-Asad-Aziz/CPE334-GuessLess)

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-05 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Initial full-baseline traceability matrix aligned with `docs/srs.md` v0.1 and `docs/features.md` v0.1 |
| 0.2 | 2026-11-06 | Muhammad Asad Aziz | Aligned with `docs/srs.md` v0.2, `docs/features.md` v0.2 and `docs/system-sds.md` v0.2: API paths use `/api/v1`; FR-09 anonymous variant traced to F-07; BR-03 Sprint 1 verification narrowed to rule level with API/UI verification in Sprint 2; expected results tightened to match the SDS (`404` for another user's record, `401` for disabled accounts); CHG-01 and CHG-02 logged |
| 0.3 | 2026-11-07 | Muhammad Asad Aziz (AI-assisted review) | Aligned with `docs/srs.md` v0.3, `docs/features.md` v0.3 and `docs/system-sds.md` v0.3: BR-14, NFR-11, NFR-12 and system responsibilities SR-01 to SR-06 traced; API-level tests for publish checks and lifecycle transitions; exact expected error codes; own-responses list (AC-F03-09, TEST-F03-09); status column added; Sprint 1 AC-to-test status table added (Section 5); change log gains a baseline row, an "Approved by" column and CHG-03 to CHG-13 |
| 1.0 | 2026-11-12 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Partner review complete; CHG-01 to CHG-13 approved by both authors; open baseline items closed; aligned with `docs/srs.md` v1.0 and `docs/features.md` v1.0 |

---

## 1. Purpose

This document traces every baseline Functional Requirement (`FR-01` to `FR-21`), Business Rule (`BR-01` to `BR-14`), and Non-Functional Requirement (`NFR-01` to `NFR-12`) in `docs/srs.md` to its implementing feature(s) or system responsibility in `docs/features.md` (`F-01` to `F-09`, `SR-01` to `SR-06`), its planned sprint (`Sprint 1`, `Sprint 2`, or `Sprint 3`), its verification specification and its current status.

* **Sprint 1 baseline (`FR-01`–`FR-11`, `BR-01`–`BR-08`, `NFR-01`–`NFR-10`):** Mapped to specific Sprint 1 Acceptance Criteria (`AC-Fxx-yy`) and Software Test Specification IDs (`TEST-Fxx-yy`, `TEST-NFR-xx`) defined in `docs/sprints/sprint-1/`. Section 5 lists every Sprint 1 AC with its planned test and the columns that Part F of Deliverable 1 fills in after execution.
* **Sprint 2 and Sprint 3 baseline (`FR-12`–`FR-21`, `BR-09`–`BR-14`, `NFR-11`, `NFR-12`):** Mapped to target feature IDs and planned sprints now; detailed `AC` and `TEST` IDs will be added in `docs/sprints/sprint-2/` and `docs/sprints/sprint-3/`.
* **Status** uses the values defined in `docs/features.md` Section 1 (Planned, Specified, Implemented, Verified, Accepted). A row is never marked Verified for a test that has not run on the release commit.

---

## 2. Functional Requirements (`FR-01` to `FR-21`) Traceability

Actors for each FR are listed in `docs/srs.md` Section 3.

| FR ID | Requirement Title | Feature ID(s) | Planned Sprint | Acceptance Criteria (Sprint 1) / Planned Verification | Test ID(s) and level (Sprint 1) / Verification Method | Status |
|---|---|---|---|---|---|---|
| **FR-01** | Create Survey | **F-02** | **Sprint 1** | `AC-F02-01`, `AC-F02-02` | `TEST-F02-01` (Unit: save-draft limits of SRS Section 6, including incomplete drafts and every upper limit; `ANONYMOUS` mode or another question type rejected with `400`), `TEST-F02-02` (API + UI: create a `DRAFT` with single-choice and rating questions and retrieve it; owner taken from the token) | Planned |
| **FR-02** | Publish Survey | **F-02** | **Sprint 1** | `AC-F02-03`, `AC-F02-04` | `TEST-F02-03` (API + UI: publishing a complete draft sets `PUBLISHED` and `publishedAt`; the survey appears in a Respondent's available list), `TEST-F02-04` (Unit TDD of the publish checks + API: publishing a draft with a blank title, no questions, or a choice question with 1 option returns `400 VALIDATION_ERROR` listing every failed check; the survey stays `DRAFT` and unchanged) | Planned |
| **FR-03** | Submit Response | **F-03** | **Sprint 1** | `AC-F03-01`, `AC-F03-02` | `TEST-F03-01` (E2E: response-mode notice shown before the submit button, submit, confirmation shown), `TEST-F03-02` (API + DB: a valid submission returns `201` and stores the response, answers, selections and participation in one transaction) | Planned |
| **FR-04** | View Aggregate Summary | **F-04** (Sprint 1), **F-07** (Sprint 2, anonymous variant) | **Sprint 1** (anonymous variant in Sprint 2) | `AC-F04-01`, `AC-F04-02` | `TEST-F04-01` (Unit: option counts, percentages of answered respondents to 1 decimal place and 0.0% with 0 answers, rating mean to 2 decimal places, 1–5 distribution, empty mean with 0 answers), `TEST-F04-02` (API + UI: summary of own `PUBLISHED` and `CLOSED` surveys; a `DRAFT` returns `409 SURVEY_NOT_PUBLISHED`). Sprint 2: anonymous variant verified with `BR-11` and `BR-14` | Planned |
| **FR-05** | Login | **F-01** | **Sprint 1** | `AC-F01-01`, `AC-F01-02` | `TEST-F01-01` (API: valid login returns a JWT with `expiresAt` at most 60 minutes ahead), `TEST-F01-02` (API: unknown email and wrong password both return `401 INVALID_CREDENTIALS` with the same message) | Planned |
| **FR-06** | Logout | **F-01** | **Sprint 1** | `AC-F01-03` | `TEST-F01-03` (API: logout returns `204`; the same token then gets `401 UNAUTHENTICATED`; UI returns to the login screen) | Planned |
| **FR-07** | Current User Identity | **F-01** | **Sprint 1** | `AC-F01-04` | `TEST-F01-04` (API `/api/v1/auth/me` + UI header: id, display name and role come from the JWT subject and the database row; a spoofed identity header such as `X-User-Id` is ignored) | Planned |
| **FR-08** | Browse Available Surveys | **F-03** (Sprint 1), **F-05** (Sprint 2, close date and eligibility) | **Sprint 1** (extended in Sprint 2) | `AC-F03-03` | `TEST-F03-03` (API + UI: lists only open `PUBLISHED` surveys with the responded indicator; `DRAFT` and `CLOSED` surveys are not listed). Sprint 2: surveys past their close date and ineligible surveys are not listed | Planned |
| **FR-09** | View Own Submissions | **F-03** (Sprint 1), **F-07** (Sprint 2, anonymous variant) | **Sprint 1** (anonymous variant in Sprint 2) | `AC-F03-04`, `AC-F03-09` | `TEST-F03-04` (API + UI: own answers and submission time for an `IDENTIFIED` survey; another respondent's response returns `404 NOT_FOUND`), `TEST-F03-09` (API + UI: `GET /api/v1/my-responses` lists only the caller's responses, including a survey closed after responding, with the participation day). Sprint 2: an `ANONYMOUS` survey shows only the participation day and no answers (`F-07`) | Planned |
| **FR-10** | List My Surveys | **F-02** | **Sprint 1** | `AC-F02-05` | `TEST-F02-05` (API + UI: lists only the caller's surveys with effective status, response count, creation, publish and close dates) | Planned |
| **FR-11** | Close Survey | **F-02** | **Sprint 1** | `AC-F02-06` | `TEST-F02-06` (API + UI: an open `PUBLISHED` survey becomes `CLOSED`; existing responses and summary unchanged; a later submission is rejected). Closing a `DRAFT` or `CLOSED` survey is covered by `TEST-F02-08` | Planned |
| **FR-12** | Edit Draft Survey | **F-05** | **Sprint 2** | Planned Sprint 2 contract (`F-05`) | Sprint 2 API/UI tests: full `DRAFT` editing (the draft may stay incomplete; the question set is replaced as a whole); after publication only title and description, plus close date and eligibility while open; question changes return `409 SURVEY_LOCKED` (`BR-03`) | Planned |
| **FR-13** | Delete Draft Survey | **F-05** | **Sprint 2** | Planned Sprint 2 contract (`F-05`) | Sprint 2 API/UI tests: `DRAFT` deletion; deletion of `PUBLISHED`/`CLOSED` surveys rejected (`BR-12`) | Planned |
| **FR-14** | Scheduled Close Date | **F-05** | **Sprint 2** | Planned Sprint 2 contract (`F-05`) | Sprint 2 unit tests of `effectiveStatus` before, at and after `closeAt`; API tests: a close date in the past is rejected with `400`; changing the close date of a closed survey returns `409 INVALID_STATE_TRANSITION` (no reopen); submission at or after `closeAt` is rejected | Planned |
| **FR-15** | Manage Survey Eligibility | **F-05** | **Sprint 2** | Planned Sprint 2 contract (`F-05`) | Sprint 2 API integration tests: `ALL` vs `SELECTED` (`BR-09`); an empty list or a non-Respondent account returns `400`; a change while open affects only later submissions; a change after close is rejected; a removed respondent still sees their own submission | Planned |
| **FR-16** | Additional Question Types | **F-06** | **Sprint 2** | Planned Sprint 2 contract (`F-06`) | Sprint 2 unit/API/UI tests: multiple-choice (1 or more distinct options) and free-text (≤ 1,000 chars; required needs a non-space character) validation and summary aggregation | Planned |
| **FR-17** | Anonymous Response Mode | **F-07** | **Sprint 2** | Planned Sprint 2 contract (`F-07`) | Sprint 2 schema inspection + API/UI tests: answers unlinked from the respondent, participation separated (`BR-10`), anonymous notice shown, results only after close (`BR-14`) | Planned |
| **FR-18** | View Individual Responses | **F-08** | **Sprint 3** | Planned Sprint 3 contract (`F-08`) | Sprint 3 API/UI tests: respondent display name and time on `IDENTIFIED` surveys; blocked on `ANONYMOUS` surveys | Planned |
| **FR-19** | Filtered Analysis | **F-08** | **Sprint 3** | Planned Sprint 3 contract (`F-08`) | Sprint 3 API/UI tests: inclusive Asia/Bangkok calendar-day range filter, daily counts, `BR-11` threshold, counts only for anonymous surveys (`BR-14`) | Planned |
| **FR-20** | Export Results | **F-08** | **Sprint 3** | Planned Sprint 3 contract (`F-08`) | Sprint 3 API CSV tests: summary CSV, `IDENTIFIED` individual CSV, anonymous export without identity, only after close and with `BR-11` | Planned |
| **FR-21** | Manage User Accounts | **F-09** | **Sprint 3** | Planned Sprint 3 contract (`F-09`) | Sprint 3 API/UI tests: list, enable and disable users (`BR-13`); administrator cannot disable their own account; administrator gets `403` on survey and response endpoints | Planned |

---

## 3. Business Rules (`BR-01` to `BR-14`) Traceability

| BR ID | Business Rule Summary | Feature ID(s) | Planned Sprint | Acceptance Criteria (Sprint 1) / Planned Verification | Test ID(s) and level (Sprint 1) / Verification Method | Status |
|---|---|---|---|---|---|---|
| **BR-01** | A Respondent can submit at most one response per survey, in both response modes. | **F-03** (Sprint 1), **F-07** (Sprint 2 anonymous mode) | **Sprint 1** (extended in Sprint 2) | `AC-F03-05` | `TEST-F03-05` (Unit + API: a second submission returns `409 DUPLICATE_RESPONSE` and stores nothing; database unique-constraint test), with `TEST-NFR-06` for simultaneous requests | Planned |
| **BR-02** | Only open surveys accept responses (`DRAFT`, `CLOSED`, or past close date rejected; `DRAFT` hidden from Respondents). | **F-03** (Sprint 1), **F-05** (Sprint 2 close date) | **Sprint 1** (extended in Sprint 2) | `AC-F03-03`, `AC-F03-06` | `TEST-F03-03` (draft hidden from browse), `TEST-F03-06` (API: submission to a `DRAFT` survey returns `404 NOT_FOUND`; to a `CLOSED` survey returns `409 SURVEY_NOT_OPEN`; nothing stored). Sprint 2: submission at or after the close date rejected | Planned |
| **BR-03** | Survey questions are immutable once the survey is published (title and description stay editable; close date and eligibility only while open). | **F-02** (Sprint 1), **F-05** (Sprint 2) | **Sprint 1** (extended in Sprint 2) | `AC-F02-07` | `TEST-F02-07` (Unit test of the domain rule: any question, option, type, required-flag, order or mode change is rejected when status is `PUBLISHED` or `CLOSED`; no edit endpoint exists in Sprint 1). Sprint 2: API/UI verification with `FR-12` (`F-05`) | Planned |
| **BR-04** | A survey follows one lifecycle: `DRAFT` -> `PUBLISHED` -> `CLOSED` (publish requires a non-blank title, ≥1 question, ≥2 options per choice question and, from Sprint 2, a future close date; every other transition rejected; owner only). | **F-02** (Sprint 1), **F-05** (Sprint 2 close date) | **Sprint 1** (extended in Sprint 2) | `AC-F02-04`, `AC-F02-08` | `TEST-F02-04` (Unit TDD + API publish checks, see `FR-02`), `TEST-F02-08` (Unit `canTransition` table + API: publishing a `PUBLISHED` survey, publishing a `CLOSED` survey, closing a `DRAFT` survey and closing a `CLOSED` survey each return `409 INVALID_STATE_TRANSITION` and leave the survey unchanged). Sprint 2: publishing with a past close date rejected; close date frozen after close | Planned |
| **BR-05** | A Survey Owner can act only on their own surveys. | **F-02**, **F-04**, **F-08** | **Sprint 1** (extended in Sprints 2–3) | `AC-F02-09`, `AC-F04-03` | `TEST-F02-09` (API: another owner's survey read, publish and close return `404` with no data; a Respondent calling an owner route returns `403`), `TEST-F04-03` (API: another owner's summary returns `404` with no data) | Planned |
| **BR-06** | A response is accepted only if it is completely valid. | **F-03** (Sprint 1), **F-06** (Sprint 2 types) | **Sprint 1** (extended in Sprint 2) | `AC-F03-07` | `TEST-F03-07` (Unit boundary suite + API: each invalid-answer condition returns `400 VALIDATION_ERROR` and the transaction stores nothing) | Planned |
| **BR-07** | A Respondent can read only their own response and never aggregate results. | **F-03**, **F-04** | **Sprint 1** | `AC-F03-08`, `AC-F04-04` | `TEST-F03-08` (API: Respondent B requesting Respondent A's response by id through `responses/{responseId}` gets `404` with no data; `my-response` and `my-responses` return only B's own response), `TEST-F04-04` (API: a Respondent calling the summary endpoint gets `403`) | Planned |
| **BR-08** | Each account has exactly one role, and the server-verified role decides allowed actions; server-owned fields sent by the client are rejected. | **F-01**, **F-02**, **F-03**, **F-04**, **F-09** | **Sprint 1** (extended in Sprint 3) | `AC-F01-05` | `TEST-F01-05` (API role-permission matrix: a Survey Owner cannot submit a response (`403`); a Respondent cannot create a survey (`403`); a request body containing `role`, `userId`, `ownerId` or `status` returns `400 VALIDATION_ERROR` and changes nothing; spoofed identity headers are ignored) | Planned |
| **BR-09** | When a survey's eligibility is "selected respondents", only the listed Respondents can see and answer it. | **F-05** | **Sprint 2** | Planned Sprint 2 contract (`F-05`) | Sprint 2 API/UI tests: an unlisted Respondent cannot see the survey in `FR-08` and a direct submission returns `404` | Planned |
| **BR-10** | Anonymous responses carry no identity (no respondent reference on answers, calendar-day submission dates, participation record holds no answers). | **F-07**, **F-08** | **Sprint 2** (extended in Sprint 3) | Planned Sprint 2 contract (`F-07`) | Sprint 2 database schema/row inspection test + API/CSV payload assertion: zero respondent identifiers; answer and participation dates are Asia/Bangkok days; the respondent sees only their own participation day | Planned |
| **BR-11** | Small groups are not reported in anonymous surveys (fewer than 5 responses: only the total count). | **F-07**, **F-08** | **Sprint 2** (extended in Sprint 3) | Planned Sprint 2 contract (`F-07`) | Sprint 2 unit boundary tests (0, 4, 5 responses) + API summary tests (`suppressionReason: BELOW_THRESHOLD`); Sprint 3 filter and export tests | Planned |
| **BR-12** | Published data is retained (only `DRAFT` surveys can be deleted; responses never altered by closing or eligibility changes). | **F-05** | **Sprint 2** | Planned Sprint 2 contract (`F-05`) | Sprint 2 unit + API tests: `DELETE` on `PUBLISHED` and `CLOSED` surveys rejected; response count preserved on close and on eligibility change | Planned |
| **BR-13** | Disabled accounts have no access (cannot log in, and tokens issued before disabling are rejected). | **F-09** (Sprint 3), **F-01** (active-account check built in Sprint 1) | **Sprint 3** | Planned Sprint 3 contract (`F-09`) | Sprint 3 API integration test: disabling an active user gives `401` on both `/api/v1/auth/login` and requests that use an existing JWT | Planned |
| **BR-14** | Anonymous results are released only after the survey closes; anonymous date filters show counts only. | **F-07** (Sprint 2), **F-08** (Sprint 3) | **Sprint 2** (extended in Sprint 3) | Planned Sprint 2 contract (`F-07`) | Sprint 2 API tests: an open anonymous survey with ≥ 5 responses returns only the total (`suppressionReason: SURVEY_OPEN`); after close, per-question results appear. Sprint 3: anonymous date filter returns counts only; anonymous export only after close | Planned |

---

## 4. Non-Functional Requirements (`NFR-01` to `NFR-12`) Traceability

| NFR ID | Requirement | Measurable Target (`docs/srs.md`) | Feature(s) / System Responsibility | Sprint Allocation | Verification Method & Test ID | Status |
|---|---|---|---|---|---|---|
| **NFR-01** | **Response latency** | p95 server-side response time `< 300 ms` for list available surveys, submit response, view own submission and aggregate summary (1 survey, 10 questions, 1,000 stored responses, 50 requests per endpoint, warm server). | **F-03**, **F-04**, **SR-02** | Establish in **Sprint 1**, re-measure on GCP in **Sprint 3** | `TEST-NFR-01`: benchmark script on a separate benchmark data set in the test database: one identified survey with 10 questions, 1,000 responses from 1,000 synthetic respondents, plus 50 respondents who have not answered (all accounts share one hash computed once at seed time); 50 warm requests per endpoint; asserts `p95 < 300 ms`; machine specification recorded. | Planned |
| **NFR-02** | **Password protection** | Salted `bcrypt` (cost ≥ 10) or `Argon2id` hashes only; `0` plaintext passwords in database, logs or API responses; cost below 10 refused outside the test profile. | **F-01**, **SR-05** | **Sprint 1** | `TEST-NFR-02`: integration test checks every seeded user's hash prefix (`$2b$`/`$argon2id$`) and that login responses and log output exclude the password; start-up test shows `BCRYPT_COST` below 10 is refused unless `NODE_ENV=test`. | Planned |
| **NFR-03** | **Token authentication (JWT)** | Every endpoint except login and health check requires a valid, unexpired (≤ 60 min), unrevoked JWT; `100%` of protected endpoints return `401` with no private data on missing, tampered, expired or logged-out tokens. | **F-01** (authentication middleware on all protected routes) | **Sprint 1** | `TEST-NFR-03`: parameterized API suite running every protected route with missing, malformed-signature, expired and logged-out tokens. | Planned |
| **NFR-04** | **Responsive UI** | Main journeys (login, browse, submit, create/publish, summary) have no horizontal page scrolling and no clipped or overlapping controls at `360 px`, `768 px` and `1280 px`. | **F-01**, **F-02**, **F-03**, **F-04**, **SR-03** | **Sprint 1** (Sprint 1 screens), re-verify in **Sprint 3** | `TEST-NFR-04`: automated E2E viewport check (`document.documentElement.scrollWidth <= window.innerWidth`) at 360/768/1280 px + Deliverable 1 evidence screenshots. | Planned |
| **NFR-05** | **Server-side authorization** | Every protected operation checks role and record ownership on the server using token identity; `100%` of protected endpoints tested for unauthenticated, wrong-role and other-user's-record cases returning `401`, `403` or `404` with no private data. | **F-01**, **F-02**, **F-03**, **F-04** (system-wide role and ownership policy) | Establish in **Sprint 1**, extend in **Sprints 2–3** | `TEST-NFR-05`: role and ownership permission-matrix suite covering all Sprint 1 endpoints (`TEST-F01-05`, `TEST-F02-09`, `TEST-F03-08`, `TEST-F04-03`, `TEST-F04-04`), extended with every endpoint added in later sprints. | Planned |
| **NFR-06** | **Concurrency safety** | Under simultaneous submissions `BR-01` holds: 20 parallel submissions by 1 Respondent to 1 survey store `1` response and reject `19`. | **F-03**, **SR-02** (unique constraint, `D-10`) | **Sprint 1** | `TEST-NFR-06`: integration test firing 20 simultaneous `POST` requests with `Promise.all` against the real database and asserting `1` × `201` and `19` × `409`, with exactly one stored response and one participation record. | Planned |
| **NFR-07** | **Data durability** | Surveys, responses and accounts stored in a relational database; `100%` of data created before restart is retrievable after application restart. | **F-02**, **F-03**, **SR-02** | Establish in **Sprint 1**, verify on GCP in **Sprint 3** | `TEST-NFR-07`: persistence test creating a survey and a response, restarting the application process, and retrieving both through the API. | Planned |
| **NFR-08** | **Safe error handling** | Invalid, malformed or unauthorized requests return structured `4xx` JSON (`code`, `message`); `0` responses contain stack traces, SQL, file paths, password hashes or another user's data; unexpected errors return generic `5xx`. | **F-01**, **SR-04** | **Sprint 1** | `TEST-NFR-08`: negative API suite asserting the error schema and scanning response bodies for prohibited markers (stack frames, `SELECT`, `/src/`, `$2b$`). | Planned |
| **NFR-09** | **Secret handling** | `0` real secrets in Git or submitted documents; environment-variable configuration with placeholder-only `.env.example`; `0` secret-scan findings; server refuses to start without a `JWT_SECRET` of at least 32 characters. | **F-01**, **SR-05** | **Sprint 1** (scan moves into CI in Lab 5) | `TEST-NFR-09`: start-up test asserting the process refuses to start when `JWT_SECRET` is missing or shorter than 32 characters + secret scan (gitleaks or equivalent) of the repository history before release. | Planned |
| **NFR-10** | **Reproducible setup** | Clean checkout builds, migrates, seeds and passes the required test suite in `≤ 6` README commands with seeded accounts for each role. | **SR-01** | **Sprint 1** | `TEST-NFR-10`: clean-environment walkthrough executing the documented `README.md` commands and recording the command count (`≤ 6`) and test-runner output. | Planned |
| **NFR-11** | **Login throttling** | After 10 failed logins from one IP address within 1 minute, further attempts get `429` with a generic message until the minute passes; other addresses unaffected; email existence never revealed. | **F-01**, **SR-06** | **Sprint 3** | `TEST-NFR-11` (planned): API test sends 11 failed logins and asserts the 11th returns `429 RATE_LIMITED`, then a valid login succeeds after the window (shortened in the test profile). | Planned |
| **NFR-12** | **Accessibility basics** | Main journeys: every form control has a visible label, keyboard-only completion, `0` "serious" or "critical" violations in an automated accessibility scan. | **SR-03** | Built from **Sprint 1**, verified in **Sprint 3** | `TEST-NFR-12` (planned): Playwright + axe-core scan of each main screen and one keyboard-only login-and-submit journey. | Planned |

---

## 5. Sprint 1 Acceptance-Criteria-to-Test Status

This table is the Sprint 1 verification register. The AC and TEST IDs are defined in the Sprint 1 feature contracts (`docs/sprints/sprint-1/`). The last three columns are filled in from actual test output on the release commit for Deliverable 1 Part F; "Not run" means the test has not yet been executed on that commit.

| AC ID | Requirement(s) | Planned Test | Level | Actual test file / name | Result | Commit |
|---|---|---|---|---|---|---|
| `AC-F01-01` | FR-05 | `TEST-F01-01` | API | — | Not run | — |
| `AC-F01-02` | FR-05 | `TEST-F01-02` | API | — | Not run | — |
| `AC-F01-03` | FR-06 | `TEST-F01-03` | API + UI | — | Not run | — |
| `AC-F01-04` | FR-07 | `TEST-F01-04` | API + UI | — | Not run | — |
| `AC-F01-05` | BR-08, NFR-05 | `TEST-F01-05` | API | — | Not run | — |
| `AC-F02-01` | FR-01 | `TEST-F02-01` | Unit | — | Not run | — |
| `AC-F02-02` | FR-01 | `TEST-F02-02` | API + UI | — | Not run | — |
| `AC-F02-03` | FR-02 | `TEST-F02-03` | API + UI | — | Not run | — |
| `AC-F02-04` | FR-02, BR-04 | `TEST-F02-04` | Unit (TDD) + API | — | Not run | — |
| `AC-F02-05` | FR-10 | `TEST-F02-05` | API + UI | — | Not run | — |
| `AC-F02-06` | FR-11 | `TEST-F02-06` | API + UI | — | Not run | — |
| `AC-F02-07` | BR-03 | `TEST-F02-07` | Unit (TDD) | — | Not run | — |
| `AC-F02-08` | BR-04 | `TEST-F02-08` | Unit + API | — | Not run | — |
| `AC-F02-09` | BR-05, NFR-05 | `TEST-F02-09` | API | — | Not run | — |
| `AC-F03-01` | FR-03 | `TEST-F03-01` | E2E | — | Not run | — |
| `AC-F03-02` | FR-03 | `TEST-F03-02` | API + DB | — | Not run | — |
| `AC-F03-03` | FR-08, BR-02 | `TEST-F03-03` | API + UI | — | Not run | — |
| `AC-F03-04` | FR-09 | `TEST-F03-04` | API + UI | — | Not run | — |
| `AC-F03-05` | BR-01 | `TEST-F03-05` | Unit (TDD) + API + DB | — | Not run | — |
| `AC-F03-06` | BR-02 | `TEST-F03-06` | API (TDD) | — | Not run | — |
| `AC-F03-07` | BR-06 | `TEST-F03-07` | Unit (TDD) + API | — | Not run | — |
| `AC-F03-08` | BR-07, NFR-05 | `TEST-F03-08` | API | — | Not run | — |
| `AC-F03-09` | FR-09 | `TEST-F03-09` | API + UI | — | Not run | — |
| `AC-F04-01` | FR-04 | `TEST-F04-01` | Unit | — | Not run | — |
| `AC-F04-02` | FR-04 | `TEST-F04-02` | API + UI | — | Not run | — |
| `AC-F04-03` | BR-05, NFR-05 | `TEST-F04-03` | API | — | Not run | — |
| `AC-F04-04` | BR-07, NFR-05 | `TEST-F04-04` | API | — | Not run | — |
| — | NFR-01 | `TEST-NFR-01` | Performance | — | Not run | — |
| — | NFR-02 | `TEST-NFR-02` | API + start-up | — | Not run | — |
| — | NFR-03 | `TEST-NFR-03` | API | — | Not run | — |
| — | NFR-04 | `TEST-NFR-04` | E2E | — | Not run | — |
| — | NFR-05 | `TEST-NFR-05` | API | — | Not run | — |
| — | NFR-06 | `TEST-NFR-06` | API + DB | — | Not run | — |
| — | NFR-07 | `TEST-NFR-07` | API + DB (restart) | — | Not run | — |
| — | NFR-08 | `TEST-NFR-08` | API | — | Not run | — |
| — | NFR-09 | `TEST-NFR-09` | Start-up + secret scan | — | Not run | — |
| — | NFR-10 | `TEST-NFR-10` | Manual walkthrough | — | Not run | — |

`TEST-NFR-10` is the only planned manual check; every other Sprint 1 test is automated.

---

## 6. Baseline Coverage Summary & Gap Analysis

### 6.1 Baseline Coverage Summary

| Requirement Category | Baseline Count (`docs/srs.md`) | Mapped in Sprint 1 | Mapped in Sprint 2 | Mapped in Sprint 3 | Total Mapped & Covered |
|---|---|---|---|---|---|
| **Functional Requirements (`FR`)** | 21 (`FR-01` – `FR-21`) | 11 (`FR-01` – `FR-11`) | 6 (`FR-12` – `FR-17`) | 4 (`FR-18` – `FR-21`) | **21 / 21 (100%)** |
| **Business Rules (`BR`)** | 14 (`BR-01` – `BR-14`) | 8 (`BR-01` – `BR-08`) | 5 (`BR-09` – `BR-12`, `BR-14`) | 1 (`BR-13`) | **14 / 14 (100%)** |
| **Non-Functional Requirements (`NFR`)** | 12 (`NFR-01` – `NFR-12`) | 10 established and verified (`NFR-01` – `NFR-10`); `NFR-12` built | Extended for `F-05` – `F-07` | `NFR-11` and `NFR-12` verified; `NFR-01`, `NFR-04`, `NFR-07` re-verified on GCP | **12 / 12 (100%)** |

### 6.2 Uncovered Requirements (Coverage Gaps)
* **0 uncovered baseline requirements:** Every `FR`, `BR` and `NFR` in `docs/srs.md` v1.0 is mapped to at least one feature in `docs/features.md` or to a named system responsibility (`SR-01` – `SR-06`), and is assigned to a planned sprint.
* **Test execution status:** Rows start as `Planned` (or `Specified` once the Sprint 1 contract is committed) and move to `Verified` / `Accepted` only when the test has executed and passed on the release commit, recorded in Section 5.
* **0 open baseline questions or unapproved changes:** All design decisions (`D-01` – `D-18`), questions (`Q-01` – `Q-09`) and baseline refinements (`CHG-01` – `CHG-13`) have been reviewed and resolved by both authors. Any future change after v1.0 will be logged in Section 7.

---

## 7. Baseline Changes Log

Changes made after the initial v0.1 draft while establishing the v1.0 approved baseline. "Approved by" records joint acceptance by both authors.

| Change ID | Date | Affected IDs | Description & Justification | Approved by | Status |
|---|---|---|---|---|---|
| BL-01 | 2026-11-05 | All (v0.1) | Initial baseline established from `docs/srs.md` v0.1. | Both authors | Baseline |
| CHG-01 | 2026-11-06 | FR-07, FR-09, D-09, BR-10 | Clarifications made in `docs/srs.md` v0.2 to match the system design: `FR-07` reads the role and account status from the database; `FR-09` applies to `IDENTIFIED` surveys, and for `ANONYMOUS` surveys the respondent sees only the participation day because answers are not linked to the respondent (`BR-10`); the participation record stores only the day. No scope added or removed. | Both authors | Approved (Baseline v1.0) |
| CHG-02 | 2026-11-06 | BR-03, FR-12, F-02, F-05 | `BR-03` stays in Sprint 1, but its Sprint 1 verification is a unit test of the domain rule, because the edit endpoint belongs to `FR-12` (Sprint 2). API/UI verification of `BR-03` moves to Sprint 2 with `F-05`. No requirement moved between sprints. | Both authors | Approved (Baseline v1.0) |
| CHG-03 | 2026-11-07 | FR-01, FR-02, BR-04, SRS Section 6, D-15, F-02, TEST-F02-01, TEST-F02-04 | A draft may be saved incomplete (blank title, no questions, choice question with fewer than 2 options); the BR-04 checks run at publication and report every failure. Without this, every draft created in Sprint 1 already passed the publish checks, so `FR-02`'s rejection could not be shown through the API. | Both authors | Approved (Baseline v1.0) |
| CHG-04 | 2026-11-07 | BR-04, FR-11, TEST-F02-08 | `DRAFT` -> `CLOSED` and every other invalid transition are stated as rejected. `TEST-F02-08` now tests transitions that the API exposes (publish a `PUBLISHED` or `CLOSED` survey, close a `DRAFT` or `CLOSED` survey), because no endpoint returns a survey to `DRAFT`. | Both authors | Approved (Baseline v1.0) |
| CHG-05 | 2026-11-07 | BR-08, FR-07, TEST-F01-04, TEST-F01-05 | Server-owned fields in a request body are rejected with `400`, and identity values in headers or query strings are ignored. Resolves the conflict between "ignored" (traceability v0.2) and "rejected" (SDS strict validation). | Both authors | Approved (Baseline v1.0) |
| CHG-06 | 2026-11-07 | BR-10, FR-19, A-05, D-14 | Calendar days (participation day, anonymous answer day, per-day counts, date filters) are Asia/Bangkok days. | Both authors | Approved (Baseline v1.0) |
| CHG-07 | 2026-11-07 | FR-12, FR-14, BR-03, BR-04, D-11, D-16, F-05 | The close date must be in the future and can be changed only while the survey is a draft or open; once closed it is frozen. Prevents a passed close date from being moved later to reopen a closed survey, which would contradict `D-07`. | Both authors | Approved (Baseline v1.0) |
| CHG-08 | 2026-11-07 | BR-14 (new), FR-04, FR-17, FR-19, FR-20, D-09, D-17, F-07, F-08 | New `BR-14`: anonymous results are released only after the survey closes, and anonymous date filters show counts only. Closes a privacy gap where comparing results over time or across date ranges could isolate one person's answers. | Both authors | Approved (Baseline v1.0) |
| CHG-09 | 2026-11-07 | FR-09, F-03, AC-F03-09, TEST-F03-09 | `FR-09` adds a list of the respondent's own responses, including closed surveys. Without it a respondent cannot reach their submission after the survey closes, because `FR-08` hides closed surveys. Adds one Sprint 1 endpoint (`GET /api/v1/my-responses`). | Both authors | Approved (Baseline v1.0) |
| CHG-10 | 2026-11-07 | FR-12, FR-15, BR-03, BR-12, D-18, Q-06, F-05 | Eligibility can be changed while the survey is a draft or open; a selected list needs at least one Respondent; existing responses are kept and the respondent can still view their own submission. | Both authors | Approved (Baseline v1.0) |
| CHG-11 | 2026-11-07 | FR-21, D-13, Q-04, F-09 | `FR-21` and `F-09` are no longer optional. Keeping an optional requirement in the baseline would make its later removal look like a silent scope cut; the feature is small because the active-account check already exists. | Both authors | Approved (Baseline v1.0) |
| CHG-12 | 2026-11-07 | NFR-11 (new), NFR-12 (new), SR-01 – SR-06, F-01 | Login throttling and accessibility basics, already described in the System-Level SDS, become measurable NFRs so that they are traced and verified. System responsibilities `SR-01` – `SR-06` are added for cross-cutting NFRs. | Both authors | Approved (Baseline v1.0) |
| CHG-13 | 2026-11-07 | FR-04, FR-10, FR-11, NFR-01, NFR-02, NFR-09, TEST-F03-06, TEST-F04-01, TEST-F04-02, TEST-NFR-01, TEST-NFR-02, TEST-NFR-09 | Verification refinements: rounding, 0-answer choice percentage and the empty mean in `FR-04`; a `DRAFT` summary returns `409`; benchmark data defined for `NFR-01`; start-up rules for `BCRYPT_COST` (≥ 10) and `JWT_SECRET` (≥ 32 characters); exact error codes in tests. No scope added or removed. | Both authors | Approved (Baseline v1.0) |