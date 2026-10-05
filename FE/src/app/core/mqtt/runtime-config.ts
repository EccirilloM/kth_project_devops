import { DEFAULT_APP_CONFIG, brokerUrl, type AppConfig } from './app-config';
import { AuthRoles } from '../../dtos/auth/auth-roles';

const numericKeys = [
  'connectTimeoutMs', 'reconnectMs', 'dataTimeoutMs',
  'recordingTimeoutMs', 'commandTimeoutMs', 'maxPayloadBytes',
] as const;

/** Public settings only: credentials must never be placed in this file. */
export function parseRuntimeConfig(value: unknown): AppConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Runtime configuration must be a JSON object.');
  }
  const raw = value as Record<string, unknown>;
  const allowed = new Set<string>(['brokerUrl', 'users', ...numericKeys]);
  if (Object.keys(raw).some(key => !allowed.has(key))) {
    throw new Error('Runtime configuration contains unsupported fields.');
  }
  if (typeof raw['brokerUrl'] !== 'string') {
    throw new Error('Runtime configuration requires brokerUrl.');
  }
  const config: AppConfig = {
    ...DEFAULT_APP_CONFIG,
    users: {...DEFAULT_APP_CONFIG.users},
    // Empty is an intentional unconfigured state; it never selects an external broker.
    brokerUrl: raw['brokerUrl'] === '' ? '' : brokerUrl(raw['brokerUrl']),
  };
  if (Object.hasOwn(raw, 'users')) {
    const users = raw['users'];
    if (!users || typeof users !== 'object' || Array.isArray(users)) {
      throw new Error('Runtime users must map usernames to GUEST or ADMIN.');
    }
    const entries = Object.entries(users);
    if (!entries.length || entries.some(([name, role]) =>
      !name.trim() || name !== name.trim() || ![AuthRoles.Guest, AuthRoles.Admin].includes(role))) {
      throw new Error('Runtime users must map nonempty usernames to GUEST or ADMIN.');
    }
    config.users = Object.fromEntries(entries) as Record<string, AuthRoles>;
  }
  for (const key of numericKeys) {
    if (!Object.hasOwn(raw, key)) continue;
    const number = raw[key];
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number <= 0 || number > 2147483647) {
      throw new Error('Runtime limits must be positive integers within the supported range.');
    }
    config[key] = number;
  }
  return config;
}

export async function loadRuntimeConfig(baseUrl: string, fetcher: typeof fetch = fetch): Promise<AppConfig> {
  const response = await fetcher(new URL('assets/config.json', baseUrl), {
    cache: 'no-store', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Runtime configuration could not be loaded.');
  return parseRuntimeConfig(await response.json());
}
