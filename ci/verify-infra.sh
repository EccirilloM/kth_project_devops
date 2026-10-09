#!/bin/sh
set -eu
# Validate provider schemas without a Docker daemon, cloud credentials or a state backend.
mkdir -p /tmp/demo /tmp/lab
cp /source/*.tf /tmp/demo/
cp /source/lab/*.tf /tmp/lab/
terraform -chdir=/tmp/demo init -backend=false -input=false
terraform -chdir=/tmp/demo validate
terraform -chdir=/tmp/lab init -backend=false -input=false
terraform -chdir=/tmp/lab validate
