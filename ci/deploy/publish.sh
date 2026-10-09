#!/bin/bash
set -euo pipefail
: "${TF_VAR_registry_name:?}" "${TF_VAR_image_repository:?}"
[[ "$TF_VAR_registry_name" =~ ^[a-z0-9-]+$ ]] || exit 2
[[ "$TF_VAR_image_repository" =~ ^[a-z0-9._-]+$ ]] || exit 2
actual_registry=$(doctl registry get --format Name --no-header | tr -d '[:space:]')
test "$actual_registry" = "$TF_VAR_registry_name"
image="registry.digitalocean.com/$TF_VAR_registry_name/$TF_VAR_image_repository"
release="$GITHUB_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
mkdir -p "$RUNNER_TEMP/release"
for component in simulator broker frontend; do
  source="kth-devops-$component:$GITHUB_SHA"
  name=$component
  [[ "$component" != broker ]] || name=mosquitto
  tag="$image:$name-$release"
  docker tag "$source" "$tag"
  docker push "$tag"
  reference=$(docker image inspect "$tag" --format '{{range .RepoDigests}}{{println .}}{{end}}' | grep -F "$image@sha256:" | head -n 1)
  digest="${reference##*@}"
  [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1
  printf 'TF_VAR_%s_digest=%s\n' "$name" "$digest" >> "$GITHUB_ENV"
  printf '%s=%s\n' "$name" "$reference" >> "$RUNNER_TEMP/release/images.env"
done
# No stable tags are pushed. Existing services remain on their old digests until apply.
