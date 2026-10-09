#!/bin/bash
set -euo pipefail
# The private JSON plan stays on the runner and is never an uploaded artifact.
if ! jq -e '[.resource_changes[]?.change.actions[]?] | all(. != "delete")' "$1" >/dev/null; then
  echo '::error::Deployment plan includes a resource deletion or replacement. Review it privately before proceeding.'
  exit 1
fi
