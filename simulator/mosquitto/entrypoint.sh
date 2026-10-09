#!/bin/sh
set -eu
umask 077
: "${BROKER_GUEST_PASSWORD:?Supply a guest password at runtime}"
: "${BROKER_OPERATOR_PASSWORD:?Supply an operator password at runtime}"
: "${BROKER_SIMULATOR_PASSWORD:?Supply a simulator password at runtime}"
mkdir -p /run/kth-devops
password_file=/run/kth-devops/password_file
: > "$password_file"
add_user() {
  # No fixed credentials in Git or image layers; reject malformed input early.
  if [ "${#2}" -lt 24 ] || [ "${#2}" -gt 128 ] || printf '%s' "$2" | LC_ALL=C grep -q '[^A-Za-z0-9_-]'; then
    echo "Broker passwords must contain 24..128 URL-safe characters" >&2
    exit 1
  fi
  mosquitto_passwd -b "$password_file" "$1" "$2"
}
for account in guest Guest; do add_user "$account" "$BROKER_GUEST_PASSWORD"; done
for account in operator Staff staff; do add_user "$account" "$BROKER_OPERATOR_PASSWORD"; done
add_user simulator "$BROKER_SIMULATOR_PASSWORD"
if [ -n "${BROKER_PROBE_PASSWORD:-}" ]; then
  add_user probe "$BROKER_PROBE_PASSWORD"
fi
chown mosquitto:mosquitto /run/kth-devops "$password_file"
chmod 700 /run/kth-devops
chmod 600 "$password_file"
unset BROKER_GUEST_PASSWORD BROKER_OPERATOR_PASSWORD BROKER_SIMULATOR_PASSWORD BROKER_PROBE_PASSWORD
exec mosquitto -c /mosquitto/config/mosquitto.conf
