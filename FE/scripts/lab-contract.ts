import {readFileSync} from 'node:fs';

export interface LabCredentials { username: string; password: string }
export interface Lab {
  schemaVersion: 1;
  disposable: true;
  environmentId: string;
  network: string;
  frontendUrl: string;
  brokerUrl: string;
  brokerContainer: string;
  simulatorContainer: string;
  dataTimeoutMs: number;
  operator: LabCredentials;
  guest: LabCredentials;
  probe: LabCredentials;
}

export function parseLab(value: unknown, expectedEnvironment: string): Lab {
  if (!value || typeof value !== 'object') throw new Error('Missing laboratory manifest.');
  const lab = value as Lab;
  if (lab.schemaVersion !== 1 || lab.disposable !== true ||
      !/^kth-devops-it-[a-z0-9-]{1,40}$/.test(expectedEnvironment) ||
      lab.environmentId !== expectedEnvironment) throw new Error('Expected an explicitly disposable, identified laboratory.');
  for (const name of [lab.network, lab.brokerContainer, lab.simulatorContainer]) {
    if (typeof name !== 'string' || !name.startsWith(expectedEnvironment + '-') ||
        !/^[a-z0-9-]{1,100}$/.test(name)) throw new Error('Laboratory resource name is outside this environment.');
  }
  if (lab.brokerContainer === lab.simulatorContainer) throw new Error('Laboratory containers must be distinct.');
  for (const [address, protocols] of [[lab.frontendUrl, ['http:', 'https:']], [lab.brokerUrl, ['wss:']]] as const) {
    let url: URL;
    try { url = new URL(address); } catch { throw new Error('Invalid laboratory endpoint.'); }
    if (!(protocols as readonly string[]).includes(url.protocol) || url.username || url.password || url.hash || url.search) {
      throw new Error('Unsupported laboratory endpoint.');
    }
  }
  if (!lab.frontendUrl.endsWith('/')) throw new Error('Frontend URL must end with a slash.');
  if (!Number.isSafeInteger(lab.dataTimeoutMs) || lab.dataTimeoutMs < 500 || lab.dataTimeoutMs > 10000) {
    throw new Error('Laboratory freshness timeout must be 500..10000 ms.');
  }
  for (const credentials of [lab.operator, lab.guest, lab.probe]) {
    if (!credentials || typeof credentials.username !== 'string' || !credentials.username.trim() ||
        typeof credentials.password !== 'string' || !/^[A-Za-z0-9_-]{24,128}$/.test(credentials.password)) {
      throw new Error('Temporary passwords must contain 24..128 URL-safe characters.');
    }
  }
  if (new Set([lab.operator.username, lab.guest.username, lab.probe.username]).size !== 3) {
    throw new Error('Operator, guest and probe must use separate accounts.');
  }
  return lab;
}

export function readLab(): Lab {
  const manifest = process.env['KTH_LAB_MANIFEST'];
  if (!manifest) throw new Error('KTH_LAB_MANIFEST is required; no operational fallback exists.');
  let value: unknown;
  try { value = JSON.parse(readFileSync(manifest, 'utf8')); }
  catch { throw new Error('Laboratory manifest cannot be read as JSON.'); }
  return parseLab(value, process.env['KTH_EXPECTED_ENVIRONMENT'] ?? '');
}
