#!/bin/bash
set -euo pipefail
for name in DIGITALOCEAN_ACCESS_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY TF_STATE_CONFIG_JSON TF_VAR_registry_name TF_VAR_guest_password TF_VAR_operator_password TF_VAR_simulator_password; do
  if [[ -z "${!name:-}" ]]; then echo "::error::Missing required deployment setting: $name"; exit 1; fi
done
[[ "$TF_VAR_registry_name" =~ ^kth-devops-[a-z0-9-]+$ ]] || { echo '::error::Use a dedicated kth-devops- registry name.'; exit 1; }
if [[ "$TF_VAR_guest_password" == "$TF_VAR_operator_password" || "$TF_VAR_guest_password" == "$TF_VAR_simulator_password" || "$TF_VAR_operator_password" == "$TF_VAR_simulator_password" ]]; then
  echo '::error::Use different passwords for guest, operator and simulator.'
  exit 1
fi
for name in TF_VAR_guest_password TF_VAR_operator_password TF_VAR_simulator_password; do
  [[ "${!name}" =~ ^[A-Za-z0-9_-]{24,128}$ ]] || { echo "::error::Invalid password format for $name"; exit 1; }
done
# The config contains public backend coordinates only; credentials come from the environment.
jq -e '
  type == "object" and
  (.bucket | type == "string" and length > 0) and
  (.key | type == "string" and length > 0) and
  (.region | type == "string" and length > 0) and
  ((keys - ["bucket","key","region","endpoints","use_path_style","skip_credentials_validation",
    "skip_region_validation","skip_requesting_account_id","skip_metadata_api_check","skip_s3_checksum","encrypt"]) | length == 0) and
  ((.endpoints // {}) | to_entries | all(.key == "s3" and (.value | startswith("https://"))))
' <<< "$TF_STATE_CONFIG_JSON" >/dev/null
umask 077
printf '%s' "$TF_STATE_CONFIG_JSON" > "$RUNNER_TEMP/backend.json"
