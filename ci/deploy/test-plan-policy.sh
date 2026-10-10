#!/bin/bash
set -euo pipefail
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
policy="$(cd "$(dirname "$0")" && pwd)/check-plan.sh"
check_case() {
  local label=$1 actions=$2 bootstrap=$3 expected=$4
  jq -n --argjson actions "$actions" '{resource_changes:[{address:"digitalocean_app.mqtt",change:{actions:$actions}}]}' > "$test_dir/plan.json"
  local actual=0
  KTH_ALLOW_CLOUD_CREATE="$bootstrap" bash "$policy" "$test_dir/plan.json" > "$test_dir/output.txt" 2>&1 || actual=$?
  if [[ "$expected" == pass && "$actual" != 0 || "$expected" == fail && "$actual" == 0 ]]; then
    printf 'FAIL: %s\n' "$label" >&2
    cat "$test_dir/output.txt" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$label"
}
check_case 'ordinary update' '["update"]' false pass
check_case 'unchanged release' '["no-op"]' false pass
check_case 'ordinary release cannot recreate an app' '["create"]' false fail
check_case 'deletion is rejected' '["delete"]' false fail
check_case 'replacement is rejected' '["delete","create"]' false fail
check_case 'explicit bootstrap may create the app' '["create"]' true pass
check_case 'bootstrap does not permit replacement' '["create","delete"]' true fail
