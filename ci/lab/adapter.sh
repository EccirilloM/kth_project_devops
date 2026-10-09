#!/bin/bash
set -euo pipefail
: "${KTH_REPO_ROOT:?}" "${KTH_RUNTIME_DIR:?}" "${KTH_ENVIRONMENT_ID:?}"
[[ "$KTH_ENVIRONMENT_ID" =~ ^kth-devops-it-[a-z0-9-]{1,40}$ ]] || exit 2
tools_image=kth-devops-lab-tools:local
runtime="/workspace/.runtime/$KTH_ENVIRONMENT_ID"
tool() {
  docker run --rm --mount "type=bind,source=$KTH_REPO_ROOT,target=/workspace" \
    --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
    --env "KTH_ENVIRONMENT_ID=$KTH_ENVIRONMENT_ID" --env "KTH_CONTAINER_RUNTIME=$runtime" \
    "$tools_image" "$@"
}
case "${1:?operation}" in
  validate)
    docker build --tag "$tools_image" -f "$KTH_REPO_ROOT/Docker/lab-tools/Dockerfile" "$KTH_REPO_ROOT/Docker/lab-tools"
    tool /workspace/ci/lab/prepare.sh
    frontend=$(docker image inspect "${KTH_FRONTEND_IMAGE:-kth-devops-frontend:local}" --format '{{.Id}}')
    broker=$(docker image inspect "${KTH_BROKER_IMAGE:-kth-devops-broker:local}" --format '{{.Id}}')
    simulator=$(docker image inspect "${KTH_SIMULATOR_IMAGE:-kth-devops-simulator:local}" --format '{{.Id}}')
    tool -c 'jq -n --arg fe "$1" --arg broker "$2" --arg sim "$3" \
      "{frontend_image:\$fe,broker_image:\$broker,simulator_image:\$sim}" > "$KTH_CONTAINER_RUNTIME/images.tfvars.json"' \
      prepare "$frontend" "$broker" "$simulator"
    tool /workspace/ci/lab/terraform.sh validate
    ;;
  up|apply|plan|down)
    tool /workspace/ci/lab/terraform.sh "$1"
    ;;
  logs)
    if [[ -s "$KTH_RUNTIME_DIR/manifest.json" && -s "$KTH_RUNTIME_DIR/private.tfvars.json" ]]; then
      docker run --rm \
        --mount "type=bind,source=$KTH_RUNTIME_DIR,target=/lab,readonly" \
        --mount "type=bind,source=$KTH_DIAGNOSTICS_DIR,target=/reports" \
        --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
        kth-devops-checks-checks:latest node scripts/lab-logs.mjs
    fi
    ;;
  *) echo 'Expected validate, up, apply, plan, logs or down' >&2; exit 2 ;;
esac
