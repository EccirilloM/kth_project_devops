import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_CONFIG, DEFAULT_APP_CONFIG } from '../src/app/core/mqtt/app-config';
import { parseRuntimeConfig, loadRuntimeConfig } from '../src/app/core/mqtt/runtime-config';
import { AuthRoles } from '../src/app/dtos/auth/auth-roles';

test('an unconfigured checkout has no operational broker or credentials', () => {
  assert.equal(APP_CONFIG.brokerUrl, '');
  const config = parseRuntimeConfig({brokerUrl: ''});
  assert.equal(config.brokerUrl, '');
  assert.equal(Object.hasOwn(config, 'password'), false);
  assert.notEqual(config.users, DEFAULT_APP_CONFIG.users);
});

test('environment settings change independently of defaults and enforce UI role values', () => {
  const config = parseRuntimeConfig({
    brokerUrl: 'wss://broker.example:9001/mqtt',
    users: {visitor: 'GUEST', captain: 'ADMIN'}, dataTimeoutMs: 1200,
  });
  assert.equal(config.brokerUrl, 'wss://broker.example:9001/mqtt');
  assert.deepEqual(config.users, {visitor: AuthRoles.Guest, captain: AuthRoles.Admin});
  assert.equal(config.dataTimeoutMs, 1200);
  assert.equal(config.reconnectMs, DEFAULT_APP_CONFIG.reconnectMs);
  assert.equal(APP_CONFIG.brokerUrl, '');
  assert.equal(DEFAULT_APP_CONFIG.dataTimeoutMs, 5000);
});

test('invalid configuration cannot silently select a fallback broker', () => {
  for (const value of [null, [], {}, {brokerUrl: 123},
    {brokerUrl: 'ws://broker.example'}, {brokerUrl: 'wss://user:pass@broker.example'},
    {brokerUrl: 'wss://broker.example?token=fake'}, {brokerUrl: '', password: 'nonfunctional'},
    {brokerUrl: '', users: {}}, {brokerUrl: '', users: []},
    {brokerUrl: '', users: {guest: 'SUPERUSER'}}, {brokerUrl: '', users: {' guest': 'GUEST'}},
    {brokerUrl: '', reconnectMs: 0}, {brokerUrl: '', dataTimeoutMs: -1},
    {brokerUrl: '', maxPayloadBytes: 1.5}, {brokerUrl: '', connectTimeoutMs: 2147483648},
  ]) assert.throws(() => parseRuntimeConfig(value));
  assert.equal(APP_CONFIG.brokerUrl, '');
});

test('runtime loading respects a Pages subpath and bypasses cached environment settings', async () => {
  let requestedUrl = '';
  let requestedCache: RequestCache | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedCache = init?.cache;
    return Response.json({brokerUrl: 'wss://broker.example/mqtt'});
  };
  const config = await loadRuntimeConfig('https://course.example/kth_project_devops/', fetcher);
  assert.equal(requestedUrl, 'https://course.example/kth_project_devops/assets/config.json');
  assert.equal(requestedCache, 'no-store');
  assert.equal(config.brokerUrl, 'wss://broker.example/mqtt');
});

test('missing, malformed or unreachable configuration rejects startup', async () => {
  const base = 'https://course.example/project/';
  await assert.rejects(loadRuntimeConfig(base, async () => new Response('', {status: 404})));
  await assert.rejects(loadRuntimeConfig(base, async () => new Response('<html>not JSON</html>')));
  await assert.rejects(loadRuntimeConfig(base, async () => { throw new Error('Network unavailable'); }));
});
