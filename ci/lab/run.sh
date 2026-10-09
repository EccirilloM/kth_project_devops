#!/bin/bash
set -euo pipefail
# Host orchestration: Linux CI, macOS terminal, or Git Bash on Windows.
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
if command -v cygpath >/dev/null 2>&1; then root=$(cygpath -m "$root"); export MSYS_NO_PATHCONV=1; fi
cd "$root"
: "${KTH_ENVIRONMENT_ID:?Set a unique kth-devops-it- environment ID}"
[[ "$KTH_ENVIRONMENT_ID" =~ ^kth-devops-it-[a-z0-9-]{1,40}$ ]] || { echo 'Invalid environment ID' >&2; exit 2; }
export KTH_REPO_ROOT="$root"
export KTH_FRONTEND_DIR="$root/FE/dist/sail-monitoring-web/browser"
export KTH_RUNTIME_DIR="$root/.runtime/$KTH_ENVIRONMENT_ID"
export KTH_DIAGNOSTICS_DIR="$root/FE/test-results/lab-diagnostics"
adapter=${KTH_LAB_ADAPTER:-"$root/ci/lab/adapter.sh"}
image=kth-devops-checks-checks:latest
mkdir -p "$KTH_RUNTIME_DIR" "$KTH_DIAGNOSTICS_DIR" "$root/FE/test-results"
umask 077

adapter_operation() {
  # Terraform output/plans may contain credentials. Preserve privately, not in CI logs.
  if ! bash "$adapter" "$1" > "$KTH_RUNTIME_DIR/$1.log" 2>&1; then
    echo "Laboratory adapter operation '$1' failed. Its private log is in .runtime; do not upload it unredacted." >&2
    return 1
  fi
}

plan_check() {
  docker run --rm --mount "type=bind,source=$KTH_RUNTIME_DIR,target=/lab,readonly" \
    --mount "type=bind,source=$KTH_DIAGNOSTICS_DIR,target=/reports" "$image" \
    node scripts/terraform-plan.mjs /lab/plan.json "/reports/$1.json"
}

case "${1:-}" in
  up)
    test -f "$KTH_FRONTEND_DIR/build-manifest.json"
    adapter_operation validate
    adapter_operation up
    test -s "$KTH_RUNTIME_DIR/manifest.json"
    test -s "$KTH_RUNTIME_DIR/ca.crt"
    docker run --rm --network "$KTH_ENVIRONMENT_ID-network" \
      --mount "type=bind,source=$KTH_RUNTIME_DIR,target=/lab,readonly" \
      --env KTH_LAB_MANIFEST=/lab/manifest.json --env NODE_EXTRA_CA_CERTS=/lab/ca.crt \
      "$image" node scripts/lab-ready.mjs
    ;;
  idempotence)
    adapter_operation plan
    plan_check before-second-apply
    adapter_operation apply
    adapter_operation plan
    plan_check after-second-apply
    ;;
  test)
    network=$(docker run --rm \
      --mount "type=bind,source=$KTH_RUNTIME_DIR,target=/lab,readonly" \
      --env KTH_LAB_MANIFEST=/lab/manifest.json --env "KTH_EXPECTED_ENVIRONMENT=$KTH_ENVIRONMENT_ID" \
      "$image" node --experimental-transform-types --import ./tests/register.mjs scripts/lab-network.mjs)
    identity=$(docker network inspect --format '{{ index .Labels "kth.devops.environment" }}' "$network")
    [[ "$identity" == "$KTH_ENVIRONMENT_ID" ]] || { echo 'Network ownership mismatch' >&2; exit 2; }
    docker run --rm --init --shm-size=1g --network "$network" \
      --mount "type=bind,source=$KTH_RUNTIME_DIR,target=/lab,readonly" \
      --mount "type=bind,source=$KTH_FRONTEND_DIR,target=/app/FE/dist/sail-monitoring-web/browser,readonly" \
      --mount "type=bind,source=$root/FE/test-results,target=/app/FE/test-results" \
      --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
      --env KTH_LAB_MANIFEST=/lab/manifest.json --env "KTH_EXPECTED_ENVIRONMENT=$KTH_ENVIRONMENT_ID" \
      --env NODE_EXTRA_CA_CERTS=/lab/ca.crt "$image" node scripts/start-integration.mjs
    ;;
  logs) adapter_operation logs ;;
  down) adapter_operation down ;;
  *) echo 'Usage: bash ci/lab/run.sh up|idempotence|test|logs|down' >&2; exit 2 ;;
esac
