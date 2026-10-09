#!/bin/sh
set -eu

cd /app/FE
rm -f /tmp/kth-devops-ready
echo 'Installing dependencies in the kth-devops Docker volume...'
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  # The first start also writes FE/package-lock.json on the host.
  npm install --no-audit --no-fund
fi

touch /tmp/kth-devops-ready
echo 'Dependencies installed. kth-devops workspace ready; Angular is not running yet.'
exec "$@"
