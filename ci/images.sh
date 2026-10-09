#!/bin/bash
set -euo pipefail
operation=${1:?save or load}
image=${2:?image tag}
directory=${3:?artifact directory}
case "$operation" in
  save)
    mkdir -p "$directory"
    docker image inspect "$image" --format '{{.Id}}' > "$directory/image.id"
    docker save "$image" --output "$directory/image.tar"
    (cd "$directory" && sha256sum image.tar > image.sha256)
    ;;
  load)
    (cd "$directory" && sha256sum --check image.sha256)
    docker load --input "$directory/image.tar"
    test "$(docker image inspect "$image" --format '{{.Id}}')" = "$(cat "$directory/image.id")"
    test "$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')" = linux/amd64
    test "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "${GITHUB_SHA:?}"
    ;;
  *) echo "Usage: images.sh save|load image directory" >&2; exit 2 ;;
esac
