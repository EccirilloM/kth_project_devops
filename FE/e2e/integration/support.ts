import {request} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {connectAsync, type MqttClient} from 'mqtt';
import {expect, type Page} from '@playwright/test';
import {readLab, type LabCredentials} from '../../scripts/lab-contract';
export const lab = readLab();

async function docker(path: string, method = 'GET'): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request({socketPath: '/var/run/docker.sock', path, method}, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        if (![200, 204, 304].includes(response.statusCode ?? 0)) {
          reject(new Error('Laboratory Docker operation failed.')); return;
        }
        resolve(Buffer.concat(chunks).toString());
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error('Laboratory Docker operation timed out.')));
    req.on('error', () => reject(new Error('Cannot access laboratory Docker daemon.')));
    req.end();
  });
}

export async function control(component: 'broker' | 'simulator', action: 'start' | 'stop'): Promise<void> {
  const name = component === 'broker' ? lab.brokerContainer : lab.simulatorContainer;
  const info = JSON.parse(await docker('/containers/' + encodeURIComponent(name) + '/json'));
  if (info.Config?.Labels?.['kth.devops.environment'] !== lab.environmentId ||
      !Object.hasOwn(info.NetworkSettings?.Networks ?? {}, lab.network)) {
    throw new Error('Refusing to control a container without this laboratory identity and network.');
  }
  await docker('/containers/' + encodeURIComponent(name) + '/' + action + '?t=1', 'POST');
}

export async function mqttClient(credentials: LabCredentials): Promise<MqttClient> {
  const ca = readFileSync('/lab/ca.crt');
  try {
    return await connectAsync(lab.brokerUrl, {
      ...credentials, protocolVersion: 5, clientId: 'kth_test_' + randomUUID(),
      clean: true, reconnectPeriod: 0, connectTimeout: 10000, queueQoSZero: false,
      ca, rejectUnauthorized: true, wsOptions: {ca, rejectUnauthorized: true},
    });
  } catch { throw new Error('Laboratory MQTT authentication/TLS connection failed.'); }
}

export async function login(page: Page, credentials = lab.operator): Promise<void> {
  const allowed = new Set([new URL(lab.frontendUrl).origin, new URL(lab.brokerUrl).origin]);
  await page.route('**/*', route => allowed.has(new URL(route.request().url()).origin)
    ? route.continue() : route.abort());
  await page.goto(lab.frontendUrl);
  await page.getByLabel('Username', {exact: true}).fill(credentials.username);
  await page.getByLabel('Password', {exact: true}).fill(credentials.password);
  await page.getByRole('button', {name: 'Sign in'}).click();
  await expect(page.getByTestId('connection-status')).toHaveText('MQTT: connected');
}

export async function live(page: Page): Promise<void> {
  await expect(page.getByTestId('telemetry-status')).toHaveText('Live telemetry');
  await expect(page.getByTestId('roll-value')).toBeVisible();
}

export function sample(roll = 12, pitch = -3, yaw = 87) {
  return {stamp: {sec: Math.floor(Date.now() / 1000), nanosec: 0}, roll, pitch, yaw,
    sog: 4, vmg: 3, twa: 35, twd: 125, tws: 8};
}
