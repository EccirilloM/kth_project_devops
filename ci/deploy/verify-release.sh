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
url=$(terraform output -raw app_url)
[[ "$url" == https://* ]] || exit 1
curl --fail --retry 6 --retry-delay 5 "$url/assets/config.json" -o "$RUNNER_TEMP/public-config.json"
broker_url=$(terraform output -raw broker_wss_url)
jq -e --arg expected "$broker_url" '.brokerUrl == $expected' "$RUNNER_TEMP/public-config.json" >/dev/null
