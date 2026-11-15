# Three-Sprint Plan

**Product:** Survey and Feedback System (Theme 10: Review, Feedback, and Survey System)
**Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents, Semester 1/2026
**File:** `docs/sprints/plan.md` | **Version:** 1.0 (approved baseline) | **Date:** 12 November 2026
**Baseline:** `docs/srs.md` v1.0, `docs/features.md` v1.0, `docs/traceability.md` v1.0, `docs/system-sds.md` v1.0

| Role | Name | Student ID |
|---|---|---|
| Author 1 | Muhammad Asad Aziz | 67070503472 |
| Author 2 | Al Xander James Codino Ybanez | 67070503450 |

**Repository:** https://github.com/Muhammad-Asad-Aziz/CPE334-GuessLess

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-07 | Muhammad Asad Aziz (Author 1, AI-assisted draft) | Initial three-sprint plan: goals, features, dependencies, completion outcomes, Sprint 1 scope and priorities, labs and checkpoints |
| 1.0 | 2026-11-12 | Muhammad Asad Aziz & Al Xander James Codino Ybanez | Partner review complete; sprint allocations and feature leads confirmed by both authors; aligned with v1.0 baseline documents |

---

## 1. Purpose

This plan allocates the whole product baseline (FR-01 to FR-21, BR-01 to BR-14, NFR-01 to NFR-12) to three sprints. For each sprint it states the goal, the included features, the dependencies and the completion outcome. Requirement-level allocation and verification are in `docs/traceability.md`; feature scope is in `docs/features.md`.

Both authors have approved this plan, fixing the sprint allocations across `docs/srs.md`, `docs/features.md` and `docs/traceability.md`. Any later move of a feature or requirement between sprints is recorded as a change in `docs/traceability.md` Section 7; scope is never reduced silently.

---

## 2. Overview

| Sprint | Dates | Goal | Features | Checkpoint |
|---|---|---|---|---|
| **1** | Until 8 Nov 2026 | A small working identified-survey slice with authentication, server-side permissions and persistence | F-01, F-02, F-03, F-04 | Deliverable 1, 8 Nov: release tagged on `main` |
| **2** | 9 – 29 Nov 2026 | Complete the core product: draft editing, scheduled close, eligibility, more question types and the anonymous mode | F-05, F-06, F-07 | Lab 5 (15 Nov), Lab 6 (22 Nov), Lab 7 and Deliverable 2 (29 Nov): Sprint 2 complete and deployed |
| **3** | Contracts and first workflow by 29 Nov; complete by 13 Dec 2026 | Remaining features, integration and product hardening | F-08, F-09, SR-06, final verification of SR-03 | Deliverable 2 (progress, 29 Nov); Final Delivery (13 Dec) |

Every sprint follows the course workflow: an Issue per feature or fix, a feature branch from the sprint staging branch (`sprint-1`, `sprint-2`, `sprint-3`), a PR reviewed by the teammate, integration tests on the staging branch, a reviewed release PR into `main`, and a recorded tag. Each feature's contract (design, AC, STS, DoD) is committed before its implementation starts.

---

## 3. Sprint 1: Core vertical slice

### 3.1 Goal

A Survey Owner and a Respondent can complete the whole identified-survey journey through the UI, the API and the database, with real login and logout, role checks and ownership checks on the server, and with the main business-rule rejections tested.

### 3.2 Included features

| Feature | Requirements | Depends on | Lead | Reviewer |
|---|---|---|---|---|
| F-01 Authentication, session revocation and role guard | FR-05, FR-06, FR-07, BR-08 (BR-13 mechanism) | None | Muhammad | Al Xander |
| F-02 Survey creation, lifecycle and owner management | FR-01, FR-02, FR-10, FR-11, BR-03, BR-04, BR-05 | F-01 | Al Xander | Muhammad |
| F-03 Survey discovery, submission and respondent history | FR-03, FR-08, FR-09, BR-01, BR-02, BR-06, BR-07 | F-01, F-02 | Muhammad | Al Xander |
| F-04 Aggregate results summary | FR-04, BR-05, BR-07 | F-01, F-02, F-03 | Al Xander | Muhammad |
| SR-01 to SR-05 System responsibilities | NFR-01 to NFR-10 (established); NFR-12 built into the Sprint 1 screens | Built alongside F-01 to F-04 | Both | Both |

"Lead" means the student who drives the Issue; both students specify, implement, test and review across the sprint, and pair work is recorded in the Issue or PR.

### 3.3 Why this is the Sprint 1 scope

The scope follows the Theme 10 Sprint 1 example in the group work specification and adds only what is needed to make that journey demonstrable and testable:

| Theme 10 Sprint 1 example | Covered by |
|---|---|
| A survey owner logs in, creates and publishes a small identified survey | F-01 (FR-05), F-02 (FR-01, FR-02) |
| An eligible respondent logs in, submits a validated response and sees confirmation | F-03 (FR-03, BR-06) |
| The owner views an aggregate summary | F-04 (FR-04) |
| Reject repeat submissions and responses to unpublished or closed surveys | BR-01, BR-02, NFR-06 (F-03) |
| Respondent and Survey Owner roles; owners manage only their own surveys; respondents cannot edit surveys or see another respondent's answers | BR-05, BR-07, BR-08, NFR-05 |
| Logout and current-user identity (common requirement, Section 5.2) | FR-06, FR-07 |

Added because the journey needs them: closing a survey (FR-11), so that the closed-survey rejection can be shown; listing the owner's surveys (FR-10), so the owner can find a survey in the UI; and listing and viewing one's own submission (FR-09), because Deliverable 1 requires retrieving the saved result.

Deliberately left out of Sprint 1: anonymous mode (the specification allows it later, and it needs the separate privacy design in SDS Section 4.6), editing and deleting drafts, scheduled close dates, eligibility lists, multiple-choice and free-text questions, individual-response views, filtering, export and account administration.

### 3.4 Sprint 1 priorities and contingency

The slice is small in features but carries most of the NFR foundation. Work is done in this order of priority. If time runs short, items in the "Can move" group are moved first, each through a recorded change in `docs/traceability.md` Section 7, and are disclosed as incomplete in Part F.

| Priority | Items | Reason |
|---|---|---|
| **Must** (required by the Deliverable 1 specification or the Theme 10 example) | Login, logout, `/auth/me` (FR-05 to FR-07); create, publish, close (FR-01, FR-02, FR-11); browse and submit (FR-08, FR-03); view own submission (`my-response`, FR-09); summary (FR-04); BR-01 to BR-08; NFR-02, NFR-03, NFR-05, NFR-06, NFR-08, NFR-09 start-up check, NFR-10; one E2E journey | Without these the Sprint 1 outcome in Section 3.5 is not met |
| **Should** | List my surveys (FR-10); NFR-07 restart test; NFR-04 automated viewport check | Needed for a usable UI and planned verification, but each can fall back to a smaller check |
| **Can move** (by recorded change) | `GET /api/v1/my-responses` list (CHG-09) to Sprint 2; NFR-01 benchmark to Sprint 3 (it is re-measured there anyway); NFR-09 history secret scan to Lab 5 CI; `GET /api/v1/responses/{responseId}` (duplicates `my-response`) to Sprint 2 | Not needed to demonstrate the Sprint 1 journey, a rule rejection or an access restriction |

Order of work, following the dependencies: commit the baseline documents and create the `sprint-1` staging branch; commit the four Sprint 1 contracts before any feature code; implement F-01, then F-02, then F-03 and F-04, writing the failing rule test first for BR-01, BR-02, BR-03, BR-04 and BR-06; integrate on `sprint-1`, run the full suite and the acceptance checks; open the release PR into `main` and tag the release.

### 3.5 Completion outcome

- Release on `main` with tag `v0.1.0`, recorded in Deliverable 1.
- The Sprint 1 journey in SRS Section 1.4 works through the UI, API and database, and the saved survey, response and summary are retrieved again after an application restart.
- Every Sprint 1 AC in `docs/traceability.md` Section 5 has an executed result on the release commit; failed, skipped or moved items are disclosed.
- Valid and invalid login, unauthenticated requests, wrong-role requests and other-user records are covered by automated API tests.
- Each feature has a reviewed Issue, branch and PR into `sprint-1`, and the release PR into `main` is reviewed by the teammate.
- The README reproduces setup, migration, seed and tests in at most 6 commands.

---

## 4. Sprint 2: Core expansion

### 4.1 Goal

Complete the survey workflow an institution needs: owners can edit and delete drafts, schedule a close date and restrict eligibility; surveys can use multiple-choice and free-text questions; and surveys can run in an anonymous mode whose privacy is enforced by the data design. At the same time the Sprint 1 release is containerized, deployed and independently tested in Labs 5 to 7.

### 4.2 Included features

| Feature | Requirements | Depends on | Lead | Reviewer |
|---|---|---|---|---|
| F-07 Privacy-by-design anonymous mode | FR-17, FR-04 and FR-09 (anonymous variants), BR-01 (anonymous), BR-10, BR-11, BR-14 | F-02, F-03, F-04 | Pair (both) | Both, with a recorded review of the privacy tests |
| F-05 Draft editing, deletion, scheduled close and eligibility | FR-12, FR-13, FR-14, FR-15, BR-02, BR-03, BR-04, BR-09, BR-12 | F-02, F-03 | Al Xander | Muhammad |
| F-06 Multiple-choice and free-text questions | FR-16, BR-06 | F-02, F-03, F-04 | Muhammad | Al Xander |

F-07 is started first because it is the riskiest work: it changes the response data path and is the theme's documented privacy requirement. F-05 and F-06 depend neither on each other nor on F-07, so they run in parallel with it. Target: all Sprint 2 features merged into `sprint-2` by 26 Nov, leaving 27 – 29 Nov for the release, deployment and Deliverable 2 evidence.

### 4.3 Dependencies and constraints

- All three features build on the Sprint 1 release (F-02, F-03, F-04).
- The F-07 schema already exists from Sprint 1 (`Participation`, nullable identity columns, check constraints, SDS Section 4.4); Sprint 2 adds the anonymous write path, suppression (BR-11, BR-14) and their tests.
- **Labs in this sprint:** Lab 5 (CI, Docker, GCP deployment of the Sprint 1 release, due 15 Nov), Lab 6 (cross-team UAT and defect fixes, due 22 Nov) and Lab 7 (one TA-approved change to implemented behavior, due 29 Nov). Lab work uses its own Issues and branches and is kept separate from feature work. After Lab 5, every Sprint 2 merge to `main` goes through CI and the deployment pipeline.
- Sprint 3 contracts must also be written in this period (Section 5.4).

### 4.4 Completion outcome

- All Sprint 2 features complete, reviewed, integrated and verified against their contracts; release on `main` tagged `v0.2.0` and deployed on GCP through the Lab 5 pipeline.
- The Sprint 1 journey still works on the new release (regression).
- New endpoints have 401, 403 and 404 tests (NFR-05 extended).
- Anonymous mode evidence: a database row inspection shows no respondent reference on anonymous responses; results stay hidden until the survey closes; fewer than 5 responses show only the total.
- Defects found in Lab 6 and the Lab 7 change are recorded with their status.

---

## 5. Sprint 3: Completion and hardening

### 5.1 Goal

Finish the remaining features (individual responses, filtered analysis, export and account administration), harden login and accessibility, and verify the integrated product on its final deployment.

### 5.2 Included features

| Feature | Requirements | Depends on | Lead | Reviewer |
|---|---|---|---|---|
| F-09 Administrator account governance | FR-21, BR-08, BR-13 | F-01 | Al Xander | Muhammad |
| F-08 Individual responses, date-filtered analysis and CSV export | FR-18, FR-19, FR-20, BR-05, BR-10, BR-11, BR-14 | F-04, F-06, F-07 | Muhammad | Al Xander |
| SR-06 Login throttling | NFR-11 | F-01 | Al Xander | Muhammad |
| SR-03 Accessibility verification | NFR-12 (final verification) | Sprint 1 and 2 screens | Muhammad | Al Xander |
| Final NFR re-verification | NFR-01, NFR-04, NFR-07 on GCP | Deployed release | Both | Both |

### 5.3 Dependencies and constraints

- F-08 needs F-06 (free-text and multiple-choice in exports) and F-07 (anonymous rules), so it starts only after Sprint 2 is released.
- F-09 needs only F-01; the active-account check it relies on already exists from Sprint 1. It is therefore the Sprint 3 workflow implemented first, to show working Sprint 3 progress at Deliverable 2.
- The final examination period is 1 – 11 Dec. The main Sprint 3 workflows are implemented before 1 Dec; the period after the examinations is for defect fixes, final verification, UAT re-tests and the demonstration video, not for main features.

### 5.4 Milestones

| Date | Milestone |
|---|---|
| 23 – 28 Nov | Contracts, AC and STS for F-08, F-09 and SR-06 committed, in parallel with the end of Sprint 2 |
| By 29 Nov | F-09 implemented and tested in the Deliverable 2 candidate; remaining-work list with owners and dates |
| 29 Nov – 1 Dec | F-08 (FR-18 first, then FR-19 and FR-20) and SR-06 implemented |
| 1 – 11 Dec | Final examinations: only bounded fixes |
| 12 – 13 Dec | Final regression on the deployed release, NFR re-measurement on GCP, UAT re-tests, final release, video |

### 5.5 Completion outcome

- Every FR, BR and NFR in the baseline has a final status in `docs/traceability.md` (Verified, or disclosed as failed or incomplete).
- Release on `main` tagged `v1.0.0`, deployed on GCP from the pipeline, with durable data after restart and redeployment.
- Final regression suite passing on the final commit; UAT re-tests recorded; known defects and debt listed.

---

## 6. Baseline coverage by sprint

| Sprint | Features | Functional requirements | Business rules | Non-functional requirements |
|---|---|---|---|---|
| 1 | F-01 – F-04, SR-01 – SR-05 | FR-01 – FR-11 | BR-01 – BR-08 (BR-13 mechanism built) | NFR-01 – NFR-10 established and verified; NFR-12 built into the Sprint 1 screens |
| 2 | F-05 – F-07 | FR-12 – FR-17; anonymous variants of FR-04 and FR-09; FR-08 extended | BR-09 – BR-12, BR-14; BR-01 – BR-04 and BR-06 extended | NFR-05 extended to new endpoints; first GCP checks of NFR-07 in Lab 5 |
| 3 | F-08, F-09, SR-06, SR-03 (final) | FR-18 – FR-21 | BR-13; BR-05, BR-10, BR-11 and BR-14 extended | NFR-11 and NFR-12 verified; NFR-01, NFR-04 and NFR-07 re-verified on GCP |
| **Total** | 9 features, 6 system responsibilities | **21 / 21** | **14 / 14** | **12 / 12** |

No baseline requirement is unallocated. The detailed requirement-to-test mapping is in `docs/traceability.md`.

---

## 7. Plan risks

| Risk | Effect | Response |
|---|---|---|
| Sprint 1 time is short (deadline 8 Nov) | Required evidence missing in Deliverable 1 | Follow the priorities in Section 3.4; move "Can move" items by recorded change; disclose incomplete work |
| Labs 5 – 7 compete with Sprint 2 feature work | Sprint 2 incomplete on 29 Nov | Start F-07 first; keep lab work on its own Issues; Lab 7's change can target Sprint 1 behavior already released |
| The anonymous-mode design is wrong or leaks identity | Privacy requirement (FR-17, BR-10) failed | Schema enforces it from Sprint 1; F-07 is paired work with privacy tests written first |
| Final examinations (1 – 11 Dec) | No time for main features | Main Sprint 3 workflows before 1 Dec; only fixes and verification afterwards |
| Instructor/TA feedback or Lab 6/7 findings require a baseline or contract change | Rework of affected feature or rule | Recorded as a change in `docs/traceability.md` Section 7; affected contracts and tests revised before implementation |
