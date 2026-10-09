#!/bin/bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
if command -v cygpath >/dev/null 2>&1; then export MSYS_NO_PATHCONV=1; fi
export KTH_ENVIRONMENT_ID="${KTH_ENVIRONMENT_ID:-kth-devops-it-local-$(date +%Y%m%d%H%M%S)-$RANDOM}"
echo "Disposable environment: $KTH_ENVIRONMENT_ID"
# Requires the frontend build produced by npm run verify; never rebuild Angular here.
test -f FE/dist/sail-monitoring-web/browser/build-manifest.json
docker compose -f Docker/checks.compose.yaml build checks simulator-image-test
docker build -f FE/Dockerfile.runtime -t kth-devops-frontend:local FE
docker build -f simulator/Dockerfile.mosquitto -t kth-devops-broker:local simulator
cleanup() {
  status=$?
  trap - EXIT
  bash ci/lab/run.sh logs || status=1
  bash ci/lab/run.sh down || status=1
  exit "$status"
}
trap cleanup EXIT
bash ci/lab/run.sh up
bash ci/lab/run.sh idempotence
bash ci/lab/run.sh test
