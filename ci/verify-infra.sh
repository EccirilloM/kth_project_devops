#!/bin/sh
set -eu
# Validate provider schemas without a Docker daemon, cloud credentials or a state backend.
mkdir -p /tmp/demo /tmp/lab /tmp/registry-bootstrap
cp /source/*.tf /tmp/demo/
cp /source/lab/*.tf /tmp/lab/
terraform -chdir=/tmp/demo init -backend=false -input=false
terraform -chdir=/tmp/demo validate
cp /source/registry.tf /source/backend.tf /tmp/registry-bootstrap/
terraform -chdir=/tmp/registry-bootstrap init -backend=false -input=false
terraform -chdir=/tmp/registry-bootstrap validate
terraform -chdir=/tmp/lab init -backend=false -input=false
terraform -chdir=/tmp/lab validate
