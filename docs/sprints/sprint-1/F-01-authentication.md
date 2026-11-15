# F-01 Feature Contract: Authentication, Session Revocation & Role Guard

**Sprint:** 1 | **File:** `docs/sprints/sprint-1/F-01-authentication.md` | **Version:** 1.0 (Specified) | **Date:** 12 November 2026
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
| Feature | F-01 Authentication, Session Revocation & Role Guard |
| Functional requirements | FR-05 Login, FR-06 Logout, FR-07 Current User Identity |
| Business rules | BR-08 One role per account; server-owned fields rejected. BR-13 mechanism (active-account check) built here, verified in Sprint 3 |
| NFRs | NFR-02, NFR-03, NFR-05, NFR-08, NFR-09 (tests in `nfr-test-specification.md`); NFR-04 for the login screen |
| Actors | Unauthenticated visitor, Respondent, Survey Owner, System Administrator |
| Depends on | None. Provides the authentication and role middleware used by F-02, F-03 and F-04 |
| Also delivers | The initial database migration and the seeded accounts (Section 5), used by all Sprint 1 features |

---

## 2. Feature-level design

### 2.1 Behavior and workflow

**Login (FR-05)**

1. The user enters email and password on `/login` and submits.
2. The API validates the body (Section 4.1). The email is trimmed and lower-cased.
3. The API loads the user by email. If none exists, it still runs `bcrypt.compare` against a fixed dummy hash, so the response time does not reveal whether the email exists.
4. If the user does not exist, the password does not match, or the account is disabled, the API returns `401 INVALID_CREDENTIALS` with the same message in all three cases.
5. Otherwise it signs a JWT (HS256, `JWT_SECRET`) with claims `sub` (user id), `jti` (random UUID), `iat` and `exp = iat + JWT_EXPIRES_MINUTES × 60` (at most 60 minutes), and returns it with the user's id, display name and role.
6. The SPA stores the token in `sessionStorage` and redirects by role: Respondent → `/available`, Survey Owner → `/my-surveys`, Administrator → `/` (a page stating that account administration arrives in Sprint 3).

**Every protected request (`authenticate` middleware)**

1. Reads `Authorization: Bearer <token>`. Missing or malformed → `401 UNAUTHENTICATED`.
2. Verifies signature and expiry. Failure → `401`.
3. Looks up `jti` in `RevokedToken`. Found → `401`.
4. Loads the user by `sub`. Missing or `isActive = false` → `401`.
5. Sets `req.user = { id, role }` from the database row. No identity or role is ever read from the body, the query string or other headers.

**Role check (`requireRole(...roles)`)**: if `req.user.role` is not in the allowed list → `403 FORBIDDEN`. Runs after `authenticate` and before validation, so a wrong role never reaches business logic.

**Logout (FR-06)**: after `authenticate`, the API inserts the token's `jti` and `exp` into `RevokedToken` and returns `204`. Expired rows are deleted in the same request (opportunistic clean-up). The SPA clears `sessionStorage` and shows `/login`.

**Current user (FR-07)**: `GET /auth/me` returns id, display name and role from the database row of `req.user.id`.

**Client-side session handling**: any `401` from the API clears the stored token and redirects to `/login` with the notice "Your session has ended. Please log in again."

### 2.2 Business rules applied

| Rule | How F-01 applies it |
|---|---|
| BR-08 | One `role` per account; `requireRole` on every protected route; strict body validation rejects `role`, `userId`, `ownerId`, `status`, `submittedAt` and any other unknown field with `400` |
| BR-13 (mechanism) | `authenticate` and login refuse accounts with `isActive = false` |
| D-08 | Token lifetime at most 60 minutes; logout revokes the token on the server |

### 2.3 Validation

| Field | Rule |
|---|---|
| `email` | Required string, 3–254 characters after trimming, valid email format |
| `password` | Required string, 1–128 characters (not trimmed) |
| Other body fields | Not allowed (strict schema) |

### 2.4 Failure and boundary cases

| Case | Result |
|---|---|
| Unknown email, wrong password, disabled account | `401 INVALID_CREDENTIALS`, message "Email or password is incorrect.", no token |
| Missing email or password, empty body, extra field | `400 VALIDATION_ERROR` with `details` |
| Email in a different letter case (`Owner1@Example.edu`) | Accepted as the same account |
| Token missing, malformed, signed with another key, expired, revoked | `401 UNAUTHENTICATED`, message "Authentication is required.", no data |
| Valid token of a user whose role changed in the database | The new role applies on the next request |
| Logout twice with the same token | First `204`, second `401` |

### 2.5 Permissions

| Operation | Unauthenticated | Respondent | Survey Owner | Administrator |
|---|---|---|---|---|
| `POST /auth/login` | Allow | Allow | Allow | Allow |
| `POST /auth/logout` | 401 | Allow (own token) | Allow (own token) | Allow (own token) |
| `GET /auth/me` | 401 | Allow (self) | Allow (self) | Allow (self) |

---

## 3. UI specification

| Screen | Behavior |
|---|---|
| `/login` | Email and password fields with visible labels; "Log in" button disabled while the request is pending, with a spinner. On `401` shows "Email or password is incorrect." above the form and keeps the email value. On `400` shows field errors next to the fields. Already logged-in users are redirected to their role's home screen. Works at 360, 768 and 1280 px (NFR-04). |
| Navigation bar (all logged-in screens) | Shows the display name and role from `/auth/me`, the links of that role only, and a "Log out" button. |
| `/` for Administrator | Text: "Signed in as Administrator. Account administration arrives in Sprint 3." No survey links. |
| Session end | After any `401`: token cleared, redirect to `/login` with "Your session has ended. Please log in again." |

Hiding links is a usability aid only; access is enforced by the API (Section 2.5).

---

## 4. API specification

### 4.1 `POST /api/v1/auth/login` (public)

Request:

```json
{ "email": "owner1@example.edu", "password": "<seeded password>" }
```

`200 OK`:

```json
{
  "data": {
    "token": "<jwt>",
    "tokenType": "Bearer",
    "expiresAt": "2026-11-08T10:30:00.000Z",
    "user": { "id": "7c1f…", "displayName": "Owner One", "role": "SURVEY_OWNER" }
  }
}
```

Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`.

### 4.2 `POST /api/v1/auth/logout` (any authenticated role)

Request: no body. `204 No Content`. Errors: `401 UNAUTHENTICATED`.

### 4.3 `GET /api/v1/auth/me` (any authenticated role)

`200 OK`:

```json
{ "data": { "id": "3a9e…", "displayName": "Respondent One", "role": "RESPONDENT" } }
```

Errors: `401 UNAUTHENTICATED`.

### 4.4 Error bodies

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Email or password is incorrect.", "requestId": "…" } }
```

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The request is not valid.",
  "details": [ { "field": "role", "issue": "is not an allowed field" } ], "requestId": "…" } }
```

---

## 5. Data specification

| Item | Specification |
|---|---|
| Tables used | `User` (`id`, `email` unique and lower-case, `displayName`, `passwordHash`, `role`, `isActive`, `createdAt`), `RevokedToken` (`jti` PK, `expiresAt`, `revokedAt`) |
| Migrations | F-01 delivers `0001_initial_schema` (the whole Prisma schema of SDS Section 4.3, so later Sprint 1 features need no migration) and `0002_check_constraints` (the raw SQL constraints of SDS Section 4.4) |
| Seed | `prisma/seed.ts` upserts the six accounts in `README.md` Section 3.3, hashing `SEED_PASSWORD` with `BCRYPT_COST`. Seed surveys are added by F-02 |
| Constraints relied on | Unique `User.email`; enum `Role`; primary key `RevokedToken.jti` |

---

## 6. Acceptance criteria

### AC-F01-01 — Valid login returns a token (FR-05)

**Scenario: a seeded user logs in**
- **Given** the active seeded account `owner1@example.edu` with its seeded password
- **When** the client sends `POST /api/v1/auth/login` with email `Owner1@Example.edu` (different letter case) and the correct password
- **Then** the response is `200` with `tokenType` "Bearer", a token, and `expiresAt` no more than 60 minutes after the request
- **And** `user` contains owner1's id, display name "Owner One" and role `SURVEY_OWNER`
- **And** the token's `sub` claim equals owner1's id and it contains no role claim
- **And** the response body contains no password and no password hash

### AC-F01-02 — Invalid login is rejected without revealing the account (FR-05)

**Scenario Outline: wrong credentials**
- **Given** the seeded account `resp1@example.edu`
- **When** the client sends `POST /api/v1/auth/login` with `<email>` and `<password>`
- **Then** the response is `401` with code `INVALID_CREDENTIALS` and message "Email or password is incorrect."
- **And** no token is returned

| email | password |
|---|---|
| `resp1@example.edu` | a wrong password |
| `nobody@example.edu` (no such account) | any password |

- **And** the two responses have identical `code` and `message`

**Scenario Outline: malformed login request**
- **When** the client sends `POST /api/v1/auth/login` with `<body>`
- **Then** the response is `400 VALIDATION_ERROR` naming `<field>`, and no token is returned

| body | field |
|---|---|
| email only, no password | `password` |
| `{}` | `email`, `password` |
| valid email and password plus `"role": "SURVEY_OWNER"` | `role` |

### AC-F01-03 — Logout revokes the token (FR-06)

**Scenario: user logs out**
- **Given** resp1 is logged in with token T
- **When** the client sends `POST /api/v1/auth/logout` with T
- **Then** the response is `204`
- **And** a later `GET /api/v1/auth/me` with T returns `401 UNAUTHENTICATED` with no user data
- **And** a second `POST /api/v1/auth/logout` with T returns `401`

**Scenario: logout in the UI**
- **Given** resp1 is logged in and on `/available`
- **When** resp1 clicks "Log out"
- **Then** the login screen is shown and the token is no longer in `sessionStorage`
- **And** opening `/available` again redirects to `/login`

### AC-F01-04 — Current user identity comes from the token and the database (FR-07)

**Scenario: identity cannot be spoofed**
- **Given** resp1 is logged in with token T
- **When** the client sends `GET /api/v1/auth/me` with T and a header `X-User-Id` set to owner1's id
- **Then** the response is `200` with resp1's id, display name "Respondent One" and role `RESPONDENT`

**Scenario: role and status are read from the database on each request**
- **Given** resp1 is logged in with token T
- **When** resp1's role is changed to `SURVEY_OWNER` directly in the database and `GET /api/v1/auth/me` is called with T
- **Then** the response shows role `SURVEY_OWNER`
- **When** resp1's `isActive` is set to `false` directly in the database and `GET /api/v1/auth/me` is called with T
- **Then** the response is `401 UNAUTHENTICATED`

**Scenario: the UI shows who is logged in**
- **Given** owner1 has just logged in through `/login`
- **Then** the browser is on `/my-surveys` and the navigation bar shows "Owner One" and "Survey Owner"

### AC-F01-05 — The server-verified role decides what an account can do (BR-08, NFR-05)

**Scenario Outline: wrong role is forbidden**
- **Given** `<user>` is logged in and the seeded survey S-PUB exists
- **When** `<user>` sends `<request>`
- **Then** the response is `403 FORBIDDEN` with no survey or response data
- **And** the number of surveys and responses in the database is unchanged

| user | request |
|---|---|
| owner1 (Survey Owner) | `POST /api/v1/surveys/{S-PUB}/responses` with valid answers |
| resp1 (Respondent) | `POST /api/v1/surveys` with a valid draft |
| resp1 (Respondent) | `GET /api/v1/surveys` |
| admin1 (Administrator) | `GET /api/v1/surveys` |
| admin1 (Administrator) | `GET /api/v1/available-surveys` |

**Scenario Outline: server-owned fields are rejected**
- **Given** owner1 is logged in
- **When** owner1 sends `POST /api/v1/surveys` with a valid draft plus `<field>`
- **Then** the response is `400 VALIDATION_ERROR` naming `<field>`
- **And** no survey is created

| field |
|---|
| `"ownerId": "<owner2's id>"` |
| `"userId": "<owner2's id>"` |
| `"status": "PUBLISHED"` |
| `"role": "ADMIN"` |

---

## 7. Software Test Specification

| Test ID | AC | Level | Preconditions / input | Action | Expected result | Planned file |
|---|---|---|---|---|---|---|
| TEST-F01-01 | AC-F01-01 | API | Test DB with owner1 and resp1 created by the factory | `POST /auth/login` for owner1 with mixed-case email; repeat for resp1 | `200`; decoded token has `sub` = user id, `exp − iat ≤ 3600`, no role claim; `user.role` correct; serialized body contains neither the password nor `$2b$` | `tests/integration/auth.test.ts` › "login: valid credentials" |
| TEST-F01-02 | AC-F01-02 | API | resp1 exists; no `nobody@example.edu` | Login with wrong password; with unknown email; with the three malformed bodies | First two: `401`, same `code` and `message`, no `token` key. Malformed: `400 VALIDATION_ERROR` with the expected `details[].field` | `tests/integration/auth.test.ts` › "login: invalid credentials", "login: malformed body" |
| TEST-F01-03 | AC-F01-03 | API + E2E | resp1 logged in (token T) | API: `POST /auth/logout` with T; `GET /auth/me` with T; logout again with T. E2E: log in as resp1, click "Log out", visit `/available` | API: `204`, then `401`, then `401`; one `RevokedToken` row with T's `jti`. E2E: login screen shown, `sessionStorage` has no token, `/available` redirects to `/login` | `tests/integration/auth.test.ts` › "logout"; `tests/e2e/auth.spec.ts` › "logout" |
| TEST-F01-04 | AC-F01-04 | API + E2E | resp1 logged in (token T); owner1 exists | API: `/auth/me` with `X-User-Id: <owner1 id>`; update role in DB, call `/auth/me`; set `isActive=false`, call `/auth/me`. E2E: log in as owner1 through the UI | API: resp1's identity; then role `SURVEY_OWNER`; then `401`. E2E: URL `/my-surveys`, navigation bar text contains "Owner One" and "Survey Owner" | `tests/integration/auth.test.ts` › "me"; `tests/e2e/auth.spec.ts` › "login shows identity" |
| TEST-F01-05 | AC-F01-05 | API + DB | Seeded accounts, S-PUB; tokens from real login | Table-driven: each wrong-role request of the AC; then `POST /surveys` with each server-owned field | `403` for each wrong-role row and unchanged `Survey`/`Response` counts; `400` naming the field for each server-owned field and unchanged `Survey` count | `tests/integration/rbac-matrix.test.ts` |

TEST-F01-05 runs against the routes that exist when F-01 is merged and is extended in the F-02 and F-03 PRs as their routes are added. It is complete when all Sprint 1 routes are covered.

Related NFR tests delivered with this feature: TEST-NFR-02, TEST-NFR-03, TEST-NFR-08, TEST-NFR-09 (`nfr-test-specification.md`).

---

## 8. Feature Definition of Done

The Product Definition of Done items D-1 to D-10 (`definition-of-done.md`) apply. In addition, F-01 is done when:

- TEST-F01-01 to TEST-F01-05 pass on the PR head commit, and TEST-NFR-02, TEST-NFR-03, TEST-NFR-08 and TEST-NFR-09 pass for the auth routes.
- The initial migrations and the seed run on an empty database with the README commands, creating one account per role.
- A reviewer has confirmed in the PR that no route other than login and health is reachable without a token, and that no code path reads identity from the body, query string or a custom header.
- `.env.example` lists `JWT_SECRET`, `JWT_EXPIRES_MINUTES`, `BCRYPT_COST`, `SEED_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL` and `DB_PASSWORD` with placeholder values only.
