#!/bin/bash
set -euo pipefail
# The private JSON plan stays on the runner and is never an uploaded artifact.
if ! jq -e '[.resource_changes[]?.change.actions[]?] | all(. != "delete")' "$1" >/dev/null; then
  echo '::error::Deployment plan includes a resource deletion or replacement. Review it privately before proceeding.'
  exit 1
fi
if [[ "${KTH_ALLOW_CLOUD_CREATE:-false}" != true ]] && ! jq -e '
  [.resource_changes[]? | select(.address == "digitalocean_app.mqtt" or .address == "digitalocean_container_registry.mqtt") | .change.actions[]] |
  all(. != "create")
' "$1" >/dev/null; then
  echo '::error::A normal release cannot recreate a missing app or registry. Investigate state and remote resources.'
  exit 1
fi
