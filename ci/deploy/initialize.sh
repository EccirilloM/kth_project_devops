#!/bin/bash
set -euo pipefail
umask 077
# Run from infra. Ordinary releases require both persistent resource addresses.
terraform init -input=false -backend-config="$RUNNER_TEMP/backend.json"
terraform validate
# `state list` fails when no state exists yet; `show -json` represents an empty state.
# Any backend/authentication failure still aborts instead of being mistaken for emptiness.
terraform show -json > "$RUNNER_TEMP/cloud-state.json"
jq -r '.. | objects | .resources? // empty | .[] | select(.mode == "managed") | .address' \
  "$RUNNER_TEMP/cloud-state.json" > "$RUNNER_TEMP/state-addresses.txt"
registry_address=digitalocean_container_registry.mqtt
app_address=digitalocean_app.mqtt
printf 'KTH_ALLOW_CLOUD_CREATE=false\n' >> "$GITHUB_ENV"

if ! grep -qx "$app_address" "$RUNNER_TEMP/state-addresses.txt"; then
  if [[ "${KTH_BOOTSTRAP_CLOUD:-false}" != true || "${GITHUB_EVENT_NAME:-}" != workflow_dispatch || "${GITHUB_REF:-}" != refs/heads/dev ]]; then
    echo '::error::App state is missing. Restore existing state, or explicitly bootstrap a NEW environment through the CI manual run on dev.'
    exit 1
  fi
  if grep -qvx "$registry_address" "$RUNNER_TEMP/state-addresses.txt"; then
    echo '::error::Bootstrap expects an empty state or only its registry. Refusing to change unrelated resources.'
    exit 1
  fi

  # Never create a duplicate of an app whose state has been lost.
  doctl apps list -o json > "$RUNNER_TEMP/apps.json"
  jq -e --arg name "$TF_VAR_app_name" 'all(.[]; .spec.name != $name)' "$RUNNER_TEMP/apps.json" >/dev/null || {
    echo '::error::An app with the requested name already exists. Recover its state instead of bootstrapping.'
    exit 1
  }
  if ! grep -qx "$registry_address" "$RUNNER_TEMP/state-addresses.txt"; then
    bash "$(dirname "$0")/require-empty-registry.sh"
  fi

  # Create the registry before pushing images, without placeholder app digests.
  # Both phases use the SAME backend key and SAME registry resource address.
  bootstrap_dir="$RUNNER_TEMP/registry-bootstrap"
  mkdir -p "$bootstrap_dir"
  cp registry.tf backend.tf .terraform.lock.hcl "$bootstrap_dir/"
  terraform -chdir="$bootstrap_dir" init -input=false -backend-config="$RUNNER_TEMP/backend.json"
  terraform -chdir="$bootstrap_dir" plan -input=false -lock-timeout=60s -out="$RUNNER_TEMP/registry.tfplan"
  terraform -chdir="$bootstrap_dir" show -json "$RUNNER_TEMP/registry.tfplan" > "$RUNNER_TEMP/registry-plan.json"
  jq -e --arg address "$registry_address" '
    all(.resource_changes[]?; .address == $address and all(.change.actions[]; . == "create" or . == "no-op"))
  ' "$RUNNER_TEMP/registry-plan.json" >/dev/null || {
    echo '::error::Unexpected registry bootstrap plan. Refusing to apply.'
    exit 1
  }
  terraform -chdir="$bootstrap_dir" apply -input=false -lock-timeout=60s "$RUNNER_TEMP/registry.tfplan"
  printf 'KTH_ALLOW_CLOUD_CREATE=true\n' >> "$GITHUB_ENV"
fi

terraform state list > "$RUNNER_TEMP/state-addresses.txt"
grep -qx "$registry_address" "$RUNNER_TEMP/state-addresses.txt"
terraform show -json > "$RUNNER_TEMP/cloud-state.json"
jq -e --arg registry "$TF_VAR_registry_name" --arg app "$TF_VAR_app_name" '
  .values.root_module.resources as $resources |
  any($resources[]; .address == "digitalocean_container_registry.mqtt" and .values.name == $registry) and
  all($resources[]; .address != "digitalocean_app.mqtt" or .values.spec[0].name == $app)
' "$RUNNER_TEMP/cloud-state.json" >/dev/null || {
  echo '::error::State resource names do not match the requested environment.'
  exit 1
}
