# F-03 Feature Contract: Survey Discovery, Response Submission & Respondent History

**Sprint:** 1 | **File:** `docs/sprints/sprint-1/F-03-responses.md` | **Version:** 1.0 (Specified) | **Date:** 12 November 2026
**Baseline:** `docs/srs.md` v1.0, `docs/system-sds.md` v1.0 | **Status:** Specified
**Lead:** Muhammad Asad Aziz | **Reviewer:** Al Xander James Codino Ybanez

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-07 | Muhammad Asad Aziz (Author 1, AI-assisted draft) | Initial contract |
| 1.0 | 2026-11-12 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Partner review complete; contract approved as v1.0 (Specified) before implementation |

---

## 1. Identification

| Item | Value |
|---|---|
| Feature | F-03 Survey Discovery, Response Submission & Respondent History |
| Functional requirements | FR-03 Submit Response, FR-08 Browse Available Surveys, FR-09 View Own Submissions (identified variant) |
| Business rules | BR-01 One response per respondent per survey, BR-02 Only open surveys accept responses, BR-06 Response completely valid, BR-07 Respondent reads only own response, BR-08 Role decides actions |
| NFRs | NFR-01 (list, submit, own submission), NFR-04 (respondent screens), NFR-05 (respondent routes), NFR-06 (parallel submissions), NFR-07 (responses survive restart) |
| Actors | Respondent (all operations); Survey Owner and Administrator (denied) |
| Depends on | F-01 (authentication, roles, schema), F-02 (published surveys) |
| Used by | F-04 (summaries count stored responses) |
| Not in this feature | Anonymous submissions and the anonymous own-submission view (F-07, Sprint 2); close dates and eligibility lists (F-05); multiple-choice and free-text answers (F-06); editing or deleting a submitted response (excluded) |

---

## 2. Feature-level design

### 2.1 Workflows

**Browse (FR-08)**: lists surveys that are open for the caller: stored status `PUBLISHED`, close date absent or in the future, eligibility `ALL` (every active Respondent is eligible in Sprint 1, D-03). Each item carries `alreadyResponded`, true when a `Participation` row exists for (survey, caller). Newest published first, paginated.

**Open the form**: returns an open survey's questions and options in position order, its mode and `alreadyResponded`. A `DRAFT` or unknown survey → `404`; a closed survey → `409 SURVEY_NOT_OPEN`.

**Submit (FR-03)**: one database transaction (SDS Section 3.4), with checks in this order:
1. `requireRole('RESPONDENT')` → otherwise `403`.
2. Body shape (strict schema, Section 2.2) → otherwise `400`.
3. Read the survey with its questions and options. Not found or `DRAFT` → `404 NOT_FOUND`.
4. `effectiveStatus(survey, now)` is `CLOSED` → `409 SURVEY_NOT_OPEN`.
5. A `Participation` row already exists for (survey, caller) → `409 DUPLICATE_RESPONSE`.
6. `validateAnswers(survey, answers)` (BR-06) returns every problem → `400 VALIDATION_ERROR` with all of them.
7. Insert `Participation` (`participatedDay` = `calendarDay(now)`). A unique-constraint violation here (a parallel request won) → roll back, `409 DUPLICATE_RESPONSE`.
8. Insert `Response` (`mode` `IDENTIFIED`, `respondentId` = caller, `submittedAt` = now, `submittedDay` = `calendarDay(now)`), then one `Answer` per answered question and one `AnswerSelection` per chosen option.
9. Commit and return `201`. Any error in steps 7–8 rolls back everything.

**List own responses (FR-09)**: the caller's `Participation` rows joined with their surveys, including closed surveys, newest first, each with title, mode, effective status and `participatedDay`; for identified surveys also `responseId` and `submittedAt`.

**View own submission (FR-09)**: by survey (`my-response`) or by response id, scoped by `respondentId` = caller. Works for open and closed surveys. A survey the caller has not answered, or a response that is not the caller's → `404`.

### 2.2 Validation

Request body of `POST /surveys/{id}/responses`:

| Field | Rule |
|---|---|
| `answers` | Required array, 0–30 items |
| `answers[i].questionId` | Required UUID |
| `answers[i].optionIds` | Array of 1 or more UUIDs; used for choice questions only |
| `answers[i].rating` | Integer; used for rating questions only |
| Any other field (for example `respondentId`, `submittedAt`, `text`) | Not allowed (strict schema) → `400` |

`validateAnswers(survey, answers)` (BR-06), all problems reported together:

| Check | Issue reported on |
|---|---|
| Every required question has exactly one answer | `answers`, "question <position> is required" |
| `questionId` belongs to this survey | `answers[i].questionId` |
| The same question is answered at most once | `answers[i].questionId` |
| Single-choice: `optionIds` has exactly 1 item and no `rating` | `answers[i].optionIds` |
| Each option id belongs to that question | `answers[i].optionIds` |
| Rating: `rating` is an integer 1–5 and no `optionIds` | `answers[i].rating` |

An optional question may be left out of `answers`. An empty `answers` array is valid only when the survey has no required question.

### 2.3 Business rules applied

| Rule | Application in F-03 | Database backstop |
|---|---|---|
| BR-01 | Step 5 check plus step 7 insert inside the transaction | Unique `(surveyId, respondentId)` on `Participation` and on `Response` |
| BR-02 | Steps 3–4; browse filters on effective status; drafts are invisible (`404`) | – |
| BR-06 | `validateAnswers` in `domain/validateAnswers.ts` before any insert | Unique `(responseId, questionId)`; rating 1–5 check; one-value check on `Answer` |
| BR-07 | Every respondent query scoped by `respondentId` = caller; no respondent route returns summaries | – |
| BR-08 | All routes use `requireRole('RESPONDENT')` | Enum `Role` |

### 2.4 Failure and boundary cases

| Case | Result |
|---|---|
| Rating 1 and rating 5 | Accepted |
| Rating 0, 6 or 3.5 | `400` on `answers[i].rating` |
| Optional question omitted | Accepted |
| Submission to a `DRAFT` survey | `404`, nothing stored |
| Submission to a `CLOSED` survey | `409 SURVEY_NOT_OPEN`, nothing stored |
| Second submission by the same respondent | `409 DUPLICATE_RESPONSE`, still one response |
| 20 parallel submissions by one respondent | 1 × `201`, 19 × `409` (NFR-06) |
| Survey closed by the owner while a submission is in flight | Accepted if the submit transaction read the survey as open, rejected if it read it as closed (SDS Section 3.4) |
| Survey id or response id that is not a UUID | `404` |

### 2.5 Permissions

| Operation | Unauthenticated | Respondent | Survey Owner | Administrator |
|---|---|---|---|---|
| Browse, open form | 401 | Allow (open surveys) | 403 | 403 |
| Submit | 401 | Allow (open, once) | 403 | 403 |
| List own responses, view own submission | 401 | Own only; others 404 | 403 | 403 |

---

## 3. UI specification

| Screen | Behavior |
|---|---|
| `/available` | Cards with title, description excerpt, mode badge ("Identified"), number of questions. Surveys already answered show a "Responded" badge and a "View my submission" link instead of "Answer". Empty state: "No surveys are open for you right now." Skeleton while loading. |
| `/available/:surveyId` | Title, description, questions in order: single-choice as a radio group, rating as five labelled radio buttons 1–5; required questions marked "Required". **Above the submit button**, a notice: "Identified survey: your answers are linked to your name and the survey owner can see them." "Submit" is disabled while sending. Client checks mirror Section 2.2 and highlight unanswered required questions. On `201`: confirmation panel "Response submitted on <date and time, Bangkok>" with a link to the submission. On `409 DUPLICATE_RESPONSE`: "You have already responded to this survey." with a link to the submission. On `409 SURVEY_NOT_OPEN`: "This survey is closed." On `400`: errors next to the questions. If `alreadyResponded` is true on load, the form is replaced by the "already responded" message. |
| `/my-responses` | List of surveys answered: title, status (Published or Closed), day of participation; each links to the submission. Empty state: "You have not answered any surveys yet." |
| `/my-responses/:surveyId` | Survey title, submission time (Bangkok), and each question with the chosen option or rating. `404` → "Submission not found." |

---

## 4. API specification

### 4.1 `GET /api/v1/available-surveys?page=1&pageSize=20` (Respondent)

```json
{
  "data": [
    { "id": "s1…", "title": "Seed: CPE334 Course Evaluation", "description": "…", "mode": "IDENTIFIED",
      "questionCount": 2, "closeAt": null, "alreadyResponded": false }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1 }
}
```

Errors: `400` (paging), `401`, `403`.

### 4.2 `GET /api/v1/available-surveys/{id}` (Respondent)

```json
{
  "data": {
    "id": "s1…", "title": "…", "description": "…", "mode": "IDENTIFIED", "alreadyResponded": false,
    "questions": [
      { "id": "q1…", "position": 1, "type": "SINGLE_CHOICE", "text": "How was the lab workload?", "required": true,
        "options": [ { "id": "o1…", "position": 1, "text": "Too light" }, { "id": "o2…", "position": 2, "text": "About right" }, { "id": "o3…", "position": 3, "text": "Too heavy" } ] },
      { "id": "q2…", "position": 2, "type": "RATING", "text": "Rate the course overall", "required": true, "options": [] }
    ]
  }
}
```

Errors: `401`, `403`, `404`, `409 SURVEY_NOT_OPEN`.

### 4.3 `POST /api/v1/surveys/{id}/responses` (Respondent)

Request:

```json
{ "answers": [ { "questionId": "q1…", "optionIds": ["o2…"] }, { "questionId": "q2…", "rating": 4 } ] }
```

`201 Created`:

```json
{ "data": { "responseId": "r1…", "surveyId": "s1…", "submittedAt": "2026-11-07T03:41:12.000Z" } }
```

Errors: `400 VALIDATION_ERROR`, `401`, `403`, `404`, `409 SURVEY_NOT_OPEN`, `409 DUPLICATE_RESPONSE`.

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The response is not valid.",
  "details": [ { "field": "answers[1].rating", "issue": "must be an integer from 1 to 5" } ], "requestId": "…" } }
```

### 4.4 `GET /api/v1/my-responses?page=1&pageSize=20` (Respondent)

```json
{
  "data": [
    { "surveyId": "s1…", "title": "Seed: CPE334 Course Evaluation", "mode": "IDENTIFIED", "status": "CLOSED",
      "participatedDay": "2026-11-07", "responseId": "r1…", "submittedAt": "2026-11-07T03:41:12.000Z" }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1 }
}
```

Errors: `400` (paging), `401`, `403`.

### 4.5 `GET /api/v1/surveys/{id}/my-response` and `GET /api/v1/responses/{responseId}` (Respondent, own)

```json
{
  "data": {
    "responseId": "r1…", "surveyId": "s1…", "title": "Seed: CPE334 Course Evaluation", "mode": "IDENTIFIED",
    "submittedAt": "2026-11-07T03:41:12.000Z",
    "answers": [
      { "questionId": "q1…", "position": 1, "text": "How was the lab workload?", "type": "SINGLE_CHOICE",
        "selectedOptions": [ { "id": "o2…", "text": "About right" } ], "rating": null },
      { "questionId": "q2…", "position": 2, "text": "Rate the course overall", "type": "RATING",
        "selectedOptions": [], "rating": 4 }
    ]
  }
}
```

Errors: `401`, `403`, `404`. The body never contains another user's id or display name.

---

## 5. Data specification

| Item | Specification |
|---|---|
| Tables written | `Participation` (`surveyId`, `respondentId`, `participatedDay`), `Response` (`surveyId`, `mode`, `respondentId`, `submittedDay`, `submittedAt`), `Answer` (`responseId`, `questionId`, `ratingValue`), `AnswerSelection` (`answerId`, `optionId`) |
| Tables read | `Survey`, `Question`, `Option` |
| Migration | No change. All tables and constraints come from F-01's migrations |
| Constraints relied on | Unique `(surveyId, respondentId)` on `Participation` and `Response`; composite FK `(surveyId, mode)`; `response_identity_by_mode_chk`; unique `(responseId, questionId)`; `answer_rating_range_chk`; `answer_single_value_chk`; `onDelete: Restrict` from responses and participations to the survey |
| Days | `participatedDay` and `submittedDay` are Asia/Bangkok calendar days from `calendarDay(now)` (D-14) |

---

## 6. Acceptance criteria

### AC-F03-01 — Respondent answers a survey in the UI and sees confirmation (FR-03)

**Scenario: identified survey submitted through the UI**
- **Given** resp1 is logged in and has not answered the open survey S-PUB
- **When** resp1 opens S-PUB from `/available`
- **Then** the notice "Identified survey: your answers are linked to your name and the survey owner can see them." is visible above the "Submit" button
- **When** resp1 chooses "About right" for Q1, rating 4 for Q2 and clicks "Submit"
- **Then** a confirmation "Response submitted on …" is shown with a link to the submission
- **And** back on `/available`, S-PUB shows the "Responded" badge

### AC-F03-02 — A valid response is stored completely in one transaction (FR-03)

**Scenario: response persisted**
- **Given** resp2 has not answered the open survey S-PUB
- **When** resp2 sends `POST /api/v1/surveys/{S-PUB}/responses` with option "About right" for Q1 and rating 5 for Q2
- **Then** the response is `201` with `responseId`, `surveyId` and `submittedAt`
- **And** the database holds exactly one `Participation` for (S-PUB, resp2) whose `participatedDay` is today's Bangkok date
- **And** one `Response` with mode `IDENTIFIED`, `respondentId` resp2, `submittedAt` set and the same Bangkok day, with two `Answer` rows and one `AnswerSelection` for "About right"

**Scenario: a failure part-way stores nothing**
- **Given** resp2 has not answered S-PUB, and the step that writes answers is made to fail (failure injected through the service's answer writer in the test)
- **When** resp2 submits a valid response
- **Then** the request fails with `500 INTERNAL_ERROR` and a generic message
- **And** there is no `Participation`, `Response`, `Answer` or `AnswerSelection` row for (S-PUB, resp2)

### AC-F03-03 — Respondent sees only open surveys, with a responded indicator (FR-08, BR-02)

**Scenario: browse**
- **Given** S-PUB is published, S-DRAFT is a draft, S-CLOSED is closed, and resp1 has answered S-PUB while resp3 has not
- **When** resp1 sends `GET /api/v1/available-surveys`
- **Then** S-PUB is listed with `alreadyResponded` true
- **And** S-DRAFT and S-CLOSED are not listed
- **When** resp3 sends the same request
- **Then** S-PUB is listed with `alreadyResponded` false

**Scenario: a draft cannot be opened**
- **When** resp1 sends `GET /api/v1/available-surveys/{S-DRAFT}`
- **Then** the response is `404 NOT_FOUND`

**Scenario: browse in the UI**
- **Given** resp1 has answered S-PUB
- **When** resp1 opens `/available`
- **Then** S-PUB shows "Responded" and "View my submission", and no draft or closed survey is shown

### AC-F03-04 — Respondent views their own submission (FR-09)

**Scenario: own submission while open and after close**
- **Given** resp1 submitted response R to S-PUB with "About right" and rating 4
- **When** resp1 sends `GET /api/v1/surveys/{S-PUB}/my-response`
- **Then** the response is `200` with R's id, `submittedAt`, Q1 with selected option "About right" and Q2 with rating 4
- **And** `GET /api/v1/responses/{R}` by resp1 returns the same data
- **When** owner1 closes S-PUB and resp1 repeats the request
- **Then** the response is still `200` with the same data

**Scenario: not answered**
- **Given** resp3 has not answered S-PUB
- **When** resp3 sends `GET /api/v1/surveys/{S-PUB}/my-response`
- **Then** the response is `404 NOT_FOUND`

**Scenario: another respondent's response id**
- **When** resp2 sends `GET /api/v1/responses/{R}`
- **Then** the response is `404 NOT_FOUND` with none of R's answers

**Scenario: submission page in the UI**
- **Given** resp1 submitted R
- **When** resp1 opens `/my-responses/{S-PUB}`
- **Then** the page shows the submission time in Bangkok time, "About right" and rating 4

### AC-F03-05 — A respondent can respond only once (BR-01)

**Scenario: second submission**
- **Given** resp1 has already submitted a response to S-PUB
- **When** resp1 sends another valid `POST /api/v1/surveys/{S-PUB}/responses`
- **Then** the response is `409 DUPLICATE_RESPONSE`
- **And** the database still holds exactly one `Response` and one `Participation` for (S-PUB, resp1)

**Scenario: the database refuses a duplicate on its own**
- **Given** a `Participation` row for (S-PUB, resp1)
- **When** a second row for the same pair is inserted directly through Prisma
- **Then** the insert fails with a unique-constraint error
- **And** the service maps that error to `DUPLICATE_RESPONSE`

### AC-F03-06 — Only open surveys accept responses (BR-02)

**Scenario Outline: survey not open**
- **Given** resp1 is logged in and survey X is `<state>`
- **When** resp1 sends a response to X that would otherwise be valid
- **Then** the response is `<status>` with code `<code>`
- **And** no `Participation`, `Response` or `Answer` row is created

| state | status | code |
|---|---|---|
| `DRAFT` | 404 | `NOT_FOUND` |
| `CLOSED` | 409 | `SURVEY_NOT_OPEN` |

Sprint 2 adds the case "close date reached" with F-05.

### AC-F03-07 — A response is accepted only if it is completely valid (BR-06)

**Scenario Outline: invalid answers**
- **Given** resp1 has not answered S-PUB (Q1 single-choice, required; Q2 rating, required)
- **When** resp1 submits answers where `<problem>`
- **Then** the response is `400 VALIDATION_ERROR` with a `details` entry on `<field>`
- **And** nothing is stored for (S-PUB, resp1), and resp1 can still submit a valid response afterwards

| problem | field |
|---|---|
| Q2 is missing | `answers` |
| `answers` is empty | `answers` |
| a `questionId` belongs to another survey | `answers[i].questionId` |
| Q1 is answered twice | `answers[i].questionId` |
| Q1 has two option ids | `answers[i].optionIds` |
| Q1 has an option id of another question | `answers[i].optionIds` |
| Q1 is answered with a `rating` instead of `optionIds` | `answers[i].optionIds` |
| Q2 rating is 0 | `answers[i].rating` |
| Q2 rating is 6 | `answers[i].rating` |
| Q2 rating is 3.5 | `answers[i].rating` |
| Q2 is answered with `optionIds` | `answers[i].rating` |
| the body contains `"respondentId": "<resp2's id>"` | `respondentId` |

**Scenario Outline: boundary values accepted**
- **Given** a survey with a required rating question and an optional single-choice question
- **When** a respondent submits `<answers>`
- **Then** the response is `201`

| answers |
|---|
| rating 1, optional question omitted |
| rating 5, optional question answered |

### AC-F03-08 — A respondent cannot read another respondent's response (BR-07)

**Scenario: cross-respondent access**
- **Given** resp1 submitted response R to S-PUB and resp2 submitted response R2 to S-PUB
- **When** resp2 sends `GET /api/v1/responses/{R}`
- **Then** the response is `404 NOT_FOUND` and the body contains none of R's answers or resp1's identity
- **When** resp2 sends `GET /api/v1/surveys/{S-PUB}/my-response`
- **Then** the response contains R2, never R
- **When** resp2 sends `GET /api/v1/my-responses`
- **Then** the list contains only resp2's participation

### AC-F03-09 — Respondent lists their own responses, including closed surveys (FR-09)

**Scenario: list after a survey closes**
- **Given** resp1 answered S-PUB and survey T, owner1 then closed T, and resp2 answered S-PUB
- **When** resp1 sends `GET /api/v1/my-responses`
- **Then** the response is `200` with exactly two items: S-PUB with status `PUBLISHED` and T with status `CLOSED`
- **And** each item has `participatedDay` (today's Bangkok date), `responseId` and `submittedAt`
- **And** nothing about resp2's response is included

**Scenario: list in the UI**
- **Given** the same data
- **When** resp1 opens `/my-responses` and clicks T
- **Then** T is listed as "Closed" and its submission page shows resp1's answers

**Scenario: nothing answered**
- **Given** resp3 has answered nothing
- **When** resp3 opens `/my-responses`
- **Then** the page shows "You have not answered any surveys yet."

---

## 7. Software Test Specification

| Test ID | AC | Level | Preconditions / input | Action | Expected result | Planned file |
|---|---|---|---|---|---|---|
| TEST-F03-01 | AC-F03-01 | E2E | Demo seed; resp1 has not answered S-PUB | Log in as resp1, open S-PUB, check the notice position, answer, submit, return to `/available` | Notice text visible and located above the submit button; confirmation shown; "Responded" badge on S-PUB | `tests/e2e/respondent-submit.spec.ts` › "submit identified survey" |
| TEST-F03-02 | AC-F03-02 | API + DB | Fixture S-PUB; resp2 has not answered. Second case: service built with an answer writer that throws | Submit the valid response; query the four tables. Second case: submit through the failing service | `201` with the three fields; exactly 1 participation, 1 response (`IDENTIFIED`, resp2, `submittedAt` set, Bangkok day), 2 answers, 1 selection. Second case: `500 INTERNAL_ERROR` with generic message; 0 rows in all four tables for (S-PUB, resp2) | `tests/integration/responses.test.ts` › "persist", "rollback" |
| TEST-F03-03 | AC-F03-03 | API + E2E | Fixtures S-PUB, S-DRAFT, S-CLOSED; resp1 answered S-PUB | API: resp1 and resp3 list; resp1 opens S-DRAFT form. E2E: resp1 opens `/available` | API: lists contain only S-PUB, with `alreadyResponded` true for resp1 and false for resp3; draft form `404`. E2E: badge and link shown; no draft or closed survey | `tests/integration/available-surveys.test.ts`; `tests/e2e/respondent-submit.spec.ts` › "browse" |
| TEST-F03-04 | AC-F03-04 | API + E2E | resp1 submitted R to S-PUB; resp2 and resp3 exist | API: resp1 `my-response` and `responses/{R}`; owner1 closes S-PUB; repeat; resp3 `my-response`; resp2 `responses/{R}`. E2E: resp1 opens `/my-responses/{S-PUB}` | API: both `200` with identical answers, still `200` after close; resp3 `404`; resp2 `404` without R's answers. E2E: time, option and rating shown | `tests/integration/my-responses.test.ts` › "view own"; `tests/e2e/respondent-submit.spec.ts` › "view submission" |
| TEST-F03-05 | AC-F03-05 | Unit (TDD) + API + DB | resp1 already answered S-PUB | Unit: error mapper with a Prisma `P2002` error. API: second submission; count rows. DB: insert a duplicate `Participation` directly | Unit: maps to `DUPLICATE_RESPONSE`. API: `409 DUPLICATE_RESPONSE`, counts still 1 and 1. DB: unique-constraint error | `tests/unit/errorMapping.test.ts`; `tests/integration/responses.test.ts` › "duplicate" |
| TEST-F03-06 | AC-F03-06 | API + DB (TDD) | resp1; a draft survey and a closed survey, each with valid answer payloads | Submit to each; count rows | Draft: `404 NOT_FOUND`; closed: `409 SURVEY_NOT_OPEN`; 0 new rows in each case | `tests/integration/responses.test.ts` › "not open" |
| TEST-F03-07 | AC-F03-07 | Unit (TDD) + API + DB | Unit: `validateAnswers` with S-PUB's structure. API: fixture S-PUB; a second survey for the accepted boundary cases | Unit: each problem row and each accepted row. API: submit each problem payload, then a valid payload; submit the two boundary payloads | Unit: expected issue paths, all problems in one result; accepted rows return no issues. API: `400` with the expected `details[].field` and 0 rows after each; the final valid submission `201`; boundary payloads `201` | `tests/unit/validateAnswers.test.ts`; `tests/integration/responses.test.ts` › "invalid answers", "boundaries" |
| TEST-F03-08 | AC-F03-08 | API | resp1 submitted R and resp2 submitted R2 to S-PUB | resp2: `responses/{R}`, `my-response` for S-PUB, `my-responses` | `404` with no R answers and no resp1 id or name in the body; `my-response` returns R2's id; `my-responses` has 1 item, R2 | `tests/integration/my-responses.test.ts` › "cross-respondent" |
| TEST-F03-09 | AC-F03-09 | API + E2E | resp1 answered S-PUB and T; T then closed; resp2 answered S-PUB; resp3 answered nothing | API: resp1 `GET /my-responses`. E2E: resp1 opens `/my-responses` and T; resp3 opens `/my-responses` | API: exactly 2 items with the expected statuses, Bangkok `participatedDay`, `responseId`, `submittedAt`; no resp2 data. E2E: "Closed" label, answers shown; empty-state text for resp3 | `tests/integration/my-responses.test.ts` › "list"; `tests/e2e/respondent-submit.spec.ts` › "my responses" |

Related NFR tests: TEST-NFR-01 (latency of browse, submit and own submission), TEST-NFR-04 (respondent screens), TEST-NFR-05 (respondent routes), TEST-NFR-06 (20 parallel submissions), TEST-NFR-07 (a response survives restart).

---

## 8. Feature Definition of Done

The Product Definition of Done items D-1 to D-10 (`definition-of-done.md`) apply. In addition, F-03 is done when:

- TEST-F03-01 to TEST-F03-09 pass on the PR head commit, with red-then-green commits recorded for TEST-F03-05, TEST-F03-06 and TEST-F03-07.
- TEST-NFR-06 passes: 20 parallel submissions store exactly 1 response.
- TEST-F01-05 (role matrix) and TEST-NFR-03 cover all F-03 routes.
- The reviewer has checked in the PR that every respondent query filters by `respondentId` = caller, and that the submit path writes all rows inside one transaction.
