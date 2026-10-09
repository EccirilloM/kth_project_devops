#!/bin/bash
# Runs inside the laboratory tools container, never on the developer's host.
set -euo pipefail
umask 077
runtime=${KTH_CONTAINER_RUNTIME:?}
mkdir -p "$runtime"
if [[ ! -s "$runtime/manifest.json" ]]; then
  guest=$(openssl rand -hex 24)
  operator=$(openssl rand -hex 24)
  simulator=$(openssl rand -hex 24)
  probe=$(openssl rand -hex 24)
  jq -n --arg id "$KTH_ENVIRONMENT_ID" --arg guest "$guest" --arg operator "$operator" --arg probe "$probe" '{
    schemaVersion:1, disposable:true, environmentId:$id, network:($id+"-network"),
    frontendUrl:"http://frontend/", brokerUrl:"wss://broker:9001/mqtt",
    brokerContainer:($id+"-broker"), simulatorContainer:($id+"-simulator"), dataTimeoutMs:2000,
    operator:{username:"operator",password:$operator},
    guest:{username:"guest",password:$guest}, probe:{username:"probe",password:$probe}
  }' > "$runtime/manifest.json"
  jq -n --arg id "$KTH_ENVIRONMENT_ID" --arg runtime "$runtime" \
    --arg guest "$guest" --arg operator "$operator" --arg simulator "$simulator" --arg probe "$probe" '{
    environment_id:$id, runtime_dir:$runtime, guest_password:$guest,
    operator_password:$operator, simulator_password:$simulator, probe_password:$probe
  }' > "$runtime/private.tfvars.json"
fi
if [[ ! -s "$runtime/broker.crt" ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 7 -sha256 \
    -keyout "$runtime/ca.key" -out "$runtime/ca.crt" -subj "/CN=$KTH_ENVIRONMENT_ID CA"
  openssl req -newkey rsa:2048 -nodes -keyout "$runtime/broker.key" \
    -out "$runtime/broker.csr" -subj "/CN=broker"
  printf '%s\n' 'subjectAltName=DNS:broker' 'extendedKeyUsage=serverAuth' \
    'basicConstraints=CA:FALSE' 'keyUsage=digitalSignature,keyEncipherment' > "$runtime/server.ext"
  openssl x509 -req -in "$runtime/broker.csr" -CA "$runtime/ca.crt" -CAkey "$runtime/ca.key" \
    -CAcreateserial -out "$runtime/broker.crt" -days 7 -sha256 -extfile "$runtime/server.ext"
fi
cat > "$runtime/mosquitto.conf" <<'EOF'
persistence false
allow_anonymous false
password_file /run/kth-devops/password_file
acl_file /mosquitto/config/acl
listener 1883
protocol mqtt
listener 9001
protocol websockets
certfile /mosquitto/config/broker.crt
keyfile /mosquitto/config/broker.key
EOF
cp /workspace/simulator/mosquitto/acl "$runtime/acl"
# Only the disposable lab has this account, used for controlled fault injection and observation.
printf '\nuser probe\ntopic readwrite sail_gui/#\n' >> "$runtime/acl"
