#!/bin/bash
set -euo pipefail
umask 077
# Called after init. Recovery adopts a reviewed ID; it never creates a cloud app.
fail() { printf '::error::%s\n' "$1" >&2; exit 1; }
app_id=${KTH_RECOVER_APP_ID:-}
[[ "$app_id" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]] || fail 'Recovery requires an exact app UUID.'
[[ "${GITHUB_EVENT_NAME:-}" == workflow_dispatch && "${GITHUB_REF:-}" == refs/heads/dev && "${KTH_BOOTSTRAP_CLOUD:-false}" != true ]] || fail 'Recovery requires a manual dev run with bootstrap disabled.'

# Refuse another environment or unrelated state before contacting the app API.
jq -e --arg registry "$TF_VAR_registry_name" --arg id "$app_id" '
  [.values.root_module | .. | objects | .resources? // empty | .[] | select(.mode == "managed")] as $r |
  ([$r[] | select(.address == "digitalocean_container_registry.mqtt" and .values.name == $registry)] | length) == 1 and
  all($r[]; .address == "digitalocean_container_registry.mqtt" or
    (.address == "digitalocean_app.mqtt" and .values.id == $id))
' "$RUNNER_TEMP/cloud-state.json" >/dev/null || fail 'Recovery expects the matching registry and no unrelated resources or different app ID in state.'

doctl apps get "$app_id" -o json > "$RUNNER_TEMP/recovery-app.json"
jq -e --arg id "$app_id" --arg name "$TF_VAR_app_name" --arg region "$TF_VAR_region" \
  --arg registry "$TF_VAR_registry_name" --arg repo "$TF_VAR_image_repository" '
  type == "array" and length == 1 and
  (.[0] | .id == $id and .spec.name == $name and .spec.region == $region and
    ([.spec.services[].name] | sort) == ["frontend", "mosquitto"] and
    ([.spec.workers[].name] | sort) == ["simulator"] and
    ([.spec.jobs[]?, .spec.static_sites[]?, .spec.databases[]?, .spec.functions[]?] | length) == 0 and
    all(.spec.services[], .spec.workers[];
      .image.registry_type == "DOCR" and .image.repository == $repo and
      ((.image.registry // "") == "" or .image.registry == $registry) and
      (if (.image.tag // "") == "" then
        ((.image.digest // "") | test("^sha256:[a-f0-9]{64}$"))
      else
        (.image.digest // "") == "" and
        (. as $component | .image.tag | test("^" + $component.name + "-[a-f0-9]{40}-[0-9]+-[0-9]+$"))
      end)))
' "$RUNNER_TEMP/recovery-app.json" >/dev/null || fail 'App identity, region, components or image sources do not match the recovery target.'

if jq -e --arg id "$app_id" 'any(.values.root_module.resources[]; .address == "digitalocean_app.mqtt" and .values.id == $id)' "$RUNNER_TEMP/cloud-state.json" >/dev/null; then
  echo 'The requested app is already tracked. Continuing without importing again.'
  exit 0
fi

# Import needs all required variables, even though it does not apply the config.
# Resolve older digest sources and unique release tags before import.
# The subsequent release still uses only CI's verified images.
export TF_VAR_frontend_digest TF_VAR_mosquitto_digest TF_VAR_simulator_digest
tags='[]'
if jq -e 'any(.[0].spec.services[], .[0].spec.workers[]; (.image.tag // "") != "")' "$RUNNER_TEMP/recovery-app.json" >/dev/null; then
  tags=$(doctl registry repository list-tags "$TF_VAR_image_repository" --registry "$TF_VAR_registry_name" -o json)
fi
for component in frontend mosquitto simulator; do
  digest=$(jq -er --arg name "$component" --argjson tags "$tags" '
    (.[0].spec | .services[], .workers[]) | select(.name == $name) | .image |
    if (.tag // "") == "" then .digest else
      .tag as $tag | [$tags[] | select(.tag == $tag)] |
      if length == 1 then .[0].manifest_digest else error("Release tag not uniquely resolved") end
    end
  ' "$RUNNER_TEMP/recovery-app.json")
  [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Invalid digest in the registry catalog.'
  export "TF_VAR_${component}_digest=$digest"
done
# Remote bucket versioning retains the preceding version. This additional copy
# and API response remain private on the runner and are never uploaded/logged.
terraform state pull > "$RUNNER_TEMP/pre-import.tfstate"
terraform import -input=false -lock-timeout=60s digitalocean_app.mqtt "$app_id"
terraform show -json > "$RUNNER_TEMP/cloud-state.json"
jq -e --arg id "$app_id" 'any(.values.root_module.resources[]; .address == "digitalocean_app.mqtt" and .values.id == $id)' "$RUNNER_TEMP/cloud-state.json" >/dev/null || fail 'Imported app ID was not found in state.'
printf 'Recovered app %s into Terraform state. Resource creation remains disabled.\n' "$app_id"
