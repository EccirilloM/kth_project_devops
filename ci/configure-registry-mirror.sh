#!/usr/bin/env bash
set -euo pipefail

# Run before starting containers, on a disposable GitHub-hosted Linux runner only.
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted || "${RUNNER_OS:-}" != Linux ]]; then
  echo 'Registry mirror setup is restricted to GitHub-hosted Linux runners.' >&2
  exit 2
fi

mirror_config=$(mktemp)
trap 'rm -f "$mirror_config"' EXIT
{
  if sudo test -f /etc/docker/daemon.json; then
    sudo cat /etc/docker/daemon.json
  else
    printf '{}\n'
  fi
} | jq '.["registry-mirrors"] = (["https://mirror.gcr.io"] + ((.["registry-mirrors"] // []) | map(select(. != "https://mirror.gcr.io"))))' > "$mirror_config"

# Preserve the runner's other daemon settings and any additional mirrors.
sudo install -m 644 "$mirror_config" /etc/docker/daemon.json
sudo systemctl restart docker
docker info --format '{{json .RegistryConfig.Mirrors}}'
