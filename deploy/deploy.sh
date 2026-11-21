#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# GuessLess — Shared Course Cloud Run Deployment Script (Team s40fcb4ce)
# ==============================================================================
# Usage:
#   DRY_RUN=1 bash deploy/deploy.sh   # preview commands without touching GCP
#   DRY_RUN=0 bash deploy/deploy.sh   # build, push, migrate+seed, update service
#
# Portal/TA pre-provisions infrastructure, Cloud SQL, secrets, and IAM on
# project `cpe-se-course-2026` (`asia-southeast1`). Never create or modify
# project-level IAM or delete other teams' resources here.
# ==============================================================================

DRY_RUN="${DRY_RUN:-1}"
PROJECT_ID="${PROJECT_ID:-cpe-se-course-2026}"
[[ "$PROJECT_ID" == "cpe-se-course-2026" ]] || { echo 'Wrong course project' >&2; exit 1; }
REGION="${REGION:-asia-southeast1}"
[[ "$REGION" == "asia-southeast1" ]] || { echo 'Wrong assigned region' >&2; exit 1; }

for arg in "$@"; do
  case "$arg" in
    --demo)
      # Accepted for starter-kit compatibility; GuessLess seeds demo accounts via SEED_PASSWORD.
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--demo]" >&2
      exit 1
      ;;
  esac
done

run_cmd() {
  local arg
  if [ "$DRY_RUN" = "1" ]; then
    printf '[DRY_RUN] '
  else
    printf '+ '
  fi
  for arg in "$@"; do
    case "$arg" in
      --password=*) printf '%s ' '--password=<REDACTED>' ;;
      *) printf '%q ' "$arg" ;;
    esac
  done
  printf '\n'
  if [ "$DRY_RUN" != "1" ]; then
    "$@"
  fi
}

REPO_NAME="s40fcb4ce"
SQL_INSTANCE="s40fcb4ce-pg"
SERVICE_NAME="s40fcb4ce"
MIGRATE_JOB_NAME="s40fcb4ce-migrate"
SA_NAME="s40fcb4ce-runner"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SQL_CONN_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"

if [ "$DRY_RUN" = "1" ]; then
  IMAGE_TAG="${IMAGE_TAG:-0000000000000000000000000000000000000000}"
else
  IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse HEAD)}"
  [[ "$(git branch --show-current)" == "main" ]] || { echo 'Deploy reviewed main only' >&2; exit 1; }
  [[ "$IMAGE_TAG" == "$(git rev-parse HEAD)" ]] || { echo 'IMAGE_TAG must match HEAD' >&2; exit 1; }
fi
[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || { echo 'Use full commit SHA' >&2; exit 1; }
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${IMAGE_TAG}"

# Secret Manager secret names (pre-provisioned by portal; values never stored in repo).
SECRET_DB_URL="s40fcb4ce-database-url"
SECRET_JWT="s40fcb4ce-app-secret-1"
SECRET_SEED_PASS="s40fcb4ce-demo-password"

JOB_SECRETS="DATABASE_URL=${SECRET_DB_URL}:latest,JWT_SECRET=${SECRET_JWT}:latest,SEED_PASSWORD=${SECRET_SEED_PASS}:latest"
SERVICE_SECRETS="DATABASE_URL=${SECRET_DB_URL}:latest,JWT_SECRET=${SECRET_JWT}:latest"
COMMON_ENV_VARS="NODE_ENV=production,TZ=Asia/Bangkok,JWT_EXPIRES_MINUTES=60,BCRYPT_COST=12,ANON_MIN_RESPONSES=5,LOG_LEVEL=info"

echo "=================================================================="
echo "GuessLess Cloud Run Deployment"
echo "Project : ${PROJECT_ID}"
echo "Region  : ${REGION}"
echo "Service : ${SERVICE_NAME}"
echo "Tag     : ${IMAGE_TAG}"
echo "Dry Run : ${DRY_RUN}"
echo "=================================================================="

if [ "$DRY_RUN" != "1" ]; then
  gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" >/dev/null
  gcloud run jobs describe "$MIGRATE_JOB_NAME" --project "$PROJECT_ID" --region "$REGION" >/dev/null
fi

# 1. Build & Push Unified Container Image (embeds APP_VERSION = 40-char commit SHA)
run_cmd gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
run_cmd docker build --platform linux/amd64 --build-arg "APP_VERSION=${IMAGE_TAG}" --tag "$IMAGE_URI" .
run_cmd docker push "$IMAGE_URI"
if [ "$DRY_RUN" != "1" ]; then
  IMAGE_URI="$(gcloud artifacts docker images describe "$IMAGE_URI" --project "$PROJECT_ID" --format='value(image_summary.fully_qualified_digest)')"
  [[ "$IMAGE_URI" == "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}@sha256:"* ]] || { echo 'Missing image digest' >&2; exit 1; }
fi

# 2. Update & Execute Cloud Run Migration + Idempotent Seed Job (aborts on failure)
run_cmd gcloud run jobs update "$MIGRATE_JOB_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets "$JOB_SECRETS" \
  --set-env-vars "$COMMON_ENV_VARS" \
  --command "sh" \
  --args "-c,npx --no-install prisma migrate deploy && npm run seed" \
  --max-retries 1 \
  --task-timeout 300s \
  --project "$PROJECT_ID"

if ! run_cmd gcloud run jobs execute "$MIGRATE_JOB_NAME" \
  --region "$REGION" \
  --wait \
  --project "$PROJECT_ID"; then
  printf '%s\n' "ERROR: Cloud Run migration job '${MIGRATE_JOB_NAME}' failed. Aborting service deployment." >&2
  printf '%s\n' "View job logs with:" >&2
  printf '%s\n' "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${MIGRATE_JOB_NAME}\" --project \"${PROJECT_ID}\" --limit 50 --format=\"value(textPayload)\"" >&2
  exit 1
fi

# 3. Update Cloud Run Service (port 8080; APP_VERSION stays baked inside the image)
run_cmd gcloud run services update "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --add-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets "$SERVICE_SECRETS" \
  --set-env-vars "$COMMON_ENV_VARS" \
  --min-instances 0 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --port 8080 \
  --project "$PROJECT_ID"

run_cmd gcloud run services update-traffic "$SERVICE_NAME" --to-latest --project "$PROJECT_ID" --region "$REGION" --quiet

if [ "$DRY_RUN" = "1" ]; then
  SERVICE_URL="https://${SERVICE_NAME}-<hash>-as.a.run.app"
else
  SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
fi

printf '\n'
printf '%s\n' "=================================================================="
printf '%s\n' "Deployment Completed!"
printf '%s\n' "Service URL    : ${SERVICE_URL}"
printf '%s\n' "Health Check   : ${SERVICE_URL}/api/v1/health"
printf '%s\n' "Readiness Check: ${SERVICE_URL}/api/ready"
printf '%s\n' "Seed Accounts  : owner1@example.edu, resp1@example.edu, admin1@example.edu"
printf '%s\n' "Seed Password  : Stored in Secret Manager: ${SECRET_SEED_PASS} (not printed)."
printf '%s\n' "JWT Secret     : Stored in Secret Manager: ${SECRET_JWT} (not printed)."
printf '%s\n' "=================================================================="