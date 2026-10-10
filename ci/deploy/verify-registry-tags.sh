#!/bin/bash
set -euo pipefail
: "${TF_VAR_registry_name:?}" "${TF_VAR_image_repository:?}" "${TF_VAR_image_release:?}"
[[ "$TF_VAR_image_release" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || exit 2
# Read the remote catalog, not Docker's local metadata. Allow a short indexing delay.
for attempt in $(seq 1 6); do
  tags=$(doctl registry repository list-tags "$TF_VAR_image_repository" --registry "$TF_VAR_registry_name" -o json)
  jq -e 'type == "array"' <<< "$tags" >/dev/null
  missing=false
  for component in frontend mosquitto simulator; do
    var="TF_VAR_${component}_digest"
    expected=${!var}
    [[ "$expected" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 2
    tag="$component-$TF_VAR_image_release"
    digest=$(jq -er --arg tag "$tag" '[.[] | select(.tag == $tag)] |
      if length == 0 then "missing" elif length == 1 then .[0].manifest_digest else error("Duplicate release tag") end' <<< "$tags")
    if [[ "$digest" == missing ]]; then
      missing=true
    elif [[ "$digest" != "$expected" ]]; then
      printf '::error::DOCR tag %s does not reference the tested image.\n' "$tag" >&2
      exit 1
    fi
  done
  if [[ "$missing" == false ]]; then
    echo 'All three DOCR release tags match the tested image digests.'
    exit 0
  fi
  if [[ "$attempt" != 6 ]]; then sleep 5; fi
done
echo '::error::The release tags are not yet visible in DOCR. No application update is permitted.' >&2
exit 1
