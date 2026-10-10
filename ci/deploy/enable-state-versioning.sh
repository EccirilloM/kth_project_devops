#!/bin/bash
# One-time, interactive administration; never run with shell tracing enabled.
set +x
set -euo pipefail

bucket=${1:?Usage: enable-state-versioning.sh BUCKET SPACES_REGION}
region=${2:?Specify the physical Spaces region, for example ams3}
[[ "$bucket" =~ ^kth-devops-[a-z0-9-]+$ && "$region" =~ ^[a-z]{3}[0-9]+$ ]] || {
  echo 'Expected a dedicated kth-devops- bucket and a Spaces region such as ams3.' >&2
  exit 1
}
[[ -t 0 ]] || { echo 'Run interactively with docker run --rm -it.' >&2; exit 1; }

trap 'unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY' EXIT
unset AWS_SESSION_TOKEN AWS_PROFILE
export AWS_DEFAULT_REGION=us-east-1 AWS_EC2_METADATA_DISABLED=true AWS_PAGER=''
printf 'Enable object versioning for %s at %s. No objects will be deleted.\n' "$bucket" "$region"
read -r -s -p 'Temporary Spaces access key ID (hidden): ' AWS_ACCESS_KEY_ID
printf '\n'
read -r -s -p 'Temporary Spaces secret key (hidden): ' AWS_SECRET_ACCESS_KEY
printf '\n'
[[ -n "$AWS_ACCESS_KEY_ID" && -n "$AWS_SECRET_ACCESS_KEY" ]] || {
  echo 'Both credentials are required.' >&2
  exit 1
}
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
aws --version
aws s3api put-bucket-versioning --bucket "$bucket" \
  --endpoint-url "https://${region}.digitaloceanspaces.com" \
  --versioning-configuration Status=Enabled
status=$(aws s3api get-bucket-versioning --bucket "$bucket" \
  --endpoint-url "https://${region}.digitaloceanspaces.com" --query Status --output text)
[[ "$status" == Enabled ]] || { echo 'Versioning could not be confirmed.' >&2; exit 1; }
echo 'Object versioning: Enabled'
echo 'Revoke the temporary Full Access key in DigitalOcean. Keep the separate Terraform bucket key.'
