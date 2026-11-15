# Software Requirements Specification (SRS)

**Product:** Survey and Feedback System (Theme 10: Review, Feedback, and Survey System)
**Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents, Semester 1/2026
**File:** `docs/srs.md` | **Version:** 1.0 (approved baseline) | **Date:** 12 November 2026

| Role | Name | Student ID |
|---|---|---|
| Author 1 | Muhammad Asad Aziz | 67070503472 |
| Author 2 | Al Xander James Codino Ybanez | 67070503450 |

**Repository:** https://github.com/Muhammad-Asad-Aziz/CPE334-GuessLess

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-05 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Initial baseline draft |
| 0.2 | 2026-11-06 | Al Xander James Codino Ybanez (Author 2) | FR-07 and FR-09 clarified; D-09 and BR-10 aligned with the System-Level SDS (the participation record stores only the day) |
| 0.3 | 2026-11-07 | Muhammad Asad Aziz (Author 1, AI-assisted review) | Drafts may be saved incomplete and BR-04 is checked at publication (FR-01, FR-02, BR-04, Section 6, D-15); `DRAFT` -> `CLOSED` and other invalid transitions stated explicitly (BR-04, FR-11); server-owned body fields are rejected (BR-08); calendar days use Asia/Bangkok (BR-10, A-05, D-14); close date editable only while the survey is open (FR-14, BR-03, D-16); eligibility editable while open (FR-15, D-18); FR-09 lists own responses, including closed surveys; FR-04 rounding and draft behavior defined; new BR-14 (anonymous results after close, D-17), NFR-11 (login throttling) and NFR-12 (accessibility); FR-21 no longer optional (D-13); NFR-01, NFR-02 and NFR-09 targets refined; Q-08 and Q-09 added. Logged as CHG-03 to CHG-13 in `docs/traceability.md` |
| 1.0 | 2026-11-12 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Partner review complete; all design decisions (D-01 to D-18) and questions (Q-01 to Q-09) resolved; choice-question 0-answer percentage and non-whitespace rules clarified; baseline approved for Sprint 1 |

---

## 1. Introduction

### 1.1 Purpose

This document defines **what** the Survey and Feedback System must do. It is the requirements baseline for the whole product across Sprints 1-3: actors, scope, Functional Requirements (FR), Business Rules (BR), Non-Functional Requirements (NFR), assumptions, decisions and questions. How the product is built is described in `docs/system-sds.md`; the feature list and the requirement-to-feature-to-sprint mapping are in `docs/features.md` and `docs/traceability.md`.

Requirement IDs are stable. They are never renumbered or reused. A removed or changed requirement is recorded in the revision history with its reason.

### 1.2 Stakeholder problem and context

**Problem.** In a university department, course evaluations and activity feedback are often collected with generic online forms or chat polls. These tools cannot reliably restrict who may answer, they allow the same person to answer many times, they let the owner change questions after answers have arrived, and they make no verifiable promise about whether answers are anonymous. Survey owners cannot trust the numbers, and respondents cannot trust the privacy claims.

**Chosen context.** A web application for a single institution (a university department running end-of-course evaluations and activity feedback). Survey Owners (lecturers and staff) create and publish surveys. Logged-in Respondents (students) answer each survey at most once. Owners read aggregate results. A survey is either *identified* (answers are linked to the respondent) or *anonymous* (answers are stored with no link to the respondent). The privacy design of anonymous mode is a first-class requirement (FR-17, BR-10, BR-11, BR-14).

### 1.3 Product scope

The product shall:

- authenticate users with seeded accounts and enforce role and record-ownership permissions on the server;
- let Survey Owners build, publish and close surveys using a defined set of question types;
- let eligible Respondents submit one validated response per survey;
- show results to the owner as aggregate summaries and, where the response mode allows, individual responses and exports;
- protect anonymous responses by design, not by labelling;
- keep all data in a persistent database that survives application restart and redeployment.

### 1.4 Sprint 1 slice

Sprint 1 delivers FR-01 to FR-11, BR-01 to BR-08 and the NFRs established in Sprint 1 (Section 5). The Sprint 1 journey is:

1. A Survey Owner logs in, creates a small identified survey (single-choice and rating questions) and publishes it.
2. A Respondent logs in, sees the survey, submits a validated response and retrieves their saved submission from their list of own responses.
3. The Survey Owner views the aggregate summary and closes the survey.
4. Duplicate submissions, submissions to draft or closed surveys, publishing an incomplete draft, invalid lifecycle transitions, unauthenticated requests, wrong-role operations and access to another user's record are rejected.

### 1.5 Exclusions

**Excluded from the whole product**

- Sending email, SMS or any other invitation, reminder or notification (no invitation blasts). Respondents find surveys inside the application after logging in (FR-08).
- External single sign-on or identity providers (Google or Microsoft SSO, LDAP, OAuth). All authentication is local to the application.
- Self-registration, password recovery, email verification and multiple roles per account. Accounts are created by a seed procedure.
- Question branching or skip logic, file-upload answers, survey template libraries, multi-language survey content management, native mobile apps, multiple organizations (multi-tenancy), advanced statistics (significance tests, text mining) and real-time collaborative editing.

**Deferred beyond Sprint 1 (still part of the product baseline)**

- FR-12 to FR-21, BR-09 to BR-14, NFR-11 and the final verification of NFR-12 (see the sprint columns in Sections 3 to 5).

### 1.6 Definitions

| Term | Meaning |
|---|---|
| Survey | A titled set of ordered questions owned by one Survey Owner, with a status and a response mode. |
| Status | `DRAFT` (being built; may be incomplete), `PUBLISHED` (open for responses), `CLOSED` (no longer accepting responses). |
| Effective status | The status a survey has at a given moment: `CLOSED` if its stored status is `CLOSED` or its close date has been reached; otherwise its stored status. Every rule, list and screen uses the effective status (FR-14). |
| Response mode | `IDENTIFIED` (answers linked to the respondent) or `ANONYMOUS` (answers stored without any link to the respondent). |
| Response | One complete set of answers submitted by one Respondent to one survey. |
| Participation record | A record that a Respondent has submitted to a survey. It holds no answers. It exists so that BR-01 can be enforced in anonymous mode and so that a Respondent can list their own submissions (FR-09). |
| Open survey | A survey whose effective status is `PUBLISHED`: it has been published and its close date, if any, has not been reached. |
| Eligible respondent | An active Respondent account that is allowed to answer a given survey (all active Respondents in Sprint 1; see FR-15 and BR-09). |
| Calendar day | A date in the Asia/Bangkok time zone (UTC+7, no daylight saving) (D-14). |

---

## 2. Actors and responsibilities

| Actor | Who | Responsibilities | Not allowed | Sprint |
|---|---|---|---|---|
| Survey Owner | Lecturer or staff member | Create, edit (draft), publish and close own surveys; view aggregate results of own surveys; later: set eligibility, view individual responses, filter, export | Respond to surveys; see or change another owner's surveys; manage accounts | 1 |
| Respondent | Student | Log in; browse surveys they may answer; submit one response per survey; list and view own submissions | Create or edit surveys; view aggregate results; view anyone else's response | 1 |
| System Administrator | IT or department staff | Enable and disable user accounts | View or change any survey, response or result | 3 |
| Unauthenticated visitor | Anyone without a valid token | Reach the login screen and the public health check only | Access any survey, response or result | 1 |

Each account has exactly one role (BR-08). Accounts are created by the seed procedure. The Sprint 1 seed contains at least two Survey Owners and three Respondents so that cross-owner and cross-respondent access can be tested, and one System Administrator account that is used from Sprint 3.

---

## 3. Functional Requirements

| ID | Requirement | Observable behavior | Actor | Sprint |
|---|---|---|---|---|
| FR-01 | Create Survey | A logged-in Survey Owner can create a survey in `DRAFT` status with a title, description, response mode and up to 30 ordered questions (type, text, required flag, and options for choice questions). A draft may be incomplete: its title may be empty, it may have no questions yet, and a choice question may have fewer than 2 options. The upper limits in Section 6 always apply. The saved survey belongs to the creating owner and can be retrieved afterwards. Sprint 1 supports `IDENTIFIED` mode and single-choice and rating questions only; a request for `ANONYMOUS` mode or another question type is rejected as invalid. | Survey Owner | 1 |
| FR-02 | Publish Survey | A Survey Owner can publish their own `DRAFT` survey if it passes the publish checks in BR-04. The status becomes `PUBLISHED`, the publish time is recorded, and the survey appears in the available-surveys list of eligible Respondents. A survey that fails the checks stays `DRAFT` and unchanged, and the owner is told every check that failed. | Survey Owner | 1 |
| FR-03 | Submit Response | A logged-in eligible Respondent can submit answers to an open survey. The system validates the answers (BR-06), stores the response in one transaction and shows a confirmation. Before submitting, the respondent is shown the survey's response mode (identified or anonymous). | Respondent | 1 |
| FR-04 | View Aggregate Summary | A Survey Owner can view the aggregate summary of their own `PUBLISHED` or `CLOSED` survey: total responses; for each single-choice question the count and percentage per option; for each rating question the number of answers, the mean and the distribution over 1-5. Percentages are of the respondents who answered that question, rounded to 1 decimal place (0.0 when nobody answered that question); the mean is rounded to 2 decimal places and is empty (null) when nobody answered the question. When nobody answered a choice question, each option's percentage is 0.0. The summary counts only stored responses. A `DRAFT` survey has no summary, and a request for one is rejected. Respondents cannot access any summary. For `ANONYMOUS` surveys (Sprint 2) BR-11 and BR-14 limit what is shown. | Survey Owner | 1 |
| FR-05 | Login | A user with a seeded account can log in with email and password and receives an authentication token (JWT) with an expiry time. Wrong credentials are rejected with one generic message that does not reveal whether the email exists. | All | 1 |
| FR-06 | Logout | A logged-in user can log out. The token used is revoked, and any later request with that token is rejected as unauthenticated. | All | 1 |
| FR-07 | Current User Identity | The system identifies the current user from the verified token and returns their id, display name and role (the role and the account status are read from the database). The UI shows who is logged in. Identity and role are never taken from client-supplied fields (BR-08). | All | 1 |
| FR-08 | Browse Available Surveys | A Respondent can list the open surveys they are eligible for, each with an indicator of whether they have already responded. `DRAFT`, `CLOSED` (including surveys whose close date has been reached) and ineligible surveys are not listed. | Respondent | 1 |
| FR-09 | View Own Submissions | A Respondent can list the surveys they have responded to, including surveys that have since closed, with each survey's title, effective status and the day they participated. From the list they can open their own submitted response to an `IDENTIFIED` survey, showing their answers and submission time. For an `ANONYMOUS` survey the answers are not linked to the respondent (BR-10), so the Respondent can see only that they participated and on which day. A request for another respondent's response is rejected. | Respondent | 1 |
| FR-10 | List My Surveys | A Survey Owner can list their own surveys with title, effective status, response count, creation date, publish date and close date (if any). Surveys of other owners are never listed. | Survey Owner | 1 |
| FR-11 | Close Survey | A Survey Owner can close their own open survey. After closing, no new responses are accepted; existing responses and results remain available. Closing a `DRAFT` survey, or a survey that is already closed (by the owner or by reaching its close date), is rejected and the survey is unchanged (BR-04). | Survey Owner | 1 |
| FR-12 | Edit Draft Survey | A Survey Owner can change the title, description, response mode, close date, eligibility and questions of their own `DRAFT` survey; the draft may stay incomplete until it is published (FR-01). After publication only the title and description can be changed, plus the close date (FR-14) and eligibility (FR-15) while the survey is open (BR-03). | Survey Owner | 2 |
| FR-13 | Delete Draft Survey | A Survey Owner can delete their own `DRAFT` survey. `PUBLISHED` and `CLOSED` surveys cannot be deleted (BR-12). | Survey Owner | 2 |
| FR-14 | Scheduled Close Date | A Survey Owner can set an optional close date and time. From that time the survey accepts no responses and is shown as `CLOSED`, without any owner action. The close date must be in the future when it is set or changed, and it can be set, changed or removed only while the survey is a `DRAFT` or still open. Once a survey is closed, by the owner or by reaching its close date, its close date can no longer be changed, so a closed survey is never reopened (BR-04). | Survey Owner | 2 |
| FR-15 | Manage Survey Eligibility | A Survey Owner can set a survey's eligibility to all Respondents or to a selected list of active Respondent accounts. Only listed Respondents see the survey and can submit (BR-09). A selected list must contain at least one Respondent. Eligibility can be changed while the survey is a `DRAFT` or still open; a change affects only who can see and answer the survey from then on. Existing responses are kept and counted (BR-12), and a Respondent who has already responded can still view their own submission (FR-09). | Survey Owner | 2 |
| FR-16 | Additional Question Types | Surveys can include multiple-choice (select one or more options) and free-text questions (up to 1,000 characters). The summary shows per-option counts and percentages for multiple-choice (which can add up to more than 100%) and, for free-text, the number of answers and the answer texts without respondent identity. | Survey Owner, Respondent | 2 |
| FR-17 | Anonymous Response Mode | A Survey Owner can create a survey in `ANONYMOUS` mode. The system stores answers with no link to the respondent and records separately only that the respondent participated. Respondents are told the survey is anonymous. No screen, API response or export returns respondent identity for an anonymous survey (BR-10). Results of an anonymous survey are released only after it closes (BR-14). | Survey Owner, Respondent | 2 |
| FR-18 | View Individual Responses | A Survey Owner can list and open the individual responses of their own `IDENTIFIED` survey, with the respondent's display name and submission time. The function is not available for `ANONYMOUS` surveys. | Survey Owner | 3 |
| FR-19 | Filtered Analysis | A Survey Owner can filter the aggregate summary by a range of calendar days (inclusive) and see the number of responses per day. For `ANONYMOUS` surveys the filtered view shows only the total and per-day response counts, never per-question results (BR-14), and BR-11 applies. | Survey Owner | 3 |
| FR-20 | Export Results | A Survey Owner can download the results of their own survey as CSV: the aggregate summary for any survey, and individual responses with respondent identity for `IDENTIFIED` surveys only. Anonymous exports contain no identity and follow BR-11 and BR-14. | Survey Owner | 3 |
| FR-21 | Manage User Accounts | A System Administrator can list user accounts and enable or disable them. A disabled account cannot log in and its tokens are rejected (BR-13). The administrator cannot disable their own account and cannot view any survey, response or result. | System Administrator | 3 |

---

## 4. Business Rules

| ID | Rule | Observable outcome when the rule applies | Sprint |
|---|---|---|---|
| BR-01 | A Respondent can submit at most one response per survey, in both response modes. | A second submission by the same Respondent to the same survey, including simultaneous requests, is rejected. Exactly one response (and one participation record) is stored. | 1 |
| BR-02 | Only open surveys accept responses. | A submission to a `DRAFT` or `CLOSED` survey, or at or after the close date, is rejected and nothing is stored. `DRAFT` surveys are not visible to Respondents. | 1 |
| BR-03 | Survey questions are immutable once the survey is published. | After publication, any attempt to add, remove, reorder or change questions, options, question types, required flags or the response mode is rejected and the survey is unchanged. The title and description remain editable; the close date (FR-14) and eligibility (FR-15) remain editable only while the survey is open. | 1 |
| BR-04 | A survey follows one lifecycle: `DRAFT` -> `PUBLISHED` -> `CLOSED`. | Publishing is rejected, and the survey stays `DRAFT` and unchanged, if the title is empty or only spaces, there are no questions, a choice question has fewer than 2 options, or (from Sprint 2) the close date has already passed. The only allowed transitions are `DRAFT` -> `PUBLISHED` (publish) and `PUBLISHED` -> `CLOSED` (close, or reaching the close date). Every other transition is rejected and the survey is unchanged: a `PUBLISHED` survey cannot return to `DRAFT`, a `DRAFT` survey cannot be closed, a published survey cannot be published again, and a `CLOSED` survey cannot be reopened or closed again. Only the owner can change the status. | 1 |
| BR-05 | A Survey Owner can act only on their own surveys. | Reading, changing, publishing, closing or viewing results of another owner's survey is rejected and returns none of its data. | 1 |
| BR-06 | A response is accepted only if it is completely valid. | The whole submission is rejected and nothing is stored if: a required question is unanswered; an answer does not belong to a question of this survey; a chosen option is not one of that question's options; a rating is outside 1-5; a question is answered twice; a single-choice question has more than one answer; or a text answer exceeds the length limit. | 1 |
| BR-07 | A Respondent can read only their own response and never aggregate results. | A request for another Respondent's response, or for any aggregate summary, is rejected and returns no data. | 1 |
| BR-08 | Each account has exactly one role, and the role decides what the account can do. | Only Respondents can submit responses. Only Survey Owners can create and manage surveys. Administrators have no access to surveys or responses. A role or user id sent by the client is never trusted: a request body that contains a server-owned field (such as `role`, `userId`, `ownerId`, `status` or `submittedAt`) is rejected as invalid and nothing is changed, and identity values in headers or query strings are ignored. A backend schema validator (e.g., Zod .strict()) rejects unknown/server-owned fields with 400 Bad Request. | 1 |
| BR-09 | When a survey's eligibility is "selected respondents", only the listed Respondents can see and answer it. | A Respondent not on the list does not see the survey, and a direct submission is rejected. | 2 |
| BR-10 | Anonymous responses carry no identity. | For an `ANONYMOUS` survey the stored answers contain no respondent identifier or reference, and the answer submission time is stored as a calendar day only (D-14). The participation record contains no answers and stores only the day of participation. An identified survey is never shown or described as anonymous. | 2 |
| BR-11 | Small groups are not reported in anonymous surveys. | For an `ANONYMOUS` survey with fewer than 5 responses, the summary, filtered view and exports show only the total number of responses. Per-question results, per-day counts and free-text answers are withheld. The threshold of 5 is a configuration value. | 2 |
| BR-12 | Published data is retained. | Only `DRAFT` surveys can be deleted. `PUBLISHED` and `CLOSED` surveys and their responses cannot be deleted by any user, and closing a survey or changing its eligibility never alters existing responses. | 2 |
| BR-13 | Disabled accounts have no access. | A disabled account cannot log in, and a token issued before the account was disabled is rejected. | 3 |
| BR-14 | Anonymous results are released only after the survey closes. | For an `ANONYMOUS` survey that is still open, the summary and export show only the total number of responses. Per-question results become available once the survey is `CLOSED` and BR-11 is met. A date-range filter on an `ANONYMOUS` survey shows only the total and per-day response counts, never per-question results. This prevents an owner from isolating one person's answers by comparing results over time or across date ranges. | 2 |

---

## 5. Non-Functional Requirements

"Sprint" shows where the requirement is established and where its final verification is planned.

| ID | Requirement | Measurable target | Verification method | Sprint |
|---|---|---|---|---|
| NFR-01 | Response latency | The 95th-percentile server-side response time is under 300 ms for: list available surveys, submit response, view own submission, aggregate summary. Measured with one survey of 10 questions and 1,000 stored responses, 50 requests per endpoint, warm server; the 50 submissions come from 50 Respondents who have not yet answered. Login is excluded because password hashing is deliberately slow (NFR-02). | Automated timing test on a separate benchmark data set (System-Level SDS Section 11) that records the p95 and fails above 300 ms. Machine specification and result recorded in the traceability matrix. | Establish 1, re-measure on GCP in 3 |
| NFR-02 | Password protection | Passwords are stored only as salted bcrypt (cost 10 or higher) or Argon2id hashes. There are 0 plaintext passwords in the database, logs or API responses. The automated test profile may use a lower cost; outside that profile the application refuses to start with a cost below 10. | Integration test reads the stored value of every seeded user and checks the hash format; start-up configuration test shows that a cost below 10 is refused outside the test profile; test that logs and login responses do not contain the password; valid and invalid login tests. | 1 |
| NFR-03 | Token authentication (JWT) | Every endpoint except login and the health check requires a valid, unexpired, unrevoked JWT. Tokens are signed with a server-side secret and expire within 60 minutes. 100% of protected endpoints answer 401 and return no private data for a missing, tampered, expired or logged-out token. | API tests run over every protected route with each token condition, including a request after logout. | 1 |
| NFR-04 | Responsive UI | The main journeys (login, browse, submit, create and publish, summary) have no horizontal page scrolling and no clipped or overlapping controls at viewport widths of 360, 768 and 1280 px. | Automated end-to-end checks at the three widths (page width not larger than viewport) plus screenshots for the evidence PDF. | 1 (Sprint 1 screens), re-verify in 3 |
| NFR-05 | Server-side authorization | Every protected operation checks role and record ownership on the server using the identity in the token. User ids, roles or ownership values in request bodies, URLs or headers never grant access. 100% of protected endpoints have tests for unauthenticated, wrong-role and other-user's-record cases, each returning 401, 403 or 404 with no private data. | API integration test matrix derived from the role and permission matrix in the System-Level SDS. | Establish 1, extend each sprint |
| NFR-06 | Concurrency safety | Under simultaneous submissions BR-01 still holds: 20 parallel submissions by one Respondent to one survey store exactly 1 response and reject the other 19. | Integration test against the real database using parallel requests. | 1 |
| NFR-07 | Data durability | Surveys, responses and accounts are stored in a relational database, not in memory or on the container file system. After an application restart, 100% of data created before the restart is retrievable. | Local restart test in Sprint 1; restart and redeployment check on GCP in Lab 5 and the final release. | Establish 1, verify on GCP |
| NFR-08 | Safe error handling | Invalid, malformed or unauthorized requests return a structured 4xx error with a stable error code and message. 0 responses contain stack traces, SQL, file paths, password hashes or another user's data. Unexpected failures return a generic 5xx message. | API negative tests assert the error shape and the absence of sensitive markers. | 1 |
| NFR-09 | Secret handling | No real secret (JWT signing key, database password, token) is in Git or in submitted documents. Configuration comes from environment variables, and `.env.example` holds placeholders only. 0 findings from a secret scan of the repository history at each release. The application refuses to start without a JWT signing key of at least 32 characters. | Secret-scanning tool run on the repository; start-up configuration test. | 1 |
| NFR-10 | Reproducible setup | A clean checkout can be built, migrated, seeded and tested by following the README. The README needs no more than 6 commands to reach a running application with seeded accounts for each role and a passing required test suite. | Follow the README on a clean environment and record the commands and output. | 1 |
| NFR-11 | Login throttling | After 10 failed login attempts from one client IP address within 1 minute, further login attempts from that address receive HTTP 429 with a generic message until the minute has passed; other addresses are unaffected. The response never reveals whether the email exists. | API test sends 11 failed logins and asserts that the 11th returns 429 and that a valid login succeeds after the window (the window is shortened through configuration in the test profile). | 3 |
| NFR-12 | Accessibility basics | On the main journeys (login, browse, submit, create and publish, summary) every form control has a visible label, the journey can be completed with the keyboard only, and an automated accessibility scan reports 0 violations of impact "serious" or "critical". | Automated end-to-end accessibility scan (axe-core) on each main screen plus one keyboard-only end-to-end journey (login and submit). | Built from 1, verified in 3 |

---

## 6. Domain constraints (default limits)

These limits are validated on the server (BR-04, BR-06, FR-01, FR-14, FR-15, FR-16) and are checked by boundary tests. A draft may be saved incomplete (D-15); the stricter limits apply when the survey is published.

**Survey content**

| Item | To save a draft (create or edit) | To publish |
|---|---|---|
| Survey title | 0-120 characters (an empty title is shown as "Untitled survey") | 1-120 characters, not only spaces |
| Survey description | 0-1,000 characters | 0-1,000 characters |
| Questions per survey | 0-30 | 1-30 |
| Question text | 1-300 characters, not only spaces | 1-300 characters, not only spaces |
| Options per choice question | 0-10, each 1-100 characters (not only spaces) | 2-10, each 1-100 characters (not only spaces) |
| Close date (Sprint 2) | Optional; in the future when set | Optional; still in the future at publication |
| Eligibility (Sprint 2) | `ALL`, or `SELECTED` with 1 or more active Respondent accounts | Same |

**Other limits**

| Item | Limit |
|---|---|
| Rating scale | Integer 1-5 |
| Multiple-choice answer (Sprint 2) | 1 or more distinct options of that question when answered |
| Free-text answer (Sprint 2) | 0-1,000 characters; a required free-text answer needs at least one non-space character |
| Anonymous small-group threshold (BR-11) | 5 responses (configurable) |
| Token lifetime (NFR-03) | At most 60 minutes |
| Login throttling (NFR-11) | 10 failed attempts per client IP address per minute |
| Calendar day | Asia/Bangkok (UTC+7) (D-14) |

---

## 7. Assumptions

| ID | Assumption |
|---|---|
| A-01 | The product serves one institution. There is no multi-tenancy. |
| A-02 | Accounts are created by a seed script. Seeded passwords are synthetic and are shared through the private course handoff, never committed to Git. |
| A-03 | The scale used for NFR targets is at most 100 surveys, 1,000 responses per survey and 50 concurrent users. |
| A-04 | Users use the current or previous major version of Chrome, Edge, Firefox or Safari, at viewport widths of 360-1440 px. |
| A-05 | The server clock is authoritative. Timestamps are stored in UTC and shown in Asia/Bangkok time (UTC+7). Calendar days, such as the day of participation and per-day counts, are Asia/Bangkok days (D-14). |
| A-06 | All data is synthetic. No real student data is stored. |
| A-07 | The user interface is in English. Text content is stored as UTF-8, so Thai survey text is supported. |

---

## 8. Design and scope decisions

Status: **Resolved** = fixed by the course specification or agreed by both authors; **Proposed** = drafted by Author 1, to be confirmed by Author 2.

| ID | Decision | Rationale | Status |
|---|---|---|---|
| D-01 | Context is university course and activity feedback. | Gives clear roles (lecturer, student), a real need for eligibility, and a real reason for anonymity. | Resolved |
| D-02 | Accounts are seeded only. No self-registration or password recovery. | Course specification, Section 5.2. | Resolved |
| D-03 | In Sprint 1 every active Respondent is eligible. Selected-respondent lists arrive in Sprint 2 (FR-15). | Keeps the Sprint 1 slice small while still testing roles and ownership. | Resolved |
| D-04 | Sprint 1 question types are single-choice and rating (1-5). Multiple-choice and free-text arrive in Sprint 2 (FR-16). | Both Sprint 1 types give simple, exact aggregates. | Resolved |
| D-05 | The response mode is chosen at creation and fixed from publication. Sprint 1 supports identified mode only. Anonymous mode is Sprint 2. | Anonymous mode needs a separate data design (D-09). Sequencing reduces Sprint 1 risk; scheduling it in Sprint 2 keeps the risky work early. | Resolved |
| D-06 | In an identified survey the owner may view individual answers with respondent identity (FR-18), and respondents are told this before submitting (FR-03). | This is what "identified" means. Telling respondents in advance keeps it honest. | Resolved |
| D-07 | Lifecycle is `DRAFT` -> `PUBLISHED` -> `CLOSED`. `CLOSED` is final: no unpublish and no reopen. | Protects result integrity and avoids mixing answers collected under different question sets. | Resolved |
| D-08 | Authentication uses JWT bearer tokens that expire within 60 minutes. Logout revokes the token on the server until it expires. | A stateless token cannot be logged out by itself, so server-side revocation is needed to satisfy FR-06 and NFR-03. | Resolved |
| D-09 | Anonymity is achieved by separation: a participation record (survey, respondent, day) is stored apart from the answer data, with no reference between them; answer and participation times are kept at day precision; small groups are suppressed and results are released only after the survey closes (BR-10, BR-11, BR-14). Details are in the System-Level SDS. | A label alone proves nothing. Separation can be inspected in the schema and verified by tests. | Resolved |
| D-10 | BR-01 is enforced by a database uniqueness constraint as well as an application check. | A check in code alone fails under simultaneous requests (NFR-06). | Resolved |
| D-11 | After publication the owner may still edit the title and description, and the close date and eligibility while the survey is open, but not the questions (BR-03). | Fixing a typo, extending a deadline or adding a missed student should not require a new survey, but changing questions would invalidate collected answers. A closed survey stays closed (D-16). | Resolved |
| D-12 | Survey Owners cannot answer surveys, including their own (BR-08). | One role per account; avoids owner bias and extra permission cases. | Resolved |
| D-13 | The System Administrator is limited to enabling and disabling accounts (FR-21) and is scheduled for Sprint 3. It is part of the baseline; dropping it would need an approved scope change. | The course specification requires two roles in Sprint 1, not administration. The feature is small because every request already checks the account status, and the administrator must not see survey data. | Resolved |
| D-14 | Calendar days (participation day, anonymous answer day, per-day counts, date-range filters) are Asia/Bangkok days (UTC+7, no daylight saving). | The institution is in Thailand. UTC days would put submissions made between 00:00 and 07:00 local time on the previous day. | Resolved |
| D-15 | A draft may be saved incomplete; the publish checks of BR-04 run only at publication. In Sprint 1 an incomplete draft stays a draft until it can be edited (FR-12, Sprint 2). | Matches how owners build surveys and makes every publish check reachable and testable through the API. | Resolved |
| D-16 | The close date can be set, changed or removed only while the survey is a draft or open, and it must be in the future. A closed survey is never reopened. | Without this rule, moving a passed close date later would reopen a closed survey and contradict D-07. | Resolved |
| D-17 | Results of an anonymous survey are released only after it closes, and date-range filters never show its per-question results (BR-14). | Comparing live results over time, or results over two date ranges, could isolate one person's answers even when each result has 5 or more responses. End-of-course evaluations are normally read after they close. | Resolved |
| D-18 | Eligibility can be changed while the survey is a draft or open. A change affects only future visibility and submissions; existing responses are kept. | Owners may need to add a missed student; removing access must not delete or hide data already collected (BR-12). | Resolved |

---

## 9. Questions and resolution

Status: **Resolved** = answered; **Proposed** = answer drafted, to be confirmed by Author 2; **Open (TA)** = to be confirmed with the instructor or TA.

| ID | Question | Answer or proposed resolution | Status |
|---|---|---|---|
| Q-01 | May the owner see who answered an identified survey? | Yes, with advance notice to respondents (D-06). | Resolved |
| Q-02 | Is it acceptable to schedule anonymous mode in Sprint 2? The specification lists it among later-sprint items. | Yes. It is planned for Sprint 2 (D-05). | Resolved |
| Q-03 | What is the minimum number of responses before anonymous results are shown? | 5, configurable (BR-11). | Resolved |
| Q-04 | Is the System Administrator role required? | Not in Sprint 1. It is part of the baseline, limited to enabling and disabling accounts, and planned for Sprint 3 (D-13). | Resolved |
| Q-05 | How do respondents find a survey without email invitations? | Through the available-surveys list after login (FR-08). Email is excluded (Section 1.5). | Resolved |
| Q-06 | What happens to existing responses when eligibility changes or an account is disabled? | Existing responses are kept (BR-12), and a respondent removed from the list can still view their own submission (FR-09, D-18). A disabled account cannot log in or submit (BR-13). | Resolved |
| Q-07 | May respondents see results after a survey closes? | No. They see only their own submission (BR-07). | Resolved |
| Q-08 | May the owner see the results of an anonymous survey while it is still open? | No. Only the total number of responses; per-question results are released after the survey closes (BR-14, D-17). | Resolved |
| Q-09 | Which time zone defines a "day" for participation records, per-day counts and date filters? | Asia/Bangkok (UTC+7) (D-14). | Resolved |

---

## 10. Related documents

| Document | Purpose |
|---|---|
| `docs/features.md` | Feature inventory with IDs, system responsibilities, dependencies and planned sprints |
| `docs/traceability.md` | Requirement -> feature -> sprint -> acceptance criteria or NFR verification -> test, with status and the baseline change log |
| `docs/system-sds.md` | Architecture, data model, API and UI conventions, role and permission matrix, authentication, configuration and deployment |
| `docs/sprints/plan.md` | Goals, features, dependencies and outcomes for the three sprints |
| `docs/sprints/sprint-1/` | Sprint 1 feature contracts, acceptance criteria, test specification |
