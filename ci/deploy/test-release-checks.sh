#!/bin/bash
set -euo pipefail
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
scripts="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$test_dir/bin"
export RUNNER_TEMP="$test_dir" PATH="$test_dir/bin:$PATH"
export TF_VAR_registry_name=kth-devops-test TF_VAR_image_repository=mqtt
export TF_VAR_image_release="$(printf 'a%.0s' {1..40})-123-1"
export TF_VAR_frontend_digest="sha256:$(printf '1%.0s' {1..64})"
export TF_VAR_mosquitto_digest="sha256:$(printf '2%.0s' {1..64})"
export TF_VAR_simulator_digest="sha256:$(printf '3%.0s' {1..64})"
export MOCK_API_STATUS=0
# All external commands are replaced: these tests cannot contact Docker or the cloud.
cat > "$test_dir/bin/doctl" <<'MOCK'
#!/bin/bash
[[ "$MOCK_API_STATUS" == 0 ]] || exit "$MOCK_API_STATUS"
case "$*" in
  'registry repository list-tags mqtt --registry kth-devops-test -o json') cat "$RUNNER_TEMP/tags.json" ;;
  'apps get test-app -o json') cat "$RUNNER_TEMP/app.json" ;;
  *) exit 99 ;;
esac
MOCK
cat > "$test_dir/bin/terraform" <<'MOCK'
#!/bin/bash
case "$*" in
  'output -raw app_id') echo test-app ;;
  'output -raw app_url') echo https://demo.invalid ;;
  'output -raw broker_wss_url') echo wss://demo.invalid/mqtt ;;
  *) exit 99 ;;
esac
MOCK
cat > "$test_dir/bin/curl" <<'MOCK'
#!/bin/bash
printf '{"brokerUrl":"wss://demo.invalid/mqtt"}\n' > "$RUNNER_TEMP/public-config.json"
touch "$RUNNER_TEMP/http-checked"
MOCK
printf '#!/bin/bash\nexit 0\n' > "$test_dir/bin/sleep"
chmod +x "$test_dir/bin/"*
jq -n '["frontend","mosquitto","simulator"] | map(. as $name |
  {tag:($name + "-" + env.TF_VAR_image_release),manifest_digest:env["TF_VAR_" + $name + "_digest"]})' > "$test_dir/base-tags.json"
jq -n '
  def component($name): {name:$name,image:{registry_type:"DOCR",registry:env.TF_VAR_registry_name,
    repository:"mqtt",tag:($name + "-" + env.TF_VAR_image_release)}};
  [{active_deployment:{phase:"ACTIVE",spec:{services:[component("frontend"),component("mosquitto")],workers:[component("simulator")]}}}]
' > "$test_dir/base-app.json"
check_case() {
  local label=$1 script=$2 tag_filter=$3 app_filter=$4 expected=$5 status=0
  jq "$tag_filter" "$test_dir/base-tags.json" > "$test_dir/tags.json"
  jq "$app_filter" "$test_dir/base-app.json" > "$test_dir/app.json"
  rm -f "$test_dir/http-checked"
  bash "$scripts/$script.sh" > "$test_dir/result.txt" 2>&1 || status=$?
  if [[ "$expected" == pass && "$status" != 0 || "$expected" == fail && "$status" == 0 ]]; then
    printf 'FAIL: %s\n' "$label" >&2
    cat "$test_dir/result.txt" >&2
    exit 1
  fi
  if [[ "$script" == verify-release && "$expected" == pass ]]; then test -f "$test_dir/http-checked"; fi
  if [[ "$expected" == fail ]]; then test ! -f "$test_dir/http-checked"; fi
  printf 'PASS: %s\n' "$label"
}
check_case 'remote tags match all three tested digests' verify-registry-tags '.' '.' pass
check_case 'missing image blocks release' verify-registry-tags '.[0:2]' '.' fail
check_case 'retargeted image blocks release' verify-registry-tags '.[0].manifest_digest = .[1].manifest_digest' '.' fail
check_case 'duplicate tag is rejected' verify-registry-tags '. + [.[0]]' '.' fail
check_case 'wrong catalog shape is rejected' verify-registry-tags '{}' '.' fail
MOCK_API_STATUS=1 check_case 'registry API failure blocks release' verify-registry-tags '.' '.' fail
check_case 'matching active release reaches HTTP check' verify-release '.' '.' pass
check_case 'stale deployment is not accepted' verify-release '.' '.[0].active_deployment.spec.services[0].image.tag = "frontend-old"' fail
check_case 'inactive deployment is not accepted' verify-release '.' '.[0].active_deployment.phase = "ERROR"' fail
check_case 'wrong registry is not accepted' verify-release '.' '.[0].active_deployment.spec.workers[0].image.registry = "other"' fail
check_case 'wrong repository is not accepted' verify-release '.' '.[0].active_deployment.spec.workers[0].image.repository = "other"' fail
check_case 'missing component is not accepted' verify-release '.' '.[0].active_deployment.spec.workers = []' fail
check_case 'tag changed after deployment is rejected' verify-release '.[0].manifest_digest = .[1].manifest_digest' '.' fail
