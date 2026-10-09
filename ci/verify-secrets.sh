#!/bin/bash
set -u
status=0
echo '=== Controlled secret-detection demonstration ==='
bash /opt/kth-devops/check-secret-gate.sh || status=1
echo '=== History and current-source secret scan ==='
bash /opt/kth-devops/scan-secrets.sh || status=1
exit "$status"
