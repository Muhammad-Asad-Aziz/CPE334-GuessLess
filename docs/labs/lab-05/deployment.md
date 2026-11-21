# Lab 5 Deployment & Release Guide — GuessLess

**Product:** Survey and Feedback System (`CPE334-GuessLess`, Theme 10)  
**Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents, Semester 1/2026  
**Authors:** Muhammad Asad Aziz (67070503472) & Al Xander James Codino Ybanez (67070503450)  
**Repository:** https://github.com/Muhammad-Asad-Aziz/CPE334-GuessLess

---

## 1. Stack & Changes from the Reference (`TokTickIT`)

| Area | Reference (`TokTickIT`) | GuessLess (`CPE334-GuessLess`) |
|---|---|---|
| Architecture | Single container (Node.js API + built React SPA) | Single multi-stage container (Express TypeScript API + built Vite/React SPA served from `client/dist`) |
| Workspace layout | Separate `server/` and `client/` | npm workspaces monorepo (`package.json` at root, `server/`, `client/`) |
| Database & ORM | PostgreSQL 16 + Prisma | PostgreSQL 16 + Prisma (`server/prisma/schema.prisma`, migrations `0001`, `0002`, idempotent `server/prisma/seed.ts`) |
| HTTP port | `3000` | `8080` (`PORT` env var, bound to `0.0.0.0`) |
| Health & readiness | `/api/health`, `/api/ready` | `/api/v1/health` (canonical, returns `{ status, db, version }`), `/api/health` (alias), `/api/ready` (`200` / `503`) |
| Auth & sessions | DB sessions | Stateless JWT (`HS256`, `<= 60 min`) + PostgreSQL `RevokedToken` table; live `role`/`isActive` DB lookup |
| GCP provisioning | Personal Free Trial + `deploy.sh` creating infra | Course Shared GCP Portal (`cpe-se-course-2026`, prefix `s40fcb4ce`); portal pre-provisions Cloud SQL, Artifact Registry, Cloud Run service/job, Secret Manager, and WIF |

---

## 2. Environment Variables & Secrets (`R-02`)

All settings are read from environment variables and validated at startup by `server/src/config/env.ts`. `.env` is gitignored; `.env.example` contains placeholders only. **No real secret is ever committed to Git, baked into Docker images, or placed in plain Cloud Run env vars.**

| Variable | Purpose | Secret? | Source (Local) | Source (GCP Cloud Run) |
|---|---|---|---|---|
| `NODE_ENV` | Runtime mode (`development` / `production` / `test`) | No | `.env` | Cloud Run env var (`production`) |
| `PORT` | HTTP listen port (`0.0.0.0`) | No | `.env` (`8080`) | Cloud Run (`--port 8080`, injected automatically) |
| `TZ` | Container timezone | No | Optional | Cloud Run env var (`Asia/Bangkok`) |
| `DB_PASSWORD` | Local PostgreSQL container password (`docker-compose.yml` only) | Yes | `.env` (local only) | Unused on GCP |
| `DATABASE_URL` | PostgreSQL connection string (Unix socket on Cloud Run) | **Yes** | `.env` | Secret Manager: `s40fcb4ce-database-url:latest` |
| `TEST_DATABASE_URL` | Separate test DB for Vitest integration tests (required only when `NODE_ENV=test`) | Yes (local/CI) | `.env` / GitHub Actions CI | Unused on Cloud Run |
| `JWT_SECRET` | HS256 JWT signing secret (`>= 32` characters, fail-fast validated) | **Yes** | `.env` | Secret Manager: `s40fcb4ce-app-secret-1:latest` |
| `JWT_EXPIRES_MINUTES` | JWT lifetime (`1–60` minutes) | No | `.env` (`60`) | Cloud Run env var (`60`) |
| `BCRYPT_COST` | Password hashing cost (`>= 10` outside `test`, default `12`) | No | `.env` (`12`) | Cloud Run env var (`12`) |
| `ANON_MIN_RESPONSES` | Small-group suppression threshold (`BR-11`) | No | `.env` (`5`) | Cloud Run env var (`5`) |
| `LOGIN_RATE_MAX_FAILED` | Login throttling max failed attempts (Sprint 3) | No | `.env` (`10`) | Cloud Run env var (`10`) |
| `LOGIN_RATE_WINDOW_SECONDS` | Login throttling window in seconds (Sprint 3) | No | `.env` (`60`) | Cloud Run env var (`60`) |
| `SEED_PASSWORD` | Password applied to seeded demo accounts (`owner1`, `owner2`, `resp1`–`resp3`, `admin1`) | **Yes** | `.env` | Secret Manager: `s40fcb4ce-demo-password:latest` *(migration job only)* |
| `APP_VERSION` | Deployed Git commit SHA returned by `/api/v1/health` | No | `.env` (`dev`) | Baked into Docker image via `--build-arg APP_VERSION=<40-char-SHA>` |
| `LOG_LEVEL` | Pino log verbosity (`info`) | No | `.env` (`info`) | Cloud Run env var (`info`) |

---

## 3. Local Build, Test, Run, Migrate & Seed Commands (`C-03`)

### Standard development (without app container)
```bash
cp .env.example .env            # fill in local placeholder values (JWT_SECRET >= 32 chars)
docker compose up -d db
npm run setup
npm run seed
npm run dev
npm test
```

### Full containerized run from a clean clone (Docker Compose)
```bash
cp .env.example .env            # set JWT_SECRET (>= 32 chars) and SEED_PASSWORD locally
docker compose up --build -d
docker compose ps -a            # db & app running, migrate Exited (0)
curl --fail http://localhost:8080/api/v1/health
curl --fail http://localhost:8080/api/ready
```

### Persistence check (Docker Compose)
```bash
docker compose down             # keeps pgdata volume
docker compose up -d            # previously created surveys/responses remain retrievable
```

---

## 4. GCP Project & Pre-Provisioned Team Resources

Provisioned via the CPE334 Student Cloud Portal:

| Resource | Name / Value |
|---|---|
| GCP Project ID | `cpe-se-course-2026` |
| Region | `asia-southeast1` |
| Team Prefix | `s40fcb4ce` |
| Cloud Run Service | `s40fcb4ce` |
| Cloud Run Migration Job | `s40fcb4ce-migrate` |
| Cloud SQL Instance (PostgreSQL 16) | `s40fcb4ce-pg` (DB & user: `s40fcb4ce`) |
| Artifact Registry Repository | `asia-southeast1-docker.pkg.dev/cpe-se-course-2026/s40fcb4ce` |
| Runtime Service Account | `s40fcb4ce-runner@cpe-se-course-2026.iam.gserviceaccount.com` |
| Secret Manager Secrets | `s40fcb4ce-database-url`, `s40fcb4ce-demo-password`, `s40fcb4ce-app-secret-1` (`JWT_SECRET`) |
| Public Cloud Run URL | `https://s40fcb4ce-4d7hbszvwq-as.a.run.app/` |

> **Shared-project safety:** Never modify, redeploy, or delete resources outside prefix `s40fcb4ce`, and never run `teardown.sh`. Contact a TA for pause or cleanup.

---

## 5. Repeatable Release Procedure (`R-07`, `R-08`)

### Normal release (automatic via GitHub Actions)
1. Open a labelled (`lab5`) GitHub Issue and branch from `staging`.
2. Open a Pull Request into `staging`; `.github/workflows/ci-docker.yml` (`test-and-docker`) runs deploy-script tests, Prisma migrations, TypeScript checks, Vitest unit/integration tests, frontend build, and Docker build.
3. Teammate reviews with specific checks and approves; merge into `staging`.
4. Open a Release Pull Request from `staging` into `main` (`protect-main` ruleset enforces 1 approval + up-to-date green `test-and-docker`).
5. Merging into `main` automatically triggers `.github/workflows/deploy.yml` (`Deploy demo`):
   - Re-runs `ci-docker.yml` (`test-and-docker`).
   - Authenticates to GCP via Workload Identity Federation (`environment: demo`, no JSON keys).
   - Builds and pushes `asia-southeast1-docker.pkg.dev/cpe-se-course-2026/s40fcb4ce/s40fcb4ce:<40-char-SHA>` with `--build-arg APP_VERSION=<40-char-SHA>`.
   - Runs `deploy/release.sh`: resolves immutable `@sha256` digest → updates & executes `s40fcb4ce-migrate` (`prisma migrate deploy && npm run seed`) with `--wait` → updates `s40fcb4ce` service to the same digest and routes 100% traffic to latest.
   - Executes `python3 deploy/smoke_test.py "$SERVICE_URL"` (`/api/v1/health`, `/api/ready`, `/`, optional non-admin login/me/logout).

### Rollback / roll-forward
1. Open **GitHub Actions → `Deploy demo` → Run workflow** on branch **`main`**.
2. Paste the full **40-character commit SHA** of an earlier (or newer) built image into `image_tag` and click **Run workflow**.
3. `test`, Docker build, and database migration are automatically skipped; Cloud Run switches 100% traffic to the existing `@sha256` image digest and runs `smoke_test.py`. Database records remain intact.

### How to verify which commit is running (`R-08`)
1. **Live API:** `curl -s <PUBLIC_URL>/api/v1/health` → check the `"version"` field equals the 40-character Git commit SHA.
2. **GitHub Actions Summary:** Open the latest green **Deploy demo** run → check `Commit image tag` and `Digest`.
3. **Google Cloud Console:** Open **Cloud Run → `s40fcb4ce` → Revision history** → confirm the latest revision (`100%` traffic) container digest matches **Artifact Registry → `s40fcb4ce` → `s40fcb4ce`** tagged with the same 40-character commit SHA.