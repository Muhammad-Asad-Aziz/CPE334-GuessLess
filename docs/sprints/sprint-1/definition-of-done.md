# Product Definition of Done

**Product:** Survey and Feedback System (Theme 10: Review, Feedback, and Survey System)
**File:** `docs/sprints/sprint-1/definition-of-done.md` | **Version:** 1.0 (approved) | **Date:** 12 November 2026
**Applies to:** every feature and every sprint release (Sprints 1–3); Sprint 1 is the first use

| Role | Name | Student ID |
|---|---|---|
| Author 1 | Muhammad Asad Aziz | 67070503472 |
| Author 2 | Al Xander James Codino Ybanez | 67070503450 |

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-07 | Muhammad Asad Aziz (Author 1, AI-assisted draft) | Initial Product Definition of Done |
| 1.0 | 2026-11-12 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Partner review complete; Product Definition of Done approved by both authors |

---

## 1. Principle

A feature or release is **done** only when every item below is met **and the evidence named for it exists**. A statement by a developer or an AI agent that something works is not evidence. Anything not done is reported as incomplete, with the reason, in the deliverable; it is never hidden by disabling, skipping or weakening a test.

---

## 2. Feature Definition of Done

Applies to each feature (F-xx) before its PR is merged into the sprint staging branch.

| ID | Criterion | Evidence required |
|---|---|---|
| D-1 | **Contract before code.** The feature contract (design, UI/API/data specification, AC, STS, feature DoD) is approved by both authors and committed as v1.0 before the first implementation commit for the feature. | Commit id and date of the contract, earlier than the first implementation commit; link in the Issue |
| D-2 | **Behavior implemented as specified.** Every AC of the feature is implemented in every layer the contract names (UI, API, database). Any deviation is made by a new contract version with a reason, not silently. | PR diff; contract revision history |
| D-3 | **Planned tests implemented and meaningful.** Every test in the feature's STS exists at its planned level and asserts the observable outcome stated in the AC (status code, response body, database state or UI text). Persistence and permissions are tested against the real test database, not mocks. | Test files and names, mapped to TEST IDs in `docs/traceability.md` Section 5 |
| D-4 | **TDD for rule work.** For each test marked TDD, a commit adds the test and shows it failing; a later commit makes it pass. | Two commit ids per rule with test output (red, then green) |
| D-5 | **Negative, boundary and access cases covered.** Every new or changed endpoint has tests for no token (401), wrong role (403) and another user's record or a non-existent id (404) where applicable, and for its boundary values. | Test names in the STS; NFR-03 and NFR-05 suites include the new routes |
| D-6 | **All checks pass locally.** Type-check, lint, unit, API and E2E suites pass on the PR's head commit with no skipped required test. | Command output with pass/fail/skip counts and the commit id, attached to the PR |
| D-7 | **Reviewed by the teammate.** The PR into the sprint staging branch is reviewed by the student who did not author it. The review records at least one specific check, question, finding or reason for approval. Authors never approve their own PR. | PR review comments and approval |
| D-8 | **Traceable.** The Issue names the feature, its contract and its AC; the branch is created from the sprint staging branch; the PR links the Issue. | Issue, branch name, PR link |
| D-9 | **Documents current.** The contract, `docs/traceability.md` status, the README (if setup changed), `.env.example` (if configuration changed) and the SDS (if the design changed) match the merged code. | Diff of the documents in the same PR or a linked PR |
| D-10 | **No secrets.** No real password, token, key or connection string is committed or shown in screenshots. | Secret-scan result; review of `.env.example` |

---

## 3. Release Definition of Done

Applies to each sprint release from the staging branch into `main`.

| ID | Criterion | Evidence required |
|---|---|---|
| R-1 | **All features of the sprint meet the Feature DoD**, or are explicitly reported as incomplete with the missing AC. | Completion table in the deliverable |
| R-2 | **Integration and system checks pass on the staging branch.** The full suite and the acceptance journey of the sprint run on the release candidate commit. Earlier sprints' journeys still pass (regression). | Test output with counts, tested commit id |
| R-3 | **NFR verification executed** for every NFR allocated to the sprint, with its result compared to the measurable target. | TEST-NFR results with values (for example the measured p95) |
| R-4 | **Reviewed release PR** from the staging branch into `main`, approved by the teammate. | PR link and review |
| R-5 | **Release recorded.** The merge commit on `main` is tagged (`v0.1.0` for Sprint 1) and the tag, commit and date are recorded. From Lab 5 on, the same commit is deployed through the pipeline. | Tag, commit id; deployment record from Lab 5 |
| R-6 | **Reproducible.** A clean checkout reaches a running application with seeded accounts for each role and a passing required suite in at most 6 README commands (NFR-10). | Walkthrough output (TEST-NFR-10) |
| R-7 | **Status recorded honestly.** `docs/traceability.md` shows, for every AC and NFR of the sprint, the actual test file, result and commit; failed, skipped or moved items and known defects are listed. | Updated traceability matrix and change log |
| R-8 | **Evidence captured** for the deliverable: the normal journey with persisted retrieval, a business-rule rejection, login/logout and a forbidden role or ownership operation, each labelled with feature/AC IDs and the release commit. | Screenshots and API test excerpts in the deliverable PDF |

---

## 4. Sprint 1 application

For Sprint 1, R-3 covers NFR-01 to NFR-10 (see `nfr-test-specification.md`), R-5 uses tag `v0.1.0`, and R-8 follows Deliverable 1 Part F. Docker, CI and GCP deployment become part of R-2 and R-5 from Lab 5 onwards; before that, local test output tied to the release commit is the required evidence.
