import mqtt from 'mqtt';
import { createBoat, step, telemetry } from './boat.js';
import { handleCommand } from './commands.js';
import { MAX_PAYLOAD_BYTES, TOPICS } from './topics.js';

const url = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';
const hz = Number(process.env.TELEMETRY_HZ_MS || 1000);
const boat = createBoat();

if (!process.env.MQTT_USERNAME || !process.env.MQTT_PASSWORD) {
  throw new Error('MQTT_USERNAME and MQTT_PASSWORD must be supplied at runtime.');
}

const client = mqtt.connect(url, {
  protocolVersion: 5,
  clean: true,
  clientId: process.env.MQTT_CLIENT_ID || `sail-sim-${process.pid}`,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 2000,
  connectTimeout: 10000,
  queueQoSZero: false,
});

let timer: NodeJS.Timeout | undefined;

function pub(topic: string, payload: unknown, qos: 0 | 1 = 0) {
  const buf = Buffer.from(JSON.stringify(payload));
  if (buf.length > MAX_PAYLOAD_BYTES) return;
  client.publish(topic, buf, { qos, retain: false });
}

function tick() {
  if (!client.connected) return;
  step(boat);
  for (const m of telemetry(boat, Date.now())) pub(m.topic, m.payload);
}

console.log('connecting', url);

client.on('connect', () => {
  console.log('connected');
  client.subscribe([TOPICS.start, TOPICS.stop], { qos: 1 });
  if (timer) clearInterval(timer);
  timer = setInterval(tick, hz);
  tick();
});

client.on('message', (topic, payload, packet) => {
  if (packet.retain) return;
  for (const m of handleCommand(boat, topic, payload)) {
    pub(m.topic, m.payload, m.qos ?? 0);
  }
});

client.on('error', (e) => console.error(e.message));

process.on('SIGINT', () => {
  if (timer) clearInterval(timer);
  client.end(true, () => process.exit(0));
});
process.on('SIGTERM', () => {
  if (timer) clearInterval(timer);
  client.end(true, () => process.exit(0));
});
