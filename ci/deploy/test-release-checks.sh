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
export MOCK_API_STATUS=0 MOCK_CURL_STATUS=0 MOCK_BROKER_URL=wss://demo.invalid/mqtt
export GITHUB_OUTPUT="$test_dir/step-output"
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
  'output -raw app_url') printf '' ;; # First-deployment Terraform snapshot has no live URL yet.
  'output -raw broker_wss_url') echo wss://demo.invalid/mqtt ;;
  *) exit 99 ;;
esac
MOCK
cat > "$test_dir/bin/curl" <<'MOCK'
#!/bin/bash
touch "$RUNNER_TEMP/http-checked"
[[ " $* " == *' https://demo.invalid/assets/config.json '* ]] || exit 98
[[ "$MOCK_CURL_STATUS" == 0 ]] || exit "$MOCK_CURL_STATUS"
jq -n --arg broker "$MOCK_BROKER_URL" '{brokerUrl:$broker}' > "$RUNNER_TEMP/public-config.json"
MOCK
printf '#!/bin/bash\nexit 0\n' > "$test_dir/bin/sleep"
chmod +x "$test_dir/bin/"*
jq -n '["frontend","mosquitto","simulator"] | map(. as $name |
  {tag:($name + "-" + env.TF_VAR_image_release),manifest_digest:env["TF_VAR_" + $name + "_digest"]})' > "$test_dir/base-tags.json"
jq -n '
  def component($name): {name:$name,image:{registry_type:"DOCR",registry:env.TF_VAR_registry_name,
    repository:"mqtt",tag:($name + "-" + env.TF_VAR_image_release)}};
  [{live_url:"https://demo.invalid",active_deployment:{phase:"ACTIVE",spec:{services:[component("frontend"),component("mosquitto")],workers:[component("simulator")]}}}]
' > "$test_dir/base-app.json"
check_case() {
  local label=$1 script=$2 tag_filter=$3 app_filter=$4 expected=$5 status=0
  local http_expected=${6:-no}
  jq "$tag_filter" "$test_dir/base-tags.json" > "$test_dir/tags.json"
  jq "$app_filter" "$test_dir/base-app.json" > "$test_dir/app.json"
  rm -f "$test_dir/http-checked"
  : > "$GITHUB_OUTPUT"
  bash "$scripts/$script.sh" > "$test_dir/result.txt" 2>&1 || status=$?
  if [[ "$expected" == pass && "$status" != 0 || "$expected" == fail && "$status" == 0 ]]; then
    printf 'FAIL: %s\n' "$label" >&2
    cat "$test_dir/result.txt" >&2
    exit 1
  fi
  if [[ "$script" == verify-release && "$expected" == pass ]]; then
    test -f "$test_dir/http-checked"
    test "$(cat "$GITHUB_OUTPUT")" = 'app_url=https://demo.invalid'
  fi
  if [[ "$expected" == fail ]]; then
    if [[ "$http_expected" == yes ]]; then test -f "$test_dir/http-checked"; else test ! -f "$test_dir/http-checked"; fi
    test ! -s "$GITHUB_OUTPUT"
  fi
  printf 'PASS: %s\n' "$label"
}
check_case 'remote tags match all three tested digests' verify-registry-tags '.' '.' pass
check_case 'missing image blocks release' verify-registry-tags '.[0:2]' '.' fail
check_case 'retargeted image blocks release' verify-registry-tags '.[0].manifest_digest = .[1].manifest_digest' '.' fail
check_case 'duplicate tag is rejected' verify-registry-tags '. + [.[0]]' '.' fail
check_case 'wrong catalog shape is rejected' verify-registry-tags '{}' '.' fail
MOCK_API_STATUS=1 check_case 'registry API failure blocks release' verify-registry-tags '.' '.' fail
check_case 'fresh app URL works even when Terraform app_url is empty' verify-release '.' '.' pass
check_case 'trailing URL slash is normalized' verify-release '.' '.[0].live_url += "/"' pass
check_case 'missing live URL fails explicitly' verify-release '.' 'del(.[0].live_url)' fail
check_case 'empty live URL is rejected' verify-release '.' '.[0].live_url = ""' fail
check_case 'insecure live URL is rejected' verify-release '.' '.[0].live_url = "http://demo.invalid"' fail
check_case 'malformed live URL is rejected' verify-release '.' '.[0].live_url = "https://"' fail
MOCK_CURL_STATUS=22 check_case 'HTTP failure blocks verification' verify-release '.' '.' fail yes
MOCK_BROKER_URL=wss://wrong.invalid/mqtt check_case 'wrong runtime broker blocks verification' verify-release '.' '.' fail yes
check_case 'stale deployment is not accepted' verify-release '.' '.[0].active_deployment.spec.services[0].image.tag = "frontend-old"' fail
check_case 'inactive deployment is not accepted' verify-release '.' '.[0].active_deployment.phase = "ERROR"' fail
check_case 'wrong registry is not accepted' verify-release '.' '.[0].active_deployment.spec.workers[0].image.registry = "other"' fail
check_case 'wrong repository is not accepted' verify-release '.' '.[0].active_deployment.spec.workers[0].image.repository = "other"' fail
check_case 'missing component is not accepted' verify-release '.' '.[0].active_deployment.spec.workers = []' fail
check_case 'tag changed after deployment is rejected' verify-release '.[0].manifest_digest = .[1].manifest_digest' '.' fail
