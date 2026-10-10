#!/bin/bash
set -euo pipefail
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
recovery="$(cd "$(dirname "$0")" && pwd)/recover-app.sh"
mkdir -p "$test_dir/bin"
export RUNNER_TEMP="$test_dir" PATH="$test_dir/bin:$PATH"
export KTH_RECOVER_APP_ID=11111111-1111-1111-1111-111111111111
export GITHUB_EVENT_NAME=workflow_dispatch GITHUB_REF=refs/heads/dev KTH_BOOTSTRAP_CLOUD=false
export TF_VAR_registry_name=kth-devops-test TF_VAR_app_name=kth-devops-sailing
export TF_VAR_region=ams TF_VAR_image_repository=mqtt
export MOCK_API_STATUS=0

# Neither executable contacts a cloud service or invokes a real Terraform CLI.
cat > "$test_dir/bin/doctl" <<'MOCK'
#!/bin/bash
[[ "$MOCK_API_STATUS" == 0 ]] || exit "$MOCK_API_STATUS"
case "$*" in
  "apps get $KTH_RECOVER_APP_ID -o json") cat "$RUNNER_TEMP/app-fixture.json" ;;
  "registry repository list-tags mqtt --registry kth-devops-test -o json")
    jq '[.[0].spec | .services[], .workers[] | select(.image.tag != null) |
      {tag:.image.tag,manifest_digest:("sha256:" + ("a" * 64))}]' "$RUNNER_TEMP/app-fixture.json" ;;
  *) exit 99 ;;
esac
MOCK
cat > "$test_dir/bin/terraform" <<'MOCK'
#!/bin/bash
set -euo pipefail
case "$*" in
  'state pull') cat "$RUNNER_TEMP/cloud-state.json" ;;
  "import -input=false -lock-timeout=60s digitalocean_app.mqtt $KTH_RECOVER_APP_ID")
    test -s "$RUNNER_TEMP/pre-import.tfstate"
    for component in frontend mosquitto simulator; do
      var="TF_VAR_${component}_digest"
      [[ "${!var}" =~ ^sha256:[a-f0-9]{64}$ ]]
    done
    touch "$RUNNER_TEMP/imported"
    jq --arg id "$KTH_RECOVER_APP_ID" '.values.root_module.resources += [{mode:"managed",address:"digitalocean_app.mqtt",values:{id:$id}}]' \
      "$RUNNER_TEMP/cloud-state.json" > "$RUNNER_TEMP/imported-state.json"
    ;;
  'show -json') cat "$RUNNER_TEMP/imported-state.json" ;;
  *) echo 'Unexpected Terraform operation in recovery' >&2; exit 99 ;;
esac
MOCK
chmod +x "$test_dir/bin/doctl" "$test_dir/bin/terraform"
jq -n --arg name "$TF_VAR_registry_name" '{values:{root_module:{resources:[{mode:"managed",address:"digitalocean_container_registry.mqtt",values:{name:$name}}]}}}' > "$test_dir/base-state.json"
jq -n --arg id "$KTH_RECOVER_APP_ID" --arg name "$TF_VAR_app_name" --arg registry "$TF_VAR_registry_name" '
  def component($name): {name:$name,image:{registry_type:"DOCR",registry:$registry,repository:"mqtt",digest:("sha256:" + ("a" * 64))}};
  [{id:$id,spec:{name:$name,region:"ams",services:[component("frontend"),component("mosquitto")],workers:[component("simulator")]}}]
' > "$test_dir/base-app.json"
check_case() {
  local label=$1 app_filter=$2 state_filter=$3 expected=$4 actual=0
  rm -f "$test_dir/imported" "$test_dir/pre-import.tfstate"
  jq "$app_filter" "$test_dir/base-app.json" > "$test_dir/app-fixture.json"
  jq "$state_filter" "$test_dir/base-state.json" > "$test_dir/cloud-state.json"
  bash "$recovery" > "$test_dir/output.txt" 2>&1 || actual=$?
  if [[ "$expected" == import && ( "$actual" != 0 || ! -f "$test_dir/imported" ) ||
        "$expected" == skip && ( "$actual" != 0 || -f "$test_dir/imported" ) ||
        "$expected" == fail && ( "$actual" == 0 || -f "$test_dir/imported" ) ]]; then
    printf 'FAIL: %s\n' "$label" >&2
    cat "$test_dir/output.txt" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$label"
}
check_case 'matching app is imported with private backup and real digests' '.' '.' import
check_case 'omitted DOCR registry is accepted' '.[0].spec.services[].image |= del(.registry) | .[0].spec.workers[].image |= del(.registry)' '.' import
check_case 'unique release tags are resolved before import' '(.[0].spec.services[], .[0].spec.workers[]) |= (.image.tag = (.name + "-" + ("a" * 40) + "-123-1") | del(.image.digest))' '.' import
check_case 'mutable latest tag is rejected' '.[0].spec.services[0].image |= (del(.digest) | .tag = "latest")' '.' fail
check_case 'tag and digest together are rejected' '.[0].spec.services[0].image.tag = ("frontend-" + ("a" * 40) + "-123-1")' '.' fail
check_case 'different app ID is rejected' '.[0].id = "22222222-2222-2222-2222-222222222222"' '.' fail
check_case 'different app name is rejected' '.[0].spec.name = "other"' '.' fail
check_case 'different region is rejected' '.[0].spec.region = "nyc"' '.' fail
check_case 'different image registry is rejected' '.[0].spec.services[0].image.registry = "other"' '.' fail
check_case 'different image repository is rejected' '.[0].spec.services[0].image.repository = "other"' '.' fail
check_case 'missing image digest is rejected' 'del(.[0].spec.services[0].image.digest)' '.' fail
check_case 'extra components are rejected' '.[0].spec.databases = [{name:"extra"}]' '.' fail
check_case 'missing app response is rejected' '[]' '.' fail
check_case 'wrong response shape is rejected' '.[0]' '.' fail
check_case 'empty state is rejected' '.' '{values:{root_module:{resources:[]}}}' fail
check_case 'wrong registry in state is rejected' '.' '.values.root_module.resources[0].values.name = "other"' fail
check_case 'different app ID in state is rejected' '.' '.values.root_module.resources += [{mode:"managed",address:"digitalocean_app.mqtt",values:{id:"22222222-2222-2222-2222-222222222222"}}]' fail
check_case 'a retry does not import the same app twice' '.' '.values.root_module.resources += [{mode:"managed",address:"digitalocean_app.mqtt",values:{id:"11111111-1111-1111-1111-111111111111"}}]' skip
GITHUB_EVENT_NAME=push check_case 'push cannot recover state' '.' '.' fail
GITHUB_REF=refs/heads/main check_case 'main cannot recover state' '.' '.' fail
KTH_BOOTSTRAP_CLOUD=true check_case 'bootstrap cannot be combined with recovery' '.' '.' fail
KTH_RECOVER_APP_ID=invalid check_case 'malformed UUID is rejected' '.' '.' fail
MOCK_API_STATUS=1 check_case 'API failure cannot import an app' '.' '.' fail
