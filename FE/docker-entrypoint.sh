#!/bin/sh
set -eu
HTML_ROOT="${HTML_ROOT:-/usr/share/nginx/html}"
CONFIG="${HTML_ROOT}/assets/config.json"

if [ -z "${MQTT_BROKER_URL:-}" ] && [ -n "${APP_URL:-}" ]; then
  host="${APP_URL#https://}"
  host="${host#http://}"
  host="${host%/}"
  MQTT_BROKER_URL="wss://${host}/mqtt"
fi
broker="${MQTT_BROKER_URL:-}"
if [ -z "$broker" ] && [ "${KTH_ALLOW_UNCONFIGURED:-false}" != true ]; then
  echo "MQTT_BROKER_URL or APP_URL must be set" >&2
  exit 1
fi
if [ -n "$broker" ]; then
  case "$broker" in
    wss://*) ;;
    *) echo "Broker URL must use WSS" >&2; exit 1 ;;
  esac
  case "$broker" in
    *'@'*|*'?'*|*'#'*|*' '*|*'"'*|*'\'*) echo "Invalid public broker URL" >&2; exit 1 ;;
  esac
fi
users='{"guest":"GUEST","Guest":"GUEST","operator":"ADMIN","Staff":"ADMIN","staff":"ADMIN"}'
timeout="${DATA_TIMEOUT_MS:-5000}"
mkdir -p "$(dirname "$CONFIG")"
# jq quotes strings safely; passwords are never part of this public file.
jq -en --arg broker "$broker" --argjson users "$users" --argjson timeout "$timeout" '
  if ($timeout | type) != "number" or $timeout < 500 or $timeout > 10000 or ($timeout | floor) != $timeout
  then error("Invalid freshness timeout")
  else {brokerUrl: $broker, users: $users, dataTimeoutMs: $timeout} end
' > "$CONFIG.tmp"
mv "$CONFIG.tmp" "$CONFIG"
exec nginx -g 'daemon off;'
