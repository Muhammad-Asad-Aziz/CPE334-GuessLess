# System-Level Software Design Specification (SDS)

**Product:** Survey and Feedback System (Theme 10: Review, Feedback, and Survey System)
**Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents, Semester 1/2026
**File:** `docs/system-sds.md` | **Version:** 1.0 (approved baseline) | **Date:** 12 November 2026
**Requirements baseline:** `docs/srs.md` v1.0

| Role | Name | Student ID |
|---|---|---|
| Author 1 | Muhammad Asad Aziz | 67070503472 |
| Author 2 | Al Xander James Codino Ybanez | 67070503450 |

**Repository:** https://github.com/Muhammad-Asad-Aziz/CPE334-GuessLess

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-06 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Initial system-level design |
| 0.2 | 2026-11-06 | Al Xander James Codino Ybanez (Author 2) | Corrected the reference for the no-refresh-token decision (DD-06); SRS follow-ups S-1 to S-3 applied in SRS v0.2 |
| 0.3 | 2026-11-07 | Muhammad Asad Aziz (Author 1, AI-assisted review) | Aligned with SRS v0.3: incomplete drafts and `publishChecks` (BR-04); effective status used everywhere and close date frozen after close; Asia/Bangkok calendar days; anonymous results only after close (BR-14) and Known limits corrected (`xmin`, logs); BR-03 database enforcement labelled partial; `GET /my-responses` and respondent routes; Sprint 2 screens; error codes `SURVEY_NOT_PUBLISHED` and `RATE_LIMITED`; `DB_PASSWORD`, `TEST_DATABASE_URL` and throttling variables; `BCRYPT_COST` start-up rule; NFR-01 benchmark data set; login throttling design (NFR-11); migrations as a Cloud Run Job; DD-12 to DD-18 |
| 1.0 | 2026-11-12 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Partner review complete; all technology stack choices (Section 2) and design decisions (DD-01 to DD-18, Section 12) resolved; aligned with `docs/srs.md` v1.0; approved as v1.0 baseline |
---

## 1. Introduction

### 1.1 Purpose

This document defines **how** the product is built at system level: architecture and stack, data model, API and UI conventions, roles and permissions, authentication, configuration and the planned Docker and GCP deployment. Requirement IDs (FR, BR, NFR) refer to `docs/srs.md`. Feature-level designs (endpoint-by-endpoint request and response shapes, screen behavior, acceptance criteria) are in the feature contracts under `docs/sprints/`.

The diagrams are written in Mermaid so that GitHub renders them. For the submission PDF they are exported as images.

### 1.2 Design principles

1. **The server is the authority.** Every business rule and permission is enforced on the server (NFR-05). UI checks only improve usability.
2. **Defence in depth.** Critical rules (BR-01, BR-10, rating range, one answer per question) are also enforced by database constraints, so a bug in application code cannot silently break them.
3. **Stateless application, durable database.** The application keeps no per-instance state. Accounts, surveys, responses and revoked tokens live in PostgreSQL, so restarts, redeployments and extra instances do not lose data (NFR-07).
4. **Least disclosure.** Responses, errors and logs never contain passwords, tokens, hashes or another user's data (NFR-08). Anonymous submissions are not logged with identifying details (Section 4.6).
5. **Reproducible.** Schema comes from migrations, data from a seed script, configuration from environment variables (NFR-09, NFR-10).

---

## 2. Technology stack

Status: **Resolved** = agreed and fixed by both authors.

| Layer | Choice | Reason | Status |
|---|---|---|---|
| Database | PostgreSQL 16 | Relational integrity, unique and check constraints, transactions, available as managed Cloud SQL | Resolved |
| ORM and migrations | Prisma (`schema.prisma`, `prisma migrate`) | Typed schema, versioned migrations, readable data model | Resolved |
| API style | REST over HTTPS, JSON, under `/api/v1` | Simple to test with HTTP tests; matches the course labs | Resolved |
| Backend | Node.js (current LTS, pinned in `.nvmrc` and the Dockerfile), TypeScript, Express | One language across the stack; works with Prisma | Resolved |
| Validation | Zod schemas in strict mode | One place for request shape and limits; unknown fields are rejected | Resolved |
| Security libraries | `bcrypt` (password hashing), `jsonwebtoken` (JWT), `helmet` (HTTP headers), `express-rate-limit` (login throttling, Sprint 3) | Satisfy NFR-02, NFR-03 and NFR-11 | Resolved |
| Logging | `pino` with redaction of `authorization` and password fields | Structured logs, safe by default (NFR-08) | Resolved |
| Frontend | React with TypeScript, Vite, React Router | Component UI, fast build; static output can be served by the API container | Resolved |
| Styling | Tailwind CSS, mobile-first | Quick responsive layout (NFR-04) | Resolved |
| Tests | Vitest (unit, integration), Supertest (HTTP), Playwright (end-to-end), `@axe-core/playwright` (accessibility scan), gitleaks (secret scan) | See Section 11 | Resolved |
| Container | Docker, multi-stage build, one image containing API and built UI | Matches the Lab 5 single-container option | Resolved |
| CI/CD | GitHub Actions | Course workflow | Resolved |
| Cloud | Google Cloud: Cloud Run, Cloud SQL (PostgreSQL), Artifact Registry, Secret Manager, Cloud Logging | Course platform | Resolved |
---

## 3. Architecture

### 3.1 Logical architecture

The product is a **modular monolith**: one deployable application with three logical layers (UI, API and application layer, database). Three layers do not need three servers.

```mermaid
flowchart LR
  subgraph Browser
    UI["React SPA (Vite, TypeScript)"]
  end
  subgraph Server["Application container (Node.js, Express)"]
    ST["Static files (built SPA)"]
    MW["Middleware: request id, JWT check, role check, validation"]
    SV["Services and domain rules"]
    DA["Prisma Client"]
  end
  DB[("PostgreSQL 16")]
  UI -. "GET / (HTML, JS, CSS)" .-> ST
  UI -- "HTTPS, JSON, Bearer token, /api/v1" --> MW
  MW --> SV
  SV --> DA
  DA -- "SQL" --> DB
```

| Component | Responsibility | Does not do |
|---|---|---|
| React SPA | Screens, navigation by role, form validation for usability, loading, empty and error states, holds the token and attaches it to API calls | Decide permissions or business rules |
| Express middleware | Request id, security headers, JWT verification, revoked-token and active-account check, role check (`requireRole`), Zod validation, central error handling | Business rules |
| Services and domain rules | All business rules (BR-01 to BR-14), ownership checks, transactions, aggregation, suppression of anonymous results (BR-11, BR-14) | HTTP concerns |
| Prisma Client | Typed database access, transactions | Business decisions |
| PostgreSQL | Durable storage; unique, foreign-key and check constraints as the last line of defence | Application logic |

**Communication.** The browser calls the API with JSON over HTTPS using `Authorization: Bearer <token>`. In production the SPA and the API share one origin, so no CORS is needed. In development the Vite dev server proxies `/api` to the API. The API talks to PostgreSQL through Prisma (TCP locally, the Cloud SQL connection on GCP).

### 3.2 Backend structure

```
server/
  src/
    app.ts              Express app: middleware chain, routes, static files
    config.ts           Reads and validates environment variables (Zod); exits on invalid config
    routes/             One file per resource: auth, surveys, availableSurveys, responses, myResponses, users, health
    middleware/         authenticate.ts, requireRole.ts, validate.ts, requestId.ts, errorHandler.ts
    services/           AuthService, SurveyService, ResponseService, SummaryService, UserService
    domain/             Pure functions and no database access: surveyLifecycle.ts (canTransition,
                        publishChecks), validateAnswers.ts, effectiveStatus.ts, suppression.ts,
                        calendarDay.ts, summaryMath.ts   (unit-tested)
    errors.ts           AppError subclasses mapped to the error format
    lib/prisma.ts       Prisma client instance
  prisma/
    schema.prisma
    migrations/
    seed.ts             Demo accounts and surveys (repeatable)
    seed-benchmark.ts   NFR-01 benchmark data set (test database only)
  tests/                unit/, integration/, e2e/
client/                 React SPA
docs/                   SRS, SDS, features, traceability, sprints, labs
Dockerfile
docker-compose.yml      Local PostgreSQL (and optional full stack)
.env.example
.github/workflows/      ci.yml, deploy.yml (Lab 5)
```

Request flow: route -> `authenticate` -> `requireRole` -> `validate` (Zod) -> service -> Prisma -> response. The domain functions are pure so that important rules can be unit-tested without a database.

### 3.3 Where each business rule is enforced

| Rule | Application enforcement | Database enforcement |
|---|---|---|
| BR-01 One response per respondent per survey | `ResponseService.submit` creates the participation record first inside a transaction. A unique-constraint error is mapped to 409 `DUPLICATE_RESPONSE` | Unique `(surveyId, respondentId)` on `Participation` and on `Response` |
| BR-02 Only open surveys accept responses | `effectiveStatus(survey, now)` is evaluated inside the submit transaction; `DRAFT` is invisible to respondents (404), an effectively closed survey gives 409 `SURVEY_NOT_OPEN`. Every list and query filters on the effective status (Section 4.5) | - |
| BR-03 Questions immutable after publication | `SurveyService.update` allows only title and description when status is not `DRAFT`, plus close date and eligibility while the survey is effectively open; question and mode changes are refused (409 `SURVEY_LOCKED`) | Partial only: the composite foreign key with `onUpdate: Restrict` stops the mode from changing once responses exist, and `onDelete: Restrict` from `Answer` stops answered questions from being deleted. Other question and option changes are blocked by the service only |
| BR-04 Lifecycle and publish checks | `canTransition(from, to)` and `publishChecks(survey, now)` in `domain/surveyLifecycle.ts`. Drafts may be saved incomplete (D-15); `publishChecks` returns every failed check. Transitions are decided on the effective status, so closing a survey whose close date has passed gives 409 `INVALID_STATE_TRANSITION` | Check constraints: `publishedAt` is set exactly when status is not `DRAFT`; `closedAt` is set exactly when status is `CLOSED` |
| BR-05 Owner acts only on own surveys | Every owner query is scoped with `where { id, ownerId: currentUser.id }`; no match gives 404 | Foreign key `Survey.ownerId` |
| BR-06 Response completely valid | `validateAnswers(survey, answers)` in `domain/validateAnswers.ts`; whole submission rejected with 400 and nothing stored | Unique `(responseId, questionId)`; rating check constraint 1-5; one-value check on `Answer` |
| BR-07 Respondent reads only own response | Respondent queries (`my-responses`, `my-response`, `responses/{responseId}`) are scoped by `respondentId = currentUser.id`; no respondent route reaches summaries | - |
| BR-08 One role per account | Single `role` column; `requireRole(...)` on every protected route; Zod strict schemas reject server-owned fields (`role`, `userId`, `ownerId`, `status`, `submittedAt`) in request bodies with 400; identity headers are never read | Enum type `Role` |
| BR-09 Eligibility | Visibility and submit checks use `Survey.eligibility` and `SurveyEligibility`; changes are accepted only while the survey is a draft or effectively open, and a `SELECTED` list must name at least one active Respondent | Composite primary key on `SurveyEligibility` |
| BR-10 Anonymous responses carry no identity | `ResponseService` writes `respondentId = null`, no timestamp and only the Asia/Bangkok day (`calendarDay`) for anonymous surveys; no owner or administrator route exposes `Participation`, and a respondent sees only their own participations (FR-09) | Check constraint tying identity columns to mode; composite foreign key keeps `Response.mode` equal to `Survey.mode` |
| BR-11 Small-group suppression | One function, `suppression.ts`, used by summary, filtered view and export | - |
| BR-12 Published data retained | `DELETE` only for `DRAFT` surveys | `onDelete: Restrict` from responses and participations to the survey |
| BR-13 Disabled accounts | `authenticate` rejects tokens of users with `isActive = false`; login refuses disabled accounts | - |
| BR-14 Anonymous results after close | `suppression.ts` also withholds per-question results of an anonymous survey whose effective status is not `CLOSED`, and always in anonymous date-filtered views | - |

### 3.4 Key flow: submit a response

```mermaid
sequenceDiagram
  participant C as Client (Respondent)
  participant M as API middleware
  participant S as ResponseService
  participant D as PostgreSQL
  C->>M: POST /api/v1/surveys/SURVEY_ID/responses with Bearer token and answers
  M->>M: verify JWT, check token not revoked, load active user, require role RESPONDENT
  M->>S: validated request body
  S->>D: BEGIN, read survey, questions, options, eligibility
  S->>S: open? eligible? answers valid? (BR-02, BR-09, BR-06)
  S->>D: INSERT participation (unique per survey and respondent)
  alt unique violation
    D-->>S: constraint error
    S-->>C: 409 DUPLICATE_RESPONSE, transaction rolled back
  else accepted
    S->>D: INSERT response, answers, selections, then COMMIT
    S-->>C: 201 confirmation
  end
```

A submission racing with a "close" request is accepted if its transaction read the survey as open, and rejected if it read it as closed. Both outcomes are consistent.

---

## 4. Data design

### 4.1 Entity-relationship diagram

The five core entities are User, Survey, Question, Response and Answer. Five supporting tables are needed by the SRS: Option (choices), AnswerSelection (chosen options, including multiple-choice), Participation (anonymity design), SurveyEligibility (FR-15) and RevokedToken (logout).

```mermaid
erDiagram
  USER ||--o{ SURVEY : owns
  USER ||--o{ RESPONSE : "submits (identified only)"
  USER ||--o{ PARTICIPATION : "has"
  USER ||--o{ SURVEY_ELIGIBILITY : "may answer"
  SURVEY ||--o{ QUESTION : contains
  SURVEY ||--o{ RESPONSE : receives
  SURVEY ||--o{ PARTICIPATION : records
  SURVEY ||--o{ SURVEY_ELIGIBILITY : restricts
  QUESTION ||--o{ OPTION : offers
  QUESTION ||--o{ ANSWER : "answered by"
  RESPONSE ||--o{ ANSWER : includes
  ANSWER ||--o{ ANSWER_SELECTION : selects
  OPTION ||--o{ ANSWER_SELECTION : "chosen in"

  USER {
    uuid id PK
    string email UK
    string displayName
    string passwordHash
    enum role
    boolean isActive
  }
  SURVEY {
    uuid id PK
    uuid ownerId FK
    string title
    enum mode
    enum status
    enum eligibility
    datetime publishedAt
    datetime closeAt
    datetime closedAt
  }
  QUESTION {
    uuid id PK
    uuid surveyId FK
    int position
    enum type
    string text
    boolean required
  }
  OPTION {
    uuid id PK
    uuid questionId FK
    int position
    string text
  }
  RESPONSE {
    uuid id PK
    uuid surveyId FK
    enum mode
    uuid respondentId FK "NULL when ANONYMOUS"
    date submittedDay
    datetime submittedAt "NULL when ANONYMOUS"
  }
  ANSWER {
    uuid id PK
    uuid responseId FK
    uuid questionId FK
    int ratingValue
    string textValue
  }
  ANSWER_SELECTION {
    uuid answerId PK
    uuid optionId PK
  }
  PARTICIPATION {
    uuid id PK
    uuid surveyId FK
    uuid respondentId FK
    date participatedDay
  }
  SURVEY_ELIGIBILITY {
    uuid surveyId PK
    uuid respondentId PK
  }
  REVOKED_TOKEN {
    string jti PK
    datetime expiresAt
  }
```

### 4.2 Entities and ownership

| Entity | Purpose | Ownership link | Notes |
|---|---|---|---|
| User | Account with one role | - | Created by seed only (SRS D-02). Accounts are disabled, never deleted |
| Survey | Survey with title, status, mode, eligibility, optional close date | `ownerId` -> User | The title may be empty while `DRAFT` (D-15). Mode is fixed from publication (BR-03). `closedAt` is set only by a manual close; a close by date is derived from `closeAt` (Section 4.5) |
| Question | Ordered question of one survey | via Survey | Type: single-choice, rating (Sprint 1); multiple-choice, free-text (Sprint 2). Editing a draft replaces the whole question set in one transaction, which avoids temporary conflicts on the unique `(surveyId, position)` (DD-17) |
| Option | Choice of a choice question | via Question | 0-10 per choice question in a draft; 2-10 to publish |
| Response | One submitted set of answers | `respondentId` -> User (IDENTIFIED only) | `NULL` respondent and `NULL` timestamp when ANONYMOUS |
| Answer | Answer to one question inside a response | via Response | Rating value, free text, or selections |
| AnswerSelection | Chosen option(s) of a choice answer | via Answer | Single-choice has exactly one row (checked by the service); multiple-choice has one or more |
| Participation | Records that a respondent has answered a survey (no answers) | `respondentId` -> User | Created in both modes. Used for BR-01, the "already responded" indicator (FR-08) and the respondent's own list (FR-09). Never returned to owners or administrators |
| SurveyEligibility | Respondents allowed to answer a survey whose eligibility is SELECTED | `surveyId`, `respondentId` | Sprint 2 (FR-15). Changed only while the survey is a draft or open (D-18) |
| RevokedToken | Token ids revoked by logout until they expire | - | Lets logout work across instances (Section 6) |

### 4.3 Prisma schema

> The syntax below is the classic `prisma-client-js` style. If the project uses a newer Prisma major version that moves the datasource URL into `prisma.config.ts` and uses a different generator, adjust only the `generator` and `datasource` blocks. The models are unchanged. The Prisma version is pinned in `package.json`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  RESPONDENT
  SURVEY_OWNER
  ADMIN
}

enum SurveyStatus {
  DRAFT
  PUBLISHED
  CLOSED
}

enum ResponseMode {
  IDENTIFIED
  ANONYMOUS
}

enum Eligibility {
  ALL
  SELECTED
}

enum QuestionType {
  SINGLE_CHOICE
  RATING
  MULTIPLE_CHOICE
  FREE_TEXT
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique            // stored in lower case by the service
  displayName  String   @db.VarChar(100)
  passwordHash String
  role         Role
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())

  surveys        Survey[]
  responses      Response[]
  participations Participation[]
  eligibleFor    SurveyEligibility[]
}

model Survey {
  id          String       @id @default(uuid()) @db.Uuid
  ownerId     String       @db.Uuid
  title       String       @default("") @db.VarChar(120)  // may be empty while DRAFT (D-15); stored trimmed
  description String       @default("") @db.VarChar(1000)
  mode        ResponseMode @default(IDENTIFIED)
  status      SurveyStatus @default(DRAFT)
  eligibility Eligibility  @default(ALL)
  publishedAt DateTime?
  closeAt     DateTime?
  closedAt    DateTime?                              // set only by a manual close (FR-11)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  owner          User                @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  questions      Question[]
  responses      Response[]
  participations Participation[]
  eligibleUsers  SurveyEligibility[]

  @@unique([id, mode])                 // target of the composite foreign key from Response
  @@index([ownerId, status])
  @@index([status])
}

model Question {
  id       String       @id @default(uuid()) @db.Uuid
  surveyId String       @db.Uuid
  position Int
  type     QuestionType
  text     String       @db.VarChar(300)
  required Boolean      @default(true)

  survey  Survey   @relation(fields: [surveyId], references: [id], onDelete: Cascade)
  options Option[]
  answers Answer[]

  @@unique([surveyId, position])
}

model Option {
  id         String @id @default(uuid()) @db.Uuid
  questionId String @db.Uuid
  position   Int
  text       String @db.VarChar(100)

  question   Question          @relation(fields: [questionId], references: [id], onDelete: Cascade)
  selections AnswerSelection[]

  @@unique([questionId, position])
}

model Response {
  id           String       @id @default(uuid()) @db.Uuid
  surveyId     String       @db.Uuid
  mode         ResponseMode                       // copy of Survey.mode, kept equal by the composite foreign key
  respondentId String?      @db.Uuid              // NULL when ANONYMOUS (BR-10)
  submittedDay DateTime     @db.Date              // Asia/Bangkok calendar day (D-14); used for per-day counts
  submittedAt  DateTime?                          // exact time, IDENTIFIED only

  survey     Survey   @relation(fields: [surveyId, mode], references: [id, mode], onDelete: Restrict, onUpdate: Restrict)
  respondent User?    @relation(fields: [respondentId], references: [id], onDelete: Restrict)
  answers    Answer[]

  @@unique([surveyId, respondentId])              // NULLs are distinct in PostgreSQL, so anonymous rows are unaffected
  @@index([surveyId, submittedDay])
}

model Answer {
  id          String  @id @default(uuid()) @db.Uuid
  responseId  String  @db.Uuid
  questionId  String  @db.Uuid
  ratingValue Int?
  textValue   String? @db.VarChar(1000)

  response   Response          @relation(fields: [responseId], references: [id], onDelete: Cascade)
  question   Question          @relation(fields: [questionId], references: [id], onDelete: Restrict)
  selections AnswerSelection[]

  @@unique([responseId, questionId])              // a question cannot be answered twice (BR-06)
  @@index([questionId])
}

model AnswerSelection {
  answerId String @db.Uuid
  optionId String @db.Uuid

  answer Answer @relation(fields: [answerId], references: [id], onDelete: Cascade)
  option Option @relation(fields: [optionId], references: [id], onDelete: Restrict)

  @@id([answerId, optionId])
  @@index([optionId])
}

model Participation {
  id              String   @id @default(uuid()) @db.Uuid
  surveyId        String   @db.Uuid
  respondentId    String   @db.Uuid
  participatedDay DateTime @db.Date                 // Asia/Bangkok calendar day (D-14)

  survey     Survey @relation(fields: [surveyId], references: [id], onDelete: Restrict)
  respondent User   @relation(fields: [respondentId], references: [id], onDelete: Restrict)

  @@unique([surveyId, respondentId])              // BR-01 in both modes
  @@index([respondentId])
}

model SurveyEligibility {
  surveyId     String @db.Uuid
  respondentId String @db.Uuid

  survey     Survey @relation(fields: [surveyId], references: [id], onDelete: Cascade)
  respondent User   @relation(fields: [respondentId], references: [id], onDelete: Cascade)

  @@id([surveyId, respondentId])
}

model RevokedToken {
  jti       String   @id
  expiresAt DateTime
  revokedAt DateTime @default(now())

  @@index([expiresAt])
}
```

### 4.4 Constraints added by raw SQL in migrations

Prisma cannot express check constraints, so they are added in a hand-written migration (`prisma migrate dev --create-only`, then edit the SQL). Table and column names follow Prisma's default quoted names.

```sql
-- Identity columns of a response depend on the mode (BR-10)
ALTER TABLE "Response" ADD CONSTRAINT response_identity_by_mode_chk CHECK (
  ("mode" = 'IDENTIFIED' AND "respondentId" IS NOT NULL AND "submittedAt" IS NOT NULL)
  OR
  ("mode" = 'ANONYMOUS'  AND "respondentId" IS NULL     AND "submittedAt" IS NULL)
);

-- Rating scale 1-5 and at most one value kind per answer (BR-06)
ALTER TABLE "Answer" ADD CONSTRAINT answer_rating_range_chk
  CHECK ("ratingValue" IS NULL OR "ratingValue" BETWEEN 1 AND 5);
ALTER TABLE "Answer" ADD CONSTRAINT answer_single_value_chk
  CHECK (num_nonnulls("ratingValue", "textValue") <= 1);

-- Lifecycle consistency (BR-04)
ALTER TABLE "Survey" ADD CONSTRAINT survey_published_at_chk CHECK (
  ("status" = 'DRAFT' AND "publishedAt" IS NULL)
  OR ("status" <> 'DRAFT' AND "publishedAt" IS NOT NULL)
);

-- A manual close time exists exactly when the stored status is CLOSED (BR-04).
-- A survey closed by its close date keeps status PUBLISHED and closedAt NULL (DD-14).
ALTER TABLE "Survey" ADD CONSTRAINT survey_closed_at_chk CHECK (
  ("status" = 'CLOSED') = ("closedAt" IS NOT NULL)
);

-- Positions start at 1
ALTER TABLE "Question" ADD CONSTRAINT question_position_chk CHECK ("position" >= 1);
ALTER TABLE "Option"   ADD CONSTRAINT option_position_chk   CHECK ("position" >= 1);
```

Rules that need data from several tables (an answer's question belongs to the response's survey; a choice belongs to the answered question; single-choice has exactly one selection) are enforced in `validateAnswers` and covered by tests. They are not enforced by database triggers. The publish checks of BR-04 are application rules only, because a draft is allowed to be incomplete (D-15).

### 4.5 Queries and performance

- Aggregates are computed in SQL (`COUNT` and `GROUP BY` over `AnswerSelection` and `Answer`, `AVG` for ratings), never by loading all answers into memory. The indexes on `Answer(questionId)`, `AnswerSelection(optionId)` and `Response(surveyId, submittedDay)` support this and the NFR-01 target.
- List endpoints are paginated with a default page size of 20 and a maximum of 100.
- **Effective status.** The stored status is never changed by time alone (DD-07, DD-14). Open surveys are selected with `"status" = 'PUBLISHED' AND ("closeAt" IS NULL OR "closeAt" > now())`, and every service action and owner list computes `effectiveStatus(survey, now)`, so a survey past its close date is treated as `CLOSED` everywhere.
- **Calendar days.** `calendarDay(instant)` converts a UTC instant to an Asia/Bangkok date (`YYYY-MM-DD`, UTC+7, D-14). It is the only place where days are computed. Date-range filters (FR-19) turn inclusive Bangkok days into UTC instants with the same rule.

### 4.6 Anonymity design (SRS D-09, BR-10, BR-11)

1. **Separation.** For an `ANONYMOUS` survey, `Response.respondentId` and `Response.submittedAt` are `NULL`. The only record that links a person to the survey is `Participation`, which stores the survey, the respondent and the **day**, and no answers. There is no reference from `Participation` to `Response`.
2. **The database enforces it.** The check constraint in Section 4.4 and the composite foreign key `(surveyId, mode)` make it impossible to store an identified-looking row for an anonymous survey, or the other way round, and the mode cannot be changed once responses exist.
3. **Day precision.** Answer time is stored as an Asia/Bangkok calendar day only (D-14), so an answer set cannot be matched to a participation by its exact time.
4. **No identity in any output.** No owner or administrator endpoint returns `Participation` data; a respondent sees only their own participations (survey and day, FR-09). Free-text answers of anonymous surveys are listed in alphabetical order, not submission order.
5. **Small groups are suppressed.** Fewer than `ANON_MIN_RESPONSES` (default 5) anonymous responses return only the total count (BR-11).
6. **Results only after close.** While an anonymous survey is open, its summary and export return only the total count. Per-question results are released when the survey is `CLOSED`, so the owner cannot compare results before and after one person submits. Date-range filters on anonymous surveys return only the total and per-day counts, so results for two overlapping ranges cannot be subtracted to isolate one response (BR-14).
7. **Logging rule.** For anonymous surveys the submit request is logged with user id, route and status only. Request bodies and created record ids are not logged, and the API response does not return a response id.
8. **Respondent view.** For an anonymous survey the respondent can see only that they have participated and on which day (see Section 12, item S-1).

**Known limits.** This design protects against disclosure through the application: its screens, API responses and exports, including the owner's views. It does not protect against a person with direct database or log access:

- The participation row and the response row are written in the same transaction, so they share the PostgreSQL system column `xmin` and are usually stored next to each other. A query that reads these system columns can link them. Writing the two rows in separate transactions would break the atomicity that BR-01 needs, so this is accepted.
- Application and platform request logs record which user submitted to which survey and when.
- A person who knows that only one respondent participated on a given day could link that day's answers.

Database, log and cloud-project access is limited to the two developers. This is accepted for the course scope and is documented as a limitation; the suppression threshold, day precision and release after close reduce the risk.

### 4.7 Migrations and seed data

- Schema changes are made only through Prisma migrations committed to Git (`prisma/migrations`). `prisma migrate deploy` applies them locally, in CI and in the pipeline.
- Migrations follow expand-then-contract, so the previous application image still works after a migration and application rollback is safe.
- `prisma/seed.ts` is repeatable (it upserts by email) and creates synthetic data only:
  - 2 Survey Owners, 3 Respondents and 1 Administrator (the Administrator account is used from Sprint 3);
  - one `PUBLISHED` identified survey, one `DRAFT` survey and one `CLOSED` survey, so every rule can be demonstrated immediately.
- All seeded accounts use the password from the `SEED_PASSWORD` environment variable, hashed at seed time. Passwords are shared through the private course handoff and never committed.
- `npm run setup` also creates the test database named in `TEST_DATABASE_URL` and applies the migrations to it. Integration tests never use the development database.
- `prisma/seed-benchmark.ts` creates the NFR-01 data set in the test database only: one identified survey with 10 questions, 1,000 synthetic respondents with one response each (BR-01 allows one response per respondent), and 50 further respondents who have not answered, for the submit timing. All benchmark accounts share one hash computed once from `SEED_PASSWORD`, so seeding does not run bcrypt 1,050 times.

---

## 5. API design

### 5.1 Conventions

| Topic | Convention |
|---|---|
| Base path | `/api/v1`. A breaking change would use `/api/v2` |
| Format | JSON request and response bodies, UTF-8, `Content-Type: application/json`, body limit 100 kB |
| Resources | Plural nouns in kebab-case (`/surveys`, `/available-surveys`); state changes are actions under the resource (`POST /surveys/{id}/publish`) |
| JSON fields | camelCase. Ids are UUIDs. Times are ISO-8601 in UTC (`2026-11-06T09:30:00.000Z`). Calendar days are `YYYY-MM-DD` in Asia/Bangkok (D-14) |
| Methods | `GET` read, `POST` create or action, `PATCH` partial update, `PUT` replace a sub-collection, `DELETE` remove |
| Success body | `{ "data": ... }`. Lists add `"meta": { "page", "pageSize", "total" }` |
| Success status | 200 read or update, 201 create (with the created resource), 204 logout and delete |
| Request validation | Zod strict schemas: unknown fields are rejected with 400 `VALIDATION_ERROR`, so a body that tries to set `ownerId`, `role`, `userId`, `status`, `submittedAt` or any other server-owned field is refused and nothing changes (BR-08, DD-16) |
| Authentication | `Authorization: Bearer <JWT>` on every route except login and health |
| Identity | Taken only from the verified token. Identity values in headers or query strings are never read, so they are ignored |
| Correlation | Every response carries an `X-Request-Id` header, repeated in error bodies |
| Pagination | `?page=1&pageSize=20` |

### 5.2 Error format

Every error uses one shape and never contains stack traces, SQL, file paths, hashes or other users' data (NFR-08).

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is not valid.",
    "details": [
      { "field": "answers[1].rating", "issue": "must be an integer from 1 to 5" }
    ],
    "requestId": "b3d2c0f1-5a1e-4c6f-9d6e-0f7a1f3c2a10"
  }
}
```

`details` is present only for validation errors. Unexpected failures return `INTERNAL_ERROR` with a generic message; the cause is logged on the server with the same `requestId`.

| Code | HTTP | Meaning | Rule |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Malformed or invalid input, including invalid answers, failed publish checks, server-owned fields in the body and a close date in the past. `details` lists every problem | BR-06, BR-04, BR-08, FR-14 |
| `UNAUTHENTICATED` | 401 | Missing, invalid, expired or revoked token, or disabled account | NFR-03, BR-13 |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password. One message for both | FR-05 |
| `FORBIDDEN` | 403 | Authenticated, but the role may not use this operation | BR-08 |
| `NOT_FOUND` | 404 | Record does not exist, or exists but is not visible to the caller (another owner's survey, another respondent's response, a draft, a survey the respondent is not eligible for) | BR-05, BR-07, BR-09 |
| `SURVEY_NOT_OPEN` | 409 | Submission to a closed survey or after its close date | BR-02 |
| `DUPLICATE_RESPONSE` | 409 | The respondent has already answered this survey | BR-01 |
| `INVALID_STATE_TRANSITION` | 409 | Lifecycle change not allowed: publishing a published or closed survey, closing a draft or closed survey, or changing the close date or eligibility of a closed survey | BR-04, FR-14, FR-15 |
| `SURVEY_NOT_PUBLISHED` | 409 | Summary or export requested for a `DRAFT` survey | FR-04 |
| `SURVEY_LOCKED` | 409 | Attempt to change questions, options or mode of a published or closed survey | BR-03 |
| `RATE_LIMITED` | 429 | Too many failed logins from one client address (Sprint 3) | NFR-11 |
| `INTERNAL_ERROR` | 500 | Unexpected failure | NFR-08 |

**Visibility policy.** A role that may never use an operation gets 403. A role that may use the operation but not on this record gets 404, so that the existence of other users' records is not revealed.

### 5.3 Endpoint catalog

Detailed request and response shapes are in the feature contracts. `{id}` is a survey id.

| Method and path | Purpose | FR | Allowed roles | Sprint |
|---|---|---|---|---|
| `GET /api/v1/health` | Liveness, database check and deployed version | - | Public | 1 |
| `POST /api/v1/auth/login` | Log in, receive a token | FR-05 | Public | 1 |
| `POST /api/v1/auth/logout` | Revoke the current token | FR-06 | Any authenticated | 1 |
| `GET /api/v1/auth/me` | Current user | FR-07 | Any authenticated | 1 |
| `POST /api/v1/surveys` | Create a draft survey with questions | FR-01 | Survey Owner | 1 |
| `GET /api/v1/surveys` | List own surveys | FR-10 | Survey Owner | 1 |
| `GET /api/v1/surveys/{id}` | Own survey with questions | FR-01, FR-10 | Survey Owner (own) | 1 |
| `POST /api/v1/surveys/{id}/publish` | Publish | FR-02 | Survey Owner (own) | 1 |
| `POST /api/v1/surveys/{id}/close` | Close | FR-11 | Survey Owner (own) | 1 |
| `GET /api/v1/surveys/{id}/summary` | Aggregate summary | FR-04 | Survey Owner (own) | 1 |
| `GET /api/v1/available-surveys` | Open surveys the respondent may answer | FR-08 | Respondent | 1 |
| `GET /api/v1/available-surveys/{id}` | Survey form for answering | FR-03, FR-08 | Respondent | 1 |
| `POST /api/v1/surveys/{id}/responses` | Submit a response | FR-03 | Respondent | 1 |
| `GET /api/v1/my-responses` | Surveys the respondent has answered, including closed ones, with title, effective status and participation day | FR-09 | Respondent | 1 |
| `GET /api/v1/surveys/{id}/my-response` | Own submission for a survey (also after it closes) | FR-09 | Respondent | 1 |
| `GET /api/v1/responses/{responseId}` | Own response by id | FR-09 | Respondent (own) | 1 |
| `PATCH /api/v1/surveys/{id}` | Edit draft (the whole question set is replaced); after publication title and description, plus close date while open | FR-12, FR-14 | Survey Owner (own) | 2 |
| `DELETE /api/v1/surveys/{id}` | Delete a draft | FR-13 | Survey Owner (own) | 2 |
| `PUT /api/v1/surveys/{id}/eligibility` | Set eligibility and the selected list (draft or open survey only) | FR-15 | Survey Owner (own) | 2 |
| `GET /api/v1/respondents` | Respondent accounts for the eligibility picker | FR-15 | Survey Owner | 2 |
| `GET /api/v1/surveys/{id}/responses` | List individual responses (identified only) | FR-18 | Survey Owner (own) | 3 |
| `GET /api/v1/surveys/{id}/responses/{responseId}` | One individual response (identified only) | FR-18 | Survey Owner (own) | 3 |
| `GET /api/v1/surveys/{id}/summary?from=&to=` | Summary filtered by date range, with per-day counts | FR-19 | Survey Owner (own) | 3 |
| `GET /api/v1/surveys/{id}/export?format=csv` | CSV export | FR-20 | Survey Owner (own) | 3 |
| `GET /api/v1/users` | List accounts | FR-21 | Administrator | 3 |
| `PATCH /api/v1/users/{userId}` | Enable or disable an account | FR-21 | Administrator | 3 |

Anonymous surveys: `GET /surveys/{id}/my-response` returns only `{ "participated": true, "participatedDay": "YYYY-MM-DD", "answersAvailable": false }`, and `GET /responses/{responseId}` never finds an anonymous response because it is not linked to any user. `GET /my-responses` lists anonymous surveys with the participation day only. While an anonymous survey is open, `summary` and `export` return only the total count (BR-14).

### 5.4 Example payloads

**Login** `POST /api/v1/auth/login`

```json
{ "email": "owner1@example.edu", "password": "<from private handoff>" }
```

```json
{
  "data": {
    "token": "<jwt>",
    "tokenType": "Bearer",
    "expiresAt": "2026-11-06T10:30:00.000Z",
    "user": { "id": "7c1f...", "displayName": "Owner One", "role": "SURVEY_OWNER" }
  }
}
```

**Submit response** `POST /api/v1/surveys/{id}/responses`. Choice questions use `optionIds`, rating uses `rating`, free-text uses `text`.

```json
{
  "answers": [
    { "questionId": "q1-id", "optionIds": ["o2-id"] },
    { "questionId": "q2-id", "rating": 4 }
  ]
}
```

```json
{ "data": { "responseId": "r1-id", "surveyId": "s1-id", "submittedAt": "2026-11-06T09:41:12.000Z" } }
```

For an `ANONYMOUS` survey the response is `{ "data": { "surveyId": "s1-id", "submitted": true } }`.

**Aggregate summary** `GET /api/v1/surveys/{id}/summary`

```json
{
  "data": {
    "surveyId": "s1-id",
    "totalResponses": 12,
    "suppressed": false,
    "suppressionReason": null,
    "questions": [
      {
        "questionId": "q1-id", "type": "SINGLE_CHOICE", "answered": 12,
        "options": [
          { "optionId": "o1-id", "text": "Yes", "count": 9, "percent": 75.0 },
          { "optionId": "o2-id", "text": "No",  "count": 3, "percent": 25.0 }
        ]
      },
      {
        "questionId": "q2-id", "type": "RATING", "answered": 12,
        "mean": 4.17, "distribution": { "1": 0, "2": 1, "3": 1, "4": 4, "5": 6 }
      }
    ]
  }
}
```

When BR-11 or BR-14 applies, `suppressed` is `true`, `suppressionReason` is `BELOW_THRESHOLD` (BR-11) or `SURVEY_OPEN` (BR-14), and `questions` is empty. Percentages are of the respondents who answered the question, rounded to 1 decimal place (0.0 when nobody answered that question); the mean is rounded to 2 decimal places and is `null` when nobody answered (FR-04).

---

## 6. Authentication and session design

| Topic | Design |
|---|---|
| Accounts | Seeded only. Email (stored in lower case) and password. No registration or recovery (SRS D-02) |
| Password storage | `bcrypt` with cost from `BCRYPT_COST` (production 12). `config.ts` refuses to start with a cost below 10 unless `NODE_ENV=test`, where 4 is allowed for speed (NFR-02). Plaintext passwords are never stored, logged or returned |
| Login | Look up by email, compare with bcrypt. If the email is unknown, a comparison against a dummy hash is still performed, and the response is the same `INVALID_CREDENTIALS` message, so neither the message nor the timing reveals which emails exist. Disabled accounts are refused |
| Token | JWT, HS256, signed with `JWT_SECRET`. Claims: `sub` (user id), `jti` (random id), `iat`, `exp`. Lifetime from `JWT_EXPIRES_MINUTES` (default 60, never more than 60). The token carries no role: the role is read from the database on every request, so a role change or a disabled account takes effect immediately |
| Refresh | No refresh tokens. After expiry the user logs in again (DD-06) |
| Request check (`authenticate`) | 1. Bearer token present. 2. Signature and expiry valid. 3. `jti` not in `RevokedToken`. 4. User exists and `isActive`. Any failure gives 401 `UNAUTHENTICATED` and no data. On success `req.user = { id, role }` from the database |
| Current user | `GET /auth/me` returns id, display name and role from the database row of the token's `sub` |
| Logout | `POST /auth/logout` inserts the token's `jti` and `exp` into `RevokedToken` and returns 204. Later requests with that token get 401. The table is database-backed, so it works across instances and restarts. Expired rows are deleted opportunistically |
| Client storage | The SPA keeps the token in `sessionStorage` (cleared when the tab closes) and sends it in the `Authorization` header. A 401 clears it and redirects to the login screen. Because script-readable storage is exposed to cross-site scripting, the SPA never renders unescaped HTML, and `helmet` sends a strict Content-Security-Policy |
| Secrets | `JWT_SECRET` comes from the environment (Secret Manager on GCP). The application refuses to start if it is missing or shorter than 32 characters (NFR-09) |
| Login throttling (Sprint 3) | `express-rate-limit` on `POST /auth/login` counts failed attempts per client IP. After `LOGIN_RATE_MAX_FAILED` (default 10) failures within `LOGIN_RATE_WINDOW_SECONDS` (default 60), further attempts get 429 `RATE_LIMITED` with a generic message until the window ends (NFR-11). Express trusts one proxy hop so that the real client IP behind Cloud Run is used. The counter is held in memory per instance; with at most 2 instances the effective limit stays within 20 per minute, which is accepted (DD-18) |

---

## 7. Authorization design

### 7.1 Roles and rules

Three roles, one per account (BR-08): `RESPONDENT`, `SURVEY_OWNER`, `ADMIN`. Authorization is two checks on the server:

1. **Role check.** `requireRole(...)` on the route. Wrong role gives 403.
2. **Record check.** The service scopes every query by the current user (`ownerId` or `respondentId`). No match gives 404.

A hidden button is not authorization. Every operation below is tested through the API (NFR-05).

### 7.2 Role and permission matrix

"Own" means the record is linked to the current user (`Survey.ownerId` or the respondent's own response). Not-own records give 404. A cell showing 401 applies when no valid token is sent.

| Operation | Unauthenticated | Respondent | Survey Owner | Administrator | Record-level rule and notes |
|---|---|---|---|---|---|
| Health check | Allow | Allow | Allow | Allow | Returns no private data |
| Login | Allow | Allow | Allow | Allow | Disabled accounts refused |
| Logout, current user | 401 | Allow (self) | Allow (self) | Allow (self) | Acts on the token's own identity only |
| Create survey | 401 | 403 | Allow | 403 | Owner set from token |
| List and read own surveys | 401 | 403 | Own only | 403 | `ownerId` = current user (BR-05) |
| Edit or delete a survey | 401 | 403 | Own only | 403 | Draft rules BR-03, BR-12; close date only while open (FR-14) |
| Publish or close | 401 | 403 | Own only | 403 | Lifecycle BR-04 |
| Set eligibility, list respondents | 401 | 403 | Own only | 403 | Draft or open surveys only (FR-15); the respondent list shows display name and email only |
| View summary, filtered summary, export | 401 | 403 | Own only | 403 | BR-05, BR-11, BR-14; a draft gives 409; anonymous results only after close; export of individual rows only for identified surveys |
| View individual responses | 401 | 403 | Own, identified only | 403 | Not available for anonymous surveys (BR-10) |
| List available surveys, read a survey form | 401 | Allow (open and eligible only) | 403 | 403 | BR-02, BR-09; a draft is 404 |
| Submit response | 401 | Allow (eligible, once) | 403 | 403 | BR-01, BR-02, BR-06, BR-09 |
| List own responses, read own submission (`my-responses`, `my-response`, `responses/{id}`) | 401 | Own only | 403 | 403 | BR-07; includes closed surveys; another respondent's response is 404 |
| List, enable, disable users | 401 | 403 | 403 | Allow | Administrator cannot disable their own account and cannot reach any survey or response endpoint (BR-08) |

### 7.3 Data access summary

| Data | Who can read | Who can write |
|---|---|---|
| Survey and questions | The owner; respondents only through the open-survey form when eligible | The owner, under the lifecycle rules |
| Identified response | The responding respondent; the owner of the survey (Sprint 3) | The responding respondent, once |
| Anonymous answers | Nobody individually; after the survey closes (BR-14) and subject to BR-11, the owner sees aggregates and free-text answers without identity | The system on submission |
| Participation | The respondent, for their own records only (survey and day, FR-09); never owners or administrators | The system on submission |
| User accounts | Each user their own profile; the Administrator the account list | Administrator (enable or disable) |

---

## 8. UI design

### 8.1 Navigation and screens

After login the SPA redirects by role. The navigation bar shows only the links of that role. Client route guards are a usability aid; the API enforces access.

| Route | Screen | Role | Sprint |
|---|---|---|---|
| `/` | Redirect to the role's home screen, or to `/login` | Any | 1 |
| `/login` | Login | Public | 1 |
| `/available` | Available surveys (with "already responded" indicator) | Respondent | 1 |
| `/available/:surveyId` | Survey form with response-mode notice, and submission confirmation | Respondent | 1 |
| `/my-responses` | My responses: surveys answered, including closed ones, with participation day | Respondent | 1 |
| `/my-responses/:surveyId` | My submission: answers and time (anonymous surveys: participation day only, from Sprint 2) | Respondent | 1 |
| `/my-surveys` | My surveys (effective status, response count, dates, actions) | Survey Owner | 1 |
| `/my-surveys/new` | Survey builder; incomplete drafts can be saved (multiple-choice, free-text and anonymous mode added in Sprint 2) | Survey Owner | 1 |
| `/my-surveys/:surveyId` | Survey detail with publish (failed checks listed) and close; delete draft from Sprint 2 | Survey Owner | 1 |
| `/my-surveys/:surveyId/summary` | Aggregate summary; date filter and CSV export from Sprint 3 | Survey Owner | 1 |
| `/my-surveys/:surveyId/edit` | Edit draft; after publication title and description, plus close date while open | Survey Owner | 2 |
| `/my-surveys/:surveyId/eligibility` | Eligibility: all Respondents or a selected list | Survey Owner | 2 |
| `/my-surveys/:surveyId/responses` | Individual responses (identified surveys only) | Survey Owner | 3 |
| `/admin/users` | User accounts | Administrator | 3 |
| `*` | Not found | Any | 1 |

### 8.2 Shared UI behavior

| Behavior | Convention |
|---|---|
| Validation | The client mirrors the server limits (SRS Section 6) for fast feedback. The server is authoritative; field errors from `error.details` are shown next to the fields |
| Loading | Any request longer than about 200 ms shows a spinner or skeleton, and the submit button is disabled while sending to prevent double submission |
| Empty states | A message and a next action (for example "No surveys yet. Create your first survey") |
| Errors | A visible banner with the server `message` and the `requestId`. 401 clears the session and goes to login with "Your session has ended". 403 shows a "not allowed" page. 404 shows "not found" |
| Confirmation | Success after create, publish, close and submit; the survey form shows the response mode (identified or anonymous) before the submit button (FR-03) |
| Responsive layout | Mobile-first, tested at 360, 768 and 1280 px; no horizontal page scrolling; tables become stacked cards on narrow screens (NFR-04) |
| Accessibility basics | Labels on all inputs, keyboard-operable controls, visible focus, sufficient contrast; checked by an automated scan and a keyboard-only journey (NFR-12) |
| Navigation bar | Shows the display name and role from `/auth/me` (FR-07), the links of that role only, and a Logout button (FR-06) |
| Dates and times | Shown in Asia/Bangkok time; calendar days follow D-14. An empty draft title is shown as "Untitled survey" |

---

## 9. Configuration and secrets

Configuration comes from environment variables, validated at start-up by `config.ts`. Invalid or missing required values stop the application with a clear message that never prints secret values.

| Variable | Purpose | Example in `.env.example` | Secret |
|---|---|---|---|
| `NODE_ENV` | Mode | `development` | No |
| `PORT` | HTTP port (Cloud Run supplies 8080) | `8080` | No |
| `DB_PASSWORD` | Password of the local PostgreSQL container, read by `docker-compose.yml` (local only) | `change-me-db-password` | Yes |
| `DATABASE_URL` | PostgreSQL connection string; locally it uses the compose user `survey` and the same password as `DB_PASSWORD` | `postgresql://survey:change-me-db-password@localhost:5432/survey` | Yes |
| `TEST_DATABASE_URL` | Separate database for integration tests and the NFR-01 benchmark (local and CI) | `postgresql://survey:change-me-db-password@localhost:5432/survey_test` | Yes |
| `JWT_SECRET` | JWT signing key, at least 32 characters, required | `change-me-use-a-long-random-value` | Yes |
| `JWT_EXPIRES_MINUTES` | Token lifetime, at most 60 | `60` | No |
| `BCRYPT_COST` | Hash cost (production 12); below 10 refused unless `NODE_ENV=test`, where tests use 4 | `12` | No |
| `ANON_MIN_RESPONSES` | Small-group threshold (BR-11) | `5` | No |
| `LOGIN_RATE_MAX_FAILED` | Failed logins allowed per client IP per window (NFR-11, Sprint 3) | `10` | No |
| `LOGIN_RATE_WINDOW_SECONDS` | Throttling window; shortened in tests (NFR-11, Sprint 3) | `60` | No |
| `SEED_PASSWORD` | Password applied to seeded accounts | `change-me-seed-password` | Yes |
| `APP_VERSION` | Git commit SHA baked in at build, returned by `/health` | `dev` | No |
| `LOG_LEVEL` | Log verbosity | `info` | No |

**Rules.** `.env` is in `.gitignore`. `.env.example` holds placeholders only. Secret scanning runs on every PR and on the history (NFR-09). The PDF and the repository never contain real passwords, tokens or keys; test accounts are shared through the private course handoff.

**Local setup target** (NFR-10, at most 6 commands):

```bash
cp .env.example .env            # then edit the placeholder values
docker compose up -d db         # local PostgreSQL with a named volume
npm run setup                   # install dependencies, generate client, create the test database, migrate both databases, seed
npm run dev                     # start API and SPA
npm test                        # run the required test suites
```

---

## 10. Delivery and deployment plan (for Lab 5)

This section is the design. Cloud resources are created in Lab 5, and values in angle brackets are filled in then.

### 10.1 Container

A multi-stage `Dockerfile` produces one image containing the API and the built SPA:

1. **Build stage:** install dependencies, build the SPA (`vite build`), compile the API (`tsc`), run `prisma generate`.
2. **Runtime stage:** a slim Node LTS base image, production dependencies only, compiled API, built SPA as static files, Prisma schema and migrations, a non-root user, `EXPOSE 8080`, `CMD ["node", "dist/server.js"]`.
3. `APP_VERSION` is passed as a build argument (the commit SHA).

The container filesystem is treated as disposable: nothing durable is written to it. `docker-compose.yml` (local only) starts PostgreSQL with a named volume, and optionally the application image. `DB_PASSWORD` is read from `.env`, which Docker Compose loads automatically:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: survey
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: survey
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
volumes:
  pgdata:
```

### 10.2 Continuous integration

Runs on every PR into a sprint staging branch and into `main`. Failed required checks block merging.

| Check | Purpose |
|---|---|
| Install, type-check, lint | Static quality |
| `prisma validate` and migration apply to a fresh PostgreSQL service container | Schema and migrations are valid |
| Unit and integration tests against the PostgreSQL service container | Domain rules, persistence, authentication, RBAC matrix, concurrency |
| Docker image build | The image builds from a clean checkout |
| Secret scan | NFR-09 |
| End-to-end tests (Playwright) | Required on release PRs from staging to `main` |

Branch protection on the sprint staging branches and `main`: required checks, and at least one approving review by the teammate who is not the author.

### 10.3 Continuous delivery

Triggered by an accepted merge to `main`:

1. Build the image tagged with the commit SHA and push it to Artifact Registry.
2. Run `prisma migrate deploy` against Cloud SQL as a separate pipeline step, before the new revision receives traffic, so that several instances never race to migrate. The step runs as a Cloud Run Job that uses the new image and the same Cloud SQL connection; the alternative, the Cloud SQL Auth Proxy inside the GitHub runner, is decided in Lab 5.
3. Deploy the image to Cloud Run.
4. Run smoke tests (Section 10.5).

GitHub Actions authenticates to Google Cloud with Workload Identity Federation (short-lived credentials, no key files). A documented manual approval step may sit before step 3.

### 10.4 GCP architecture

```mermaid
flowchart LR
  Dev["Developers"] -->|"PR, review"| GH["GitHub repository"]
  GH -->|"CI and CD workflows"| GA["GitHub Actions"]
  GA -->|"push image, Workload Identity Federation"| AR
  GA -->|"migrate and deploy"| CR
  subgraph GCP["Google Cloud project"]
    AR["Artifact Registry (image tagged with commit SHA)"]
    CR["Cloud Run service (one container: SPA and API)"]
    SQL[("Cloud SQL for PostgreSQL")]
    SM["Secret Manager"]
    LG["Cloud Logging"]
  end
  AR --> CR
  CR -->|"Cloud SQL connection"| SQL
  SM -->|"secrets as environment variables"| CR
  CR --> LG
  U["Users (browser)"] -->|"HTTPS"| CR
```

| Component | Configuration |
|---|---|
| Cloud Run service | One container (SPA and API), port 8080, HTTPS provided by Cloud Run, minimum instances 0 and a small maximum (for example 2) to limit cost, one revision per deployment |
| Cloud SQL (PostgreSQL 16) | Smallest suitable tier, automated backups on, connected from Cloud Run through the Cloud SQL connection. Data lives here, not in the container (NFR-07) |
| Artifact Registry | Docker repository; image tag is the commit SHA |
| Secret Manager | `JWT_SECRET`, database password (and `SEED_PASSWORD`), injected into Cloud Run as environment variables |
| Cloud Logging | Application logs (structured, with redaction) and request logs |
| Region | `<region>`, chosen in Lab 5 (preferably close to users) |
| Application service account | Cloud SQL Client; Secret Manager Secret Accessor on the specific secrets only |
| Pipeline service account (via Workload Identity Federation) | Artifact Registry Writer, Cloud Run Developer, Service Account User, Cloud SQL Client |

IAM controls access to cloud resources. Application roles (Section 7) control access to survey functions. They are independent.

### 10.5 Release identification, smoke tests and rollback

- **Traceability.** Git commit SHA = image tag = value of `APP_VERSION`. `GET /api/v1/health` returns `{ "status": "ok", "db": "ok", "version": "<sha>" }`, so the deployed version can be matched to the commit, the image digest, the Cloud Run revision and the CI run.
- **Smoke tests after every deployment.** (1) `/health` is 200 and its version equals the deployed SHA; (2) a seeded Survey Owner and a Respondent can log in; (3) the available-surveys list responds; (4) a record created before the deployment is still retrievable (persistence).
- **Persistence check.** Create a survey and a response, deploy a new revision, retrieve both; roll back to the previous image and retrieve both again.
- **Rollback.** Redeploy the previous known-good image. This is safe because migrations are backward-compatible (Section 4.7). A rollback is not a database restore.
- **Cost control.** Minimum instances 0, maximum instances capped, smallest Cloud SQL tier, budget alerts configured (an alert is not a spending cap), and unused resources removed after grading.

---

## 11. Testing architecture

| Level | Tools | Scope | Examples |
|---|---|---|---|
| Unit | Vitest | Pure domain functions | `validateAnswers`, `canTransition`, `publishChecks`, `effectiveStatus`, `calendarDay` (day boundary at 00:00 Bangkok, which is 17:00 UTC), summary rounding, suppression (BR-11, BR-14), boundary values from SRS Section 6 |
| API and database integration | Vitest, Supertest, real PostgreSQL | Persistence, authentication, RBAC matrix, ownership, constraints, concurrency | Valid and invalid login, 401 for every protected route, 403 wrong role, 404 other user's record, 20 parallel submissions store one response (NFR-06), restart persistence |
| End-to-end | Playwright | Critical journeys in a real browser | Owner creates and publishes, respondent submits and retrieves, rejection messages, layouts at 360, 768 and 1280 px (NFR-04) |
| Non-functional | Timing test, start-up tests, secret scanner, axe-core | NFR-01 latency (p95 under 300 ms on the benchmark data set), NFR-02 and NFR-09 start-up rules, NFR-09 secret scan, NFR-11 throttling and NFR-12 accessibility (Sprint 3) | Results recorded in the traceability matrix |

Integration tests use the separate database in `TEST_DATABASE_URL`, truncated and re-seeded between test files. The NFR-01 benchmark uses its own data set in the same test database (Section 4.7) and runs as a separate command, not as part of the default `npm test`. Mocks are not used for persistence evidence. TDD is used for meaningful rule work (BR-01, BR-02, BR-03, BR-04, BR-06, BR-10, BR-14), with the failing-then-passing evidence kept in Git history.

---

## 12. Design decisions and follow-ups

Status: **Resolved** = agreed and fixed by both authors.

| ID | Decision | Rationale | Status |
|---|---|---|---|
| DD-01 | Node.js, TypeScript, Express, Prisma, PostgreSQL, React, Vite, REST under `/api/v1`; one container | One language, one deployable unit, matches Lab 5 option 1 | Resolved |
| DD-02 | Participation is a separate table; `Response.respondentId` and `submittedAt` are nullable; a composite foreign key `(surveyId, mode)` keeps `Response.mode` equal to `Survey.mode`; a check constraint ties identity columns to the mode | Anonymity is enforced by the schema and can be inspected and tested | Resolved |
| DD-03 | A record that exists but is not the caller's returns 404, not 403 | Does not reveal which ids exist (NFR-05) | Resolved |
| DD-04 | The role is read from the database on each request and is not stored in the token | A role change or disabled account applies immediately; the client cannot influence its role (BR-08, BR-13) | Resolved |
| DD-05 | Logout revokes the token `jti` in a database table | JWTs are stateless; a database table works across instances and restarts | Resolved |
| DD-06 | No refresh tokens; a 60-minute lifetime | Smaller scope; adequate for the use cases | Resolved |
| DD-07 | Scheduled close (FR-14) is evaluated when a survey is read or submitted (`effectiveStatus`), with no background job | Cloud Run can scale to zero; no scheduler to maintain | Resolved |
| DD-08 | Migrations run as a pipeline step before deployment, not at application start | Avoids races between instances; supports rollback | Resolved |
| DD-09 | Aggregates are computed by SQL on request, with no cache | Correct at 1,000 responses per survey and simple (NFR-01) | Resolved |
| DD-10 | Token stored in `sessionStorage` and sent as a Bearer header | Simple to test over HTTP; risks are reduced by escaping and a strict Content-Security-Policy | Resolved |
| DD-11 | The application and the SPA are served from one origin in production | No CORS configuration, one Cloud Run service | Resolved |
| DD-12 | Drafts may be saved incomplete; `publishChecks` runs only at publication and returns every failed check (SRS D-15) | Makes every publish check reachable through the API; matches how owners build surveys | Resolved |
| DD-13 | Calendar days are computed by one function, `calendarDay`, in Asia/Bangkok (SRS D-14) | One place to test day boundaries; Thailand has no daylight saving, so the offset is fixed at UTC+7 | Resolved |
| DD-14 | The stored status stays `PUBLISHED` when the close date passes, and every read uses `effectiveStatus`. `closedAt` is set only by a manual close, and the close date is frozen once the survey is effectively closed (SRS D-16) | No background job (DD-07) and no way to reopen a survey by moving a passed close date | Resolved |
| DD-15 | `suppression.ts` applies both BR-11 and BR-14 and returns a `suppressionReason`; summary, filtered view and export all use it | One function for every anonymous output, so the rules cannot drift apart | Resolved |
| DD-16 | Server-owned fields in a request body are rejected with 400 (Zod strict) instead of being ignored | Clear, testable behavior; a client bug or tampering attempt is visible instead of silently dropped (BR-08) | Resolved |
| DD-17 | Editing a draft replaces its whole question set in one transaction | Avoids temporary conflicts on the unique question and option positions; safe because drafts have no answers | Resolved |
| DD-18 | Login throttling uses an in-memory counter per instance | No extra infrastructure; with at most 2 Cloud Run instances the limit stays within 20 attempts per minute (NFR-11) | Resolved |

**Follow-ups for the SRS (applied in SRS v0.2).**

| ID | Item |
|---|---|
| S-1 (applied) | FR-09 says a respondent can retrieve their own submission. For anonymous surveys this is impossible by design (BR-10). Amend FR-09: for `ANONYMOUS` surveys the respondent sees only that they participated and on which day |
| S-2 (applied) | SRS D-09 describes the participation record as (survey, respondent, time). This SDS stores only the day. Amend D-09 to "day" |
| S-3 (applied) | FR-07 says the role comes "from the token". Amend to: identity from the token, role and account status from the database (DD-04) |
