#!/bin/bash
set -euo pipefail
cd /repo
git config --global --add safe.directory /repo
mkdir -p /reports
status=0

# Scan reachable history, including inherited commits. Never silently baseline findings.
gitleaks git /repo --log-opts="--all" --config=/repo/.gitleaks.toml \
  --redact=100 --no-banner --ignore-gitleaks-allow \
  --report-format=json --report-path=/reports/gitleaks-history.json || status=1

# Also scan current tracked files and non-ignored new files during local development.
snapshot=$(mktemp -d)
trap 'rm -rf "$snapshot"' EXIT
git ls-files -z --cached --others --exclude-standard --deduplicate > "$snapshot/git-files"
# A local tracked deletion must not make tar fail; history is still scanned above.
while IFS= read -r -d '' name; do
  if [ -e "$name" ] || [ -L "$name" ]; then printf '%s\0' "$name"; fi
done < "$snapshot/git-files" > "$snapshot/file-list"
tar --null -T "$snapshot/file-list" -cf "$snapshot/source.tar"
mkdir "$snapshot/source"
tar -xf "$snapshot/source.tar" -C "$snapshot/source"
gitleaks dir "$snapshot/source" --config=/repo/.gitleaks.toml \
  --redact=100 --no-banner --ignore-gitleaks-allow \
  --report-format=json --report-path=/reports/gitleaks-worktree.json || status=1
exit "$status"
