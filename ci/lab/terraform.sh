#!/bin/bash
# Private state, plans and logs are confined to one ignored environment directory.
set -euo pipefail
umask 077
runtime=${KTH_CONTAINER_RUNTIME:?}
work="$runtime/terraform"
mkdir -p "$work"
cp /workspace/infra/lab/main.tf "$work/main.tf"
cd "$work"
case "${1:?operation}" in
  validate)
    terraform init -input=false
    terraform validate
    ;;
  up|apply)
    terraform apply -input=false -auto-approve -var-file="$runtime/private.tfvars.json" -var-file="$runtime/images.tfvars.json"
    ;;
  plan)
    terraform plan -input=false -out="$runtime/plan.tfplan" -var-file="$runtime/private.tfvars.json" -var-file="$runtime/images.tfvars.json"
    terraform show -json "$runtime/plan.tfplan" > "$runtime/plan.json"
    ;;
  down)
    if [[ -s terraform.tfstate ]]; then
      terraform destroy -input=false -auto-approve -var-file="$runtime/private.tfvars.json" -var-file="$runtime/images.tfvars.json"
    fi
    ;;
  *) exit 2 ;;
esac
