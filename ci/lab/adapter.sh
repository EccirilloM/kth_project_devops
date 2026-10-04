#!/bin/bash
set -euo pipefail
# Juozas implements only this boundary (or points KTH_LAB_ADAPTER at his script).
# Required operations: validate, up, plan, apply, logs, down.
# A missing implementation MUST fail; never replace it with an exit-0 placeholder.
echo "Terraform laboratory adapter is not connected. Implement this adapter or set KTH_LAB_ADAPTER." >&2
exit 78
