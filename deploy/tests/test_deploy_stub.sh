#!/usr/bin/env bash
# Offline regression checks for portal-adapted deploy/deploy.sh (team s40fcb4ce).
# Uses local stubs for gcloud, docker, and git — zero GCP or Docker calls.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/../deploy.sh"
TEST_STATE_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_STATE_DIR"' EXIT
mkdir -p "$TEST_STATE_DIR/bin"

TEST_SHA="1111111111111111111111111111111111111111"

cat > "$TEST_STATE_DIR/bin/git" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  'rev-parse HEAD') echo "${STUB_SHA:-1111111111111111111111111111111111111111}" ;;
  'branch --show-current') echo "${STUB_BRANCH:-main}" ;;
  *) echo "unexpected git call: $*" >&2; exit 1 ;;
esac
STUB

cat > "$TEST_STATE_DIR/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf 'docker %s\n' "$*" >> "$CALL_LOG"
STUB

cat > "$TEST_STATE_DIR/bin/gcloud" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'gcloud %s\n' "$*" >> "$CALL_LOG"
case "$*" in
  'artifacts docker images describe '*)
    echo "asia-southeast1-docker.pkg.dev/cpe-se-course-2026/s40fcb4ce/s40fcb4ce@sha256:abcdef012345" ;;
  'run jobs execute '*)
    [ "${STUB_MODE:-normal}" != "job-fail" ]
    exit $? ;;
  'run services describe '*)
    echo "https://s40fcb4ce-stub.example.invalid" ;;
esac
STUB

chmod +x "$TEST_STATE_DIR/bin/git" "$TEST_STATE_DIR/bin/docker" "$TEST_STATE_DIR/bin/gcloud"
export PATH="$TEST_STATE_DIR/bin:$PATH"
export PROJECT_ID="cpe-se-course-2026"
export REGION="asia-southeast1"
export STUB_SHA="$TEST_SHA"
export STUB_BRANCH="main"

# 1. Normal deployment on main
export CALL_LOG="$TEST_STATE_DIR/normal.log"
: > "$CALL_LOG"
DRY_RUN=0 STUB_MODE=normal bash "$DEPLOY_SCRIPT" > "$TEST_STATE_DIR/normal.out" 2>&1
grep -q "docker build --platform linux/amd64 --build-arg APP_VERSION=${TEST_SHA}" "$CALL_LOG"
grep -q "gcloud run jobs update s40fcb4ce-migrate " "$CALL_LOG"
grep -q "gcloud run jobs execute s40fcb4ce-migrate .*--wait" "$CALL_LOG"
grep -q "gcloud run services update s40fcb4ce .*--port 8080" "$CALL_LOG"
grep -q "gcloud run services update-traffic s40fcb4ce --to-latest" "$CALL_LOG"
if grep -Eq '(sql instances create|secrets create|add-iam-policy-binding)' "$CALL_LOG"; then
  echo 'FAIL: deploy.sh attempted infra or IAM creation' >&2
  exit 1
fi
echo 'PASS: normal deployment updates job and service on port 8080 without infra/IAM creation'

# 2. Migration failure blocks service update
export CALL_LOG="$TEST_STATE_DIR/job-fail.log"
: > "$CALL_LOG"
if DRY_RUN=0 STUB_MODE=job-fail bash "$DEPLOY_SCRIPT" > "$TEST_STATE_DIR/job-fail.out" 2>&1; then
  echo 'FAIL: expected non-zero exit when migration job fails' >&2
  exit 1
fi
if grep -q 'gcloud run services update ' "$CALL_LOG"; then
  echo 'FAIL: service was updated after migration failure' >&2
  exit 1
fi
echo 'PASS: migration failure aborts before service update'

# 3. Wrong course project rejected before any calls
export CALL_LOG="$TEST_STATE_DIR/wrong-project.log"
: > "$CALL_LOG"
if PROJECT_ID="wrong-project" DRY_RUN=0 bash "$DEPLOY_SCRIPT" > /dev/null 2>&1; then
  echo 'FAIL: wrong project was accepted' >&2
  exit 1
fi
test ! -s "$CALL_LOG"
echo 'PASS: wrong course project rejected before GCP calls'

# 4. Non-main branch rejected in real deploy mode
export CALL_LOG="$TEST_STATE_DIR/non-main.log"
: > "$CALL_LOG"
if STUB_BRANCH="staging" DRY_RUN=0 bash "$DEPLOY_SCRIPT" > /dev/null 2>&1; then
  echo 'FAIL: non-main branch was accepted' >&2
  exit 1
fi
test ! -s "$CALL_LOG"
echo 'PASS: non-main branch rejected before GCP calls'

# 5. Dry run makes zero gcloud or docker calls
export CALL_LOG="$TEST_STATE_DIR/dry-run.log"
: > "$CALL_LOG"
DRY_RUN=1 bash "$DEPLOY_SCRIPT" > /dev/null 2>&1
test ! -s "$CALL_LOG"
echo 'PASS: dry run makes zero gcloud or docker calls'