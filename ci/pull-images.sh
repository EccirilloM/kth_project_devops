#!/usr/bin/env bash
set -euo pipefail

# Retry only image downloads, never tests, builds or Terraform operations.
if (( $# == 0 )); then
  echo 'Usage: bash ci/pull-images.sh <image> [image ...]' >&2
  exit 2
fi

pull_log=$(mktemp)
trap 'rm -f "$pull_log"' EXIT
transient_error='500 Internal Server Error|502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout|TLS handshake timeout|i/o timeout|Client[.]Timeout exceeded while awaiting headers|net/http: timeout awaiting response headers|context deadline exceeded|connection reset by peer|unexpected EOF'

for image in "$@"; do
  for attempt in 1 2 3; do
    printf 'Pulling %s (attempt %s/3)\n' "$image" "$attempt"
    if docker pull "$image" >"$pull_log" 2>&1; then
      cat "$pull_log"
      break
    else
      result=$?
    fi
    cat "$pull_log" >&2
    if (( attempt == 3 )) || ! grep -Eiq "$transient_error" "$pull_log"; then
      exit "$result"
    fi
    delay=$((attempt * 15))
    printf 'Temporary registry error; retrying in %s seconds.\n' "$delay" >&2
    sleep "$delay"
  done
done
