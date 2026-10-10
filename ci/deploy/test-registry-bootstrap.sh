#!/bin/bash
set -euo pipefail
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
guard="$(cd "$(dirname "$0")" && pwd)/require-empty-registry.sh"
mkdir -p "$test_dir/bin"
# Replace only the cloud CLI: these checks never contact DigitalOcean.
cat > "$test_dir/bin/doctl" <<'MOCK'
#!/bin/bash
[[ "$*" == 'registries list --output json' ]] || exit 99
if [[ "$MOCK_STATUS" != 0 ]]; then
  printf '%s\n' "$MOCK_RESPONSE" >&2
  exit "$MOCK_STATUS"
fi
printf '%s\n' "$MOCK_RESPONSE"
MOCK
chmod +x "$test_dir/bin/doctl"
check_case() {
  local label=$1 response=$2 status=$3 expected=$4 actual=0
  PATH="$test_dir/bin:$PATH" RUNNER_TEMP="$test_dir" MOCK_RESPONSE="$response" MOCK_STATUS="$status" \
    bash "$guard" > "$test_dir/output.txt" 2>&1 || actual=$?
  if [[ "$expected" == pass && "$actual" != 0 || "$expected" == fail && "$actual" == 0 ]]; then
    printf 'FAIL: %s\n' "$label" >&2
    cat "$test_dir/output.txt" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$label"
}
check_case 'empty account allows bootstrap' '[]' 0 pass
check_case 'existing registry blocks bootstrap' '[{"name":"existing-registry"}]' 0 fail
check_case 'access denied is not absence' '403 Forbidden' 1 fail
check_case '404 error is not absence' '404 Not Found' 1 fail
check_case 'timeout is not absence' 'request timed out' 1 fail
check_case 'malformed response blocks bootstrap' 'invalid JSON' 0 fail
check_case 'null response blocks bootstrap' 'null' 0 fail
check_case 'unexpected response shape blocks bootstrap' '{}' 0 fail
