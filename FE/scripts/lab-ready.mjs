import {readFileSync} from 'node:fs';
import {connectAsync} from 'mqtt';
const lab = JSON.parse(readFileSync(process.env.KTH_LAB_MANIFEST, 'utf8'));
const ca = readFileSync('/lab/ca.crt');
const response = await fetch(lab.frontendUrl, {signal: AbortSignal.timeout(10000)});
if (!response.ok) throw new Error('Laboratory frontend is not ready.');
let client;
try {
  client = await connectAsync(lab.brokerUrl, {
    ...lab.probe, protocolVersion: 5, reconnectPeriod: 0, connectTimeout: 15000,
    ca, rejectUnauthorized: true, wsOptions: {ca, rejectUnauthorized: true},
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Simulator telemetry did not arrive.')), 20000);
    client.on('message', () => {clearTimeout(timer); resolve();});
    client.subscribe('sail_gui/data/dashboard_data', {qos: 0}, error => {
      if (error) {clearTimeout(timer); reject(new Error('Probe subscription failed.'));}
    });
  });
  console.log('Frontend, broker TLS/authentication and simulator telemetry are ready.');
} catch {
  throw new Error('Laboratory readiness failed; inspect redacted diagnostics.');
} finally {
  if (client) await client.endAsync(true);
}
