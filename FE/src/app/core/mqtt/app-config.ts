import { AuthRoles } from '../../dtos/auth/auth-roles';

// PUBLIC configuration: these values are shipped to every browser. No passwords here.
export const DEFAULT_APP_CONFIG = {
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
  recordingTimeoutMs: 5000,
  commandTimeoutMs: 10000,
  maxPayloadBytes: 65536,
};

export type AppConfig = typeof DEFAULT_APP_CONFIG;

// Populated once from public runtime configuration before Angular starts.
export const APP_CONFIG: AppConfig = {...DEFAULT_APP_CONFIG, users: {...DEFAULT_APP_CONFIG.users}};

// UI profiles only. The broker's ACLs must independently enforce every permission.
export function roleForUsername(username: string, config: AppConfig): AuthRoles | null {
  return Object.hasOwn(config.users, username) ? config.users[username] : null;
}

export function brokerUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error('Broker address is not configured. Contact the team administrator.'); }
  if (url.protocol !== 'wss:' || url.username || url.password || url.hash || url.search) {
    throw new Error('The broker must use a wss:// address without credentials, query parameters or a fragment.');
  }
  return url.toString();
}
