# F-04 Feature Contract: Aggregate Survey Results Summary

**Sprint:** 1 | **File:** `docs/sprints/sprint-1/F-04-summary.md` | **Version:** 1.0 (Specified) | **Date:** 12 November 2026
**Baseline:** `docs/srs.md` v1.0, `docs/system-sds.md` v1.0 | **Status:** Specified
**Lead:** Al Xander James Codino Ybanez | **Reviewer:** Muhammad Asad Aziz

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-07 | Muhammad Asad Aziz (Author 1, AI-assisted draft) | Initial contract |
| 1.0 | 2026-11-12 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Partner review complete; contract approved as v1.0 (Specified) before implementation |

---

## 1. Identification

| Item | Value |
|---|---|
| Feature | F-04 Aggregate Survey Results Summary |
| Functional requirements | FR-04 View Aggregate Summary (identified surveys) |
| Business rules | BR-05 Owner acts only on own surveys, BR-07 Respondents never see aggregate results, BR-08 Role decides actions |
| NFRs | NFR-01 (summary latency), NFR-04 (summary screen), NFR-05 (summary route) |
| Actors | Survey Owner; Respondent and Administrator (denied) |
| Depends on | F-01, F-02 (published and closed surveys), F-03 (stored responses) |
| Not in this feature | Anonymous suppression (BR-11, BR-14, F-07, Sprint 2); multiple-choice and free-text results (F-06); date filter and export (F-08, Sprint 3) |

---

## 2. Feature-level design

### 2.1 Workflow

1. `requireRole('SURVEY_OWNER')`, otherwise `403`.
2. Load the survey with `where { id, ownerId: caller }`; not found → `404`.
3. If its status is `DRAFT` → `409 SURVEY_NOT_PUBLISHED`.
4. Run three SQL aggregates (SDS Section 4.5), never loading individual answers into memory:
   - `totalResponses` = `COUNT(*)` of `Response` for the survey;
   - per single-choice question: `COUNT` of `AnswerSelection` grouped by option, and the number of answers to the question;
   - per rating question: number of answers, `SUM` of `ratingValue`, and `COUNT` grouped by `ratingValue`.
5. Pass the raw counts to the pure function `buildSummary(questions, counts)` in `domain/summaryMath.ts`, which computes percentages, means and the full 1–5 distribution with the rounding rules below, and keeps questions and options in position order.
6. Set `suppressed: false` and `suppressionReason: null`. (In Sprint 2 the same response passes through `suppression.ts` for anonymous surveys.)

### 2.2 Calculation rules (FR-04)

| Value | Rule |
|---|---|
| `answered` | Number of responses that answered the question (lower than `totalResponses` when the question is optional) |
| Option `count` | Number of answers that chose the option; options never chosen have count 0 |
| Option `percent` | `count / answered × 100`, rounded half up to 1 decimal place; `null` when `answered` is 0 |
| Rating `mean` | `sum / answered`, rounded half up to 2 decimal places; `null` when `answered` is 0 |
| Rating `distribution` | Object with keys `"1"` to `"5"`, all always present, values are counts |

Rounding is done on integers (for example `Math.round(count × 1000 / answered) / 10` for 1 decimal place) to avoid floating-point errors such as 66.66 being shown for two thirds.

### 2.3 Failure and boundary cases

| Case | Result |
|---|---|
| Published survey with no responses | `200`, `totalResponses` 0, counts 0, percentages and means `null`; UI "No responses yet." |
| Optional question answered by some respondents | Its `answered` is lower than `totalResponses`; percentages use `answered` |
| Closed survey | `200`, same results as just before closing |
| Draft survey | `409 SURVEY_NOT_PUBLISHED` |
| Another owner's survey or unknown id | `404` with no data |
| Respondent or Administrator | `403` |

### 2.4 Permissions

| Operation | Unauthenticated | Respondent | Survey Owner | Administrator |
|---|---|---|---|---|
| View summary | 401 | 403 | Own published or closed surveys; others 404 | 403 |

---

## 3. UI specification

| Screen | Behavior |
|---|---|
| `/my-surveys/:surveyId/summary` | Header with survey title, status and "Total responses: N". One card per question in order. Single-choice: one horizontal bar per option with the option text, count and percentage (for example "About right — 2 (66.7%)"); "—" when the percentage is `null`. Rating: "Average 4.67 from 3 answers" and five bars for 1 to 5 with counts. Every bar has its number as text, so the result does not depend on colour. Empty state when total is 0: "No responses yet." Skeleton while loading; `409` shows "A draft has no results yet."; `404` shows "Survey not found." Bars stack vertically at 360 px without horizontal scrolling (NFR-04). |

The link to this screen appears on the survey detail page for published and closed surveys only (F-02).

---

## 4. API specification

### 4.1 `GET /api/v1/surveys/{id}/summary` (Survey Owner, own)

`200 OK`:

```json
{
  "data": {
    "surveyId": "s1…", "title": "Seed: CPE334 Course Evaluation", "status": "PUBLISHED",
    "totalResponses": 3, "suppressed": false, "suppressionReason": null,
    "questions": [
      { "questionId": "q1…", "position": 1, "text": "How was the lab workload?", "type": "SINGLE_CHOICE", "answered": 3,
        "options": [
          { "optionId": "o1…", "text": "Too light", "count": 0, "percent": 0.0 },
          { "optionId": "o2…", "text": "About right", "count": 2, "percent": 66.7 },
          { "optionId": "o3…", "text": "Too heavy", "count": 1, "percent": 33.3 }
        ] },
      { "questionId": "q2…", "position": 2, "text": "Rate the course overall", "type": "RATING", "answered": 3,
        "mean": 4.67, "distribution": { "1": 0, "2": 0, "3": 0, "4": 1, "5": 2 } }
    ]
  }
}
```

Errors: `401`, `403`, `404`, `409 SURVEY_NOT_PUBLISHED`. The body never contains respondent ids, names or individual answers.

---

## 5. Data specification

| Item | Specification |
|---|---|
| Tables read | `Survey`, `Question`, `Option`, `Response`, `Answer`, `AnswerSelection` |
| Tables written | None |
| Migration | No change |
| Indexes relied on | `Answer(questionId)`, `AnswerSelection(optionId)`, `Response(surveyId, submittedDay)` (SDS Section 4.5), for NFR-01 |

---

## 6. Acceptance criteria

### AC-F04-01 — Summary values are calculated and rounded correctly (FR-04)

**Scenario Outline: single-choice percentages**
- **Given** a single-choice question answered `<answered>` times with option counts `<counts>`
- **When** `buildSummary` computes the question
- **Then** the option percentages are `<percents>`

| answered | counts | percents |
|---|---|---|
| 12 | 9, 3 | 75.0, 25.0 |
| 3 | 2, 1, 0 | 66.7, 33.3, 0.0 |
| 3 | 1, 1, 1 | 33.3, 33.3, 33.3 |
| 16 | 1, 15 | 6.3, 93.8 |
| 0 | 0, 0 | null, null |

**Scenario Outline: rating mean and distribution**
- **Given** a rating question with answers `<ratings>`
- **When** `buildSummary` computes the question
- **Then** `answered` is `<answered>`, `mean` is `<mean>` and `distribution` is `<distribution>`

| ratings | answered | mean | distribution (1,2,3,4,5) |
|---|---|---|---|
| 4, 5, 5 | 3 | 4.67 | 0, 0, 0, 1, 2 |
| 1, 2, 2 | 3 | 1.67 | 1, 2, 0, 0, 0 |
| 5, 5, 4, 4, 4, 2 | 6 | 4.00 | 0, 1, 0, 3, 2 |
| 4, 5 | 2 | 4.50 | 0, 0, 0, 1, 1 |
| (none) | 0 | null | 0, 0, 0, 0, 0 |

**Scenario: optional question**
- **Given** 4 responses, of which 2 answered an optional single-choice question (counts 1 and 1)
- **When** the summary is built
- **Then** `totalResponses` is 4, the question's `answered` is 2 and each percentage is 50.0

### AC-F04-02 — Owner views the summary of their own published or closed survey (FR-04)

**Scenario: summary with stored responses**
- **Given** owner1's published survey S-PUB has 3 responses: Q1 "About right", "About right", "Too heavy"; Q2 ratings 4, 5, 5
- **When** owner1 sends `GET /api/v1/surveys/{S-PUB}/summary`
- **Then** the response is `200` with `totalResponses` 3, `suppressed` false
- **And** Q1 shows "Too light" 0 (0.0), "About right" 2 (66.7), "Too heavy" 1 (33.3)
- **And** Q2 shows `answered` 3, `mean` 4.67 and distribution 0, 0, 0, 1, 2
- **And** the body contains no respondent id or name
- **When** owner1 closes S-PUB and requests the summary again
- **Then** the response is `200` with the same values

**Scenario: no responses yet**
- **Given** owner1 has a published survey with no responses
- **When** owner1 opens its summary page
- **Then** the page shows "Total responses: 0" and "No responses yet."

**Scenario: draft has no summary**
- **Given** owner1's draft S-DRAFT
- **When** owner1 sends `GET /api/v1/surveys/{S-DRAFT}/summary`
- **Then** the response is `409 SURVEY_NOT_PUBLISHED`

**Scenario: summary in the UI**
- **Given** the 3 responses above
- **When** owner1 opens `/my-surveys/{S-PUB}/summary`
- **Then** the page shows "Total responses: 3", "About right — 2 (66.7%)" and "Average 4.67 from 3 answers"

### AC-F04-03 — An owner cannot see another owner's results (BR-05)

**Scenario: other owner's summary**
- **Given** owner1's survey S-PUB has responses and owner2 is logged in
- **When** owner2 sends `GET /api/v1/surveys/{S-PUB}/summary`
- **Then** the response is `404 NOT_FOUND`
- **And** the body contains no title, counts or question text of S-PUB
- **And** the body equals the response for a random non-existent UUID apart from `requestId`

### AC-F04-04 — Respondents and administrators never see aggregate results (BR-07, BR-08)

**Scenario Outline: wrong role**
- **Given** S-PUB has responses, including one from resp1
- **When** `<user>` sends `GET /api/v1/surveys/{S-PUB}/summary`
- **Then** the response is `403 FORBIDDEN` with no summary data

| user |
|---|
| resp1 (has answered S-PUB) |
| resp3 (has not answered) |
| admin1 |

---

## 7. Software Test Specification

| Test ID | AC | Level | Preconditions / input | Action | Expected result | Planned file |
|---|---|---|---|---|---|---|
| TEST-F04-01 | AC-F04-01 | Unit | `buildSummary` with the counts and ratings of each Examples row and the optional-question case | Call `buildSummary` | Percentages, means, `answered` and distributions exactly as in the tables; `null` where stated; options and questions in position order | `tests/unit/summaryMath.test.ts` |
| TEST-F04-02 | AC-F04-02 | API + E2E | Fixture S-PUB with 3 responses created through the submit API by resp1, resp2, resp3; a published survey with 0 responses; S-DRAFT | API: owner1 requests the summary; closes S-PUB; requests again; requests the empty survey and the draft. E2E: owner1 opens the summary page (demo seed with the same 3 responses) and the empty survey's page | API: values as in the AC, identical before and after close; serialized body contains no respondent id or display name; empty survey `200` with zeros and `null`s; draft `409 SURVEY_NOT_PUBLISHED`. E2E: the three texts of the AC visible; empty-state text visible | `tests/integration/summary.test.ts` › "summary values", "empty", "draft"; `tests/e2e/owner-summary.spec.ts` |
| TEST-F04-03 | AC-F04-03 | API | Fixture S-PUB with responses; owner2 logged in | owner2 requests S-PUB's summary and a random UUID's summary | Both `404`; bodies equal apart from `requestId`; neither contains S-PUB's title or question text | `tests/integration/summary.test.ts` › "other owner" |
| TEST-F04-04 | AC-F04-04 | API | Fixture S-PUB with a response from resp1; resp3 and admin1 exist | resp1, resp3 and admin1 request the summary | Each `403 FORBIDDEN`; body has no `data` key | `tests/integration/summary.test.ts` › "wrong role" |

Related NFR tests: TEST-NFR-01 (summary p95 with 1,000 responses), TEST-NFR-04 (summary screen), TEST-NFR-05 (summary route).

---

## 8. Feature Definition of Done

The Product Definition of Done items D-1 to D-10 (`definition-of-done.md`) apply. In addition, F-04 is done when:

- TEST-F04-01 to TEST-F04-04 pass on the PR head commit.
- The summary endpoint's p95 in TEST-NFR-01 is under 300 ms on the benchmark data set, with the machine recorded.
- The reviewer has checked in the PR that aggregates are computed in SQL (no query loads all answers), and that the summary query is scoped by `ownerId`.
