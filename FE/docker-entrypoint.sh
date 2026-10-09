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

if [ -z "${MQTT_BROKER_URL:-}" ]; then
  echo "MQTT_BROKER_URL or APP_URL must be set" >&2
  exit 1
fi

mkdir -p "$(dirname "$CONFIG")"
cat >"$CONFIG" <<EOF
{
  "brokerUrl": "${MQTT_BROKER_URL}",
  "users": {
    "guest": "GUEST",
    "Guest": "GUEST",
    "operator": "ADMIN",
    "Staff": "ADMIN",
    "staff": "ADMIN"
  }
}
EOF
echo "Wrote ${CONFIG} brokerUrl=${MQTT_BROKER_URL}"
exec nginx -g 'daemon off;'
