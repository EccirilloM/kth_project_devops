import { AuthRoles } from '../../dtos/auth/auth-roles';

// PUBLIC configuration: these values are shipped to every browser. No passwords here.
export const APP_CONFIG = {
  brokerUrl: '',
  users: {
    guest: AuthRoles.Guest,
    Guest: AuthRoles.Guest,
    operator: AuthRoles.Admin,
    Staff: AuthRoles.Admin,
    staff: AuthRoles.Admin,
  } as Record<string, AuthRoles>,
  connectTimeoutMs: 12000,
  reconnectMs: 5000,
  dataTimeoutMs: 5000,
  diagnosticTimeoutMs: 15000,
  recordingTimeoutMs: 5000,
  commandTimeoutMs: 10000,
  maxPayloadBytes: 65536,
};

export type AppConfig = typeof APP_CONFIG;

const CONFIG_MISSING = 'Configurazione del broker mancante. Contatta il responsabile del team.';
const CONFIG_INVALID = 'Configurazione del broker non valida. Contatta il responsabile del team.';
const CONFIG_UNREACHABLE = 'Impossibile caricare la configurazione del broker. Contatta il responsabile del team.';

// UI profiles only. The broker's ACLs must independently enforce every permission.
export function roleForUsername(username: string, config: AppConfig): AuthRoles | null {
  return Object.hasOwn(config.users, username) ? config.users[username] : null;
}

export function brokerUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error('Indirizzo del broker non configurato. Contatta il responsabile del team.'); }
  if (url.protocol !== 'wss:' || url.username || url.password || url.hash || url.search) {
    throw new Error('Il broker deve usare un indirizzo wss:// senza credenziali o parametri.');
  }
  return url.toString();
}

function positiveInt(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(CONFIG_INVALID);
  }
  return value;
}

function parseUsers(value: unknown): Record<string, AuthRoles> {
  if (value === undefined) return {...APP_CONFIG.users};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(CONFIG_INVALID);
  }
  const users: Record<string, AuthRoles> = {};
  for (const [username, role] of Object.entries(value as Record<string, unknown>)) {
    if (role !== AuthRoles.Guest && role !== AuthRoles.Admin) throw new Error(CONFIG_INVALID);
    users[username] = role;
  }
  return users;
}

/** Validate public runtime JSON. Never substitutes an operational broker URL. */
export function parseRuntimeConfig(raw: unknown): AppConfig {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(CONFIG_INVALID);
  const data = raw as Record<string, unknown>;
  const url = data['brokerUrl'];
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('Indirizzo del broker non configurato. Contatta il responsabile del team.');
  }
  return {
    brokerUrl: brokerUrl(url),
    users: parseUsers(data['users']),
    connectTimeoutMs: positiveInt(data['connectTimeoutMs'], APP_CONFIG.connectTimeoutMs),
    reconnectMs: positiveInt(data['reconnectMs'], APP_CONFIG.reconnectMs),
    dataTimeoutMs: positiveInt(data['dataTimeoutMs'], APP_CONFIG.dataTimeoutMs),
    diagnosticTimeoutMs: positiveInt(data['diagnosticTimeoutMs'], APP_CONFIG.diagnosticTimeoutMs),
    recordingTimeoutMs: positiveInt(data['recordingTimeoutMs'], APP_CONFIG.recordingTimeoutMs),
    commandTimeoutMs: positiveInt(data['commandTimeoutMs'], APP_CONFIG.commandTimeoutMs),
    maxPayloadBytes: positiveInt(data['maxPayloadBytes'], APP_CONFIG.maxPayloadBytes),
  };
}

/** Fetch `./config.json` (Pages-friendly relative URL). Missing/invalid config fails hard. */
export async function loadRuntimeConfig(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  url = './config.json',
): Promise<AppConfig> {
  let response: Response;
  try {
    response = await fetchImpl(url, {cache: 'no-store'});
  } catch {
    throw new Error(CONFIG_UNREACHABLE);
  }
  if (!response.ok) throw new Error(CONFIG_MISSING);
  let raw: unknown;
  try { raw = await response.json(); }
  catch { throw new Error(CONFIG_INVALID); }
  return parseRuntimeConfig(raw);
}
