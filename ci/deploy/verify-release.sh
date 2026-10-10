#!/bin/bash
set -euo pipefail
: "${TF_VAR_image_release:?}"
app_id=$(terraform output -raw app_id)
ready=false
for attempt in $(seq 1 60); do
  # Do not print the app spec: it contains encrypted secret values and environment settings.
  app=$(doctl apps get "$app_id" -o json)
  if jq -e --arg release "$TF_VAR_image_release" --arg registry "$TF_VAR_registry_name" \
    --arg repo "$TF_VAR_image_repository" '
    def source($name): .image.registry_type == "DOCR" and .image.registry == $registry and
      .image.repository == $repo and .image.tag == ($name + "-" + $release);
    (if type == "array" then .[0] else . end).active_deployment |
    .phase == "ACTIVE" and
    any(.spec.services[]?; .name == "frontend" and source("frontend")) and
    any(.spec.services[]?; .name == "mosquitto" and source("mosquitto")) and
    any(.spec.workers[]?; .name == "simulator" and source("simulator"))
  ' <<< "$app" >/dev/null; then ready=true; break; fi
  sleep 10
done
if [[ "$ready" != true ]]; then echo '::error::The expected release did not become active within ten minutes.'; exit 1; fi
bash "$(dirname "$0")/verify-registry-tags.sh"
# Terraform may save live_url before the first asynchronous deployment becomes
# active. Read the URL from the same fresh API response checked above.
url=$(jq -r '(if type == "array" then .[0] else . end) | .live_url // empty' <<< "$app")
if [[ ! "$url" =~ ^https://[^/[:space:]?#@]+/?$ ]]; then
  echo '::error::The active app did not provide a valid public HTTPS URL.' >&2
  exit 1
fi
url=${url%/}
if ! curl --fail --retry 6 --retry-delay 5 --connect-timeout 10 --max-time 30 \
  "$url/assets/config.json" -o "$RUNNER_TEMP/public-config.json"; then
  echo '::error::The deployed frontend runtime configuration could not be retrieved.' >&2
  exit 1
fi
broker_url=$(terraform output -raw broker_wss_url)
if ! jq -e --arg expected "$broker_url" '.brokerUrl == $expected' "$RUNNER_TEMP/public-config.json" >/dev/null; then
  echo '::error::The frontend runtime configuration does not match the expected broker URL.' >&2
  exit 1
fi
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf 'app_url=%s\n' "$url" >> "$GITHUB_OUTPUT"; fi
echo 'The active release serves the expected public runtime configuration.'
