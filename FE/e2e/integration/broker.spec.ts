import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {TOPICS} from '../../src/app/core/mqtt/topics';
import {lab, control, mqttClient, login, live, sample} from './support';

test('laboratory serves the exact checked build and its own public runtime settings', async ({request}) => {
  const manifest = JSON.parse(await readFile('dist/sail-monitoring-web/browser/build-manifest.json', 'utf8'));
  for (const [name, hash] of Object.entries(manifest.files)) {
    const response = await request.get(new URL(name, lab.frontendUrl).href);
    expect(response.ok(), 'Compiled asset must be served').toBe(true);
    expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(hash);
  }
  const response = await request.get(new URL('assets/config.json', lab.frontendUrl).href);
  expect(response.ok()).toBe(true);
  const config = await response.json();
  expect(config.brokerUrl).toBe(lab.brokerUrl);
  expect(config.dataTimeoutMs).toBe(lab.dataTimeoutMs);
  expect(config.users[lab.operator.username]).toBe('ADMIN');
  expect(config.users[lab.guest.username]).toBe('GUEST');
});

test('live simulator telemetry and recording commands travel through the real broker', async ({page}) => {
  await login(page);
  await live(page);
  await expect(page.getByTestId('recording-status')).toHaveText('Stopped');
  await page.getByRole('button', {name: 'Start recording', exact: true}).click();
  try {
    await expect(page.getByTestId('recording-status')).toHaveText('Recording');
  } finally {
    // Restore state when possible; errors still fail the test.
    await expect(page.getByRole('button', {name: 'Stop recording', exact: true})).toBeEnabled();
    await page.getByRole('button', {name: 'Stop recording', exact: true}).click();
  }
  await expect(page.getByTestId('recording-status')).toHaveText('Stopped');
});

test('known samples reach the UI; malformed samples do not renew freshness', async ({page}) => {
  await login(page);
  await live(page);
  const client = await mqttClient(lab.probe);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.name));
  try {
    await control('simulator', 'stop');
    await client.publishAsync(TOPICS.dashboard, JSON.stringify(sample()), {qos: 1, retain: false});
    await expect(page.getByTestId('roll-value')).toHaveText('12');
    await expect(page.getByTestId('pitch-value')).toHaveText('-3');
    await expect(page.getByTestId('yaw-value')).toHaveText('87');
    // Keep invalid input arriving beyond the entire freshness interval.
    const deadline = Date.now() + lab.dataTimeoutMs + 1200;
    while (Date.now() < deadline) {
      await client.publishAsync(TOPICS.dashboard, '{broken', {qos: 1});
      await client.publishAsync(TOPICS.dashboard, JSON.stringify({...sample(), roll: 'invalid'}), {qos: 1});
      await delay(200);
    }
    await expect(page.getByTestId('telemetry-status')).toHaveText('Waiting for fresh telemetry');
    await expect(page.getByTestId('connection-status')).toHaveText('MQTT: connected');
    expect(errors).toEqual([]);
    await client.publishAsync(TOPICS.dashboard, JSON.stringify(sample(21)), {qos: 1});
    await expect(page.getByTestId('roll-value')).toHaveText('21');
  } finally {
    await client.endAsync(true);
    await control('simulator', 'start');
  }
});

test('stopping the simulator expires data without a broker disconnection', async ({page}) => {
  await login(page);
  await live(page);
  try {
    await control('simulator', 'stop');
    await expect(page.getByTestId('telemetry-status')).toHaveText('Waiting for fresh telemetry',
      {timeout: lab.dataTimeoutMs + 5000});
    await expect(page.getByTestId('connection-status')).toHaveText('MQTT: connected');
    await expect(page.getByRole('button', {name: 'Start recording', exact: true})).toBeDisabled();
  } finally { await control('simulator', 'start'); }
  await live(page);
});

test('broker outage is visible and fresh data returns after broker restart', async ({page}) => {
  await login(page);
  await live(page);
  try {
    await control('broker', 'stop');
    await expect(page.getByTestId('connection-status')).not.toHaveText('MQTT: connected');
    await expect(page.getByTestId('telemetry-status')).toHaveText('Waiting for fresh telemetry');
  } finally { await control('broker', 'start'); }
  await expect(page.getByTestId('connection-status')).toHaveText('MQTT: connected', {timeout: 30000});
  await live(page);
});

test('broker denies guest commands while delivering operator commands on the same topics', async ({page}) => {
  await login(page, lab.guest);
  await live(page);
  await expect(page.getByRole('button', {name: 'Start recording', exact: true})).toHaveCount(0);
  const observer = await mqttClient(lab.probe);
  const operator = await mqttClient(lab.operator);
  const guest = await mqttClient(lab.guest);
  const received = new Set<string>();
  observer.on('message', (_topic, payload) => received.add(payload.toString()));
  try {
    const grants = await observer.subscribeAsync([TOPICS.start, TOPICS.stop], {qos: 1});
    expect(grants.every(grant => Number(grant.qos) < 128)).toBe(true);
    for (const topic of [TOPICS.start, TOPICS.stop]) {
      const positive = JSON.stringify({requestId: randomUUID()});
      await operator.publishAsync(topic, positive, {qos: 1, retain: false});
      await expect.poll(() => received.has(positive)).toBe(true);
      const forbidden = JSON.stringify({requestId: randomUUID()});
      let denied = false;
      const onPacket = (packet: {cmd: string; reasonCode?: number}) => {
        if (packet.cmd === 'puback' && packet.reasonCode === 0x87) denied = true;
      };
      guest.on('packetreceive', onPacket);
      try { await guest.publishAsync(topic, forbidden, {qos: 1, retain: false}); }
      catch { /* Require the explicit MQTT 5 denial below; a timeout is not proof. */ }
      guest.off('packetreceive', onPacket);
      expect(denied, 'Guest must receive MQTT 5 Not authorized PUBACK').toBe(true);
      await delay(1000);
      expect(received.has(forbidden), 'Unauthorized command must not reach the subscriber').toBe(false);
      expect(observer.connected, 'Observation connection must remain active').toBe(true);
    }
  } finally {
    await Promise.all([observer.endAsync(true), operator.endAsync(true), guest.endAsync(true)]);
  }
});
