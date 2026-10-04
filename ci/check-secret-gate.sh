#!/bin/sh
set -eu
mkdir -p /reports
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
# Split construction avoids placing a matching token in the repository.
printf 'token = "kth_devops_%s%s"\n' 'demo_' '0123456789abcdef0123456789abcdef' > "$fixture/sample.txt"
status=0
gitleaks dir "$fixture" --config=/repo/.gitleaks.toml --redact=100 --no-banner \
  --ignore-gitleaks-allow --exit-code=42 --report-format=json \
  --report-path=/reports/gitleaks-demo.json || status=$?
if [ "$status" -ne 42 ] || ! grep -q 'kth-devops-demo-token' /reports/gitleaks-demo.json; then
  echo 'Secret gate demonstration failed: expected a detection of the nonfunctional token.' >&2
  exit 1
fi
printf 'No credentials here.\n' > "$fixture/sample.txt"
gitleaks dir "$fixture" --config=/repo/.gitleaks.toml --redact=100 --no-banner \
  --ignore-gitleaks-allow --report-format=json --report-path=/reports/gitleaks-clean-demo.json
echo 'Secret gate demonstration passed: fake token rejected, clean file accepted.'
