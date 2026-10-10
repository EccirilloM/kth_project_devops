#!/bin/bash
set -euo pipefail
umask 077
: "${RUNNER_TEMP:?}"
# Absence must be a successful, structured response, never an API error.
# Leave normal CLI diagnostics visible; do not enable HTTP tracing or verbosity.
if ! doctl registries list --output json > "$RUNNER_TEMP/registries.json"; then
  echo '::error::Registry listing failed. No resources will be created; check the CLI error above.'
  exit 1
fi
if ! jq -e 'type == "array"' "$RUNNER_TEMP/registries.json" >/dev/null; then
  echo '::error::Registry listing returned an unexpected response. Refusing bootstrap.'
  exit 1
fi
if ! jq -e 'length == 0' "$RUNNER_TEMP/registries.json" >/dev/null; then
  echo '::error::This account already has a registry outside this state. Refusing automatic adoption.'
  exit 1
fi
echo 'Confirmed: the account has no registries.'
