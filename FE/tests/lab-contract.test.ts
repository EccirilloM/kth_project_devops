import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseLab} from '../scripts/lab-contract';
const id = 'kth-devops-it-test';
const fixture = () => ({schemaVersion: 1, disposable: true, environmentId: id,
  network: id + '-network', brokerContainer: id + '-broker', simulatorContainer: id + '-simulator',
  frontendUrl: 'http://frontend/', brokerUrl: 'wss://broker:9001/mqtt', dataTimeoutMs: 2000,
  operator: {username: 'operator', password: 'nonfunctional-test-password'}, guest: {username: 'guest', password: 'nonfunctional-test-password'},
  probe: {username: 'probe', password: 'nonfunctional-test-password'}});
test('laboratory contract accepts separate ephemeral identities and rejects cross-environment resources', () => {
  assert.equal(parseLab(fixture(), id).network, id + '-network');
  for (const patch of [{disposable: false}, {environmentId: 'demo'}, {brokerContainer: 'sailing-team-broker'},
    {network: '../other'}, {dataTimeoutMs: -1}, {brokerUrl: 'ws://broker'},
    {frontendUrl: 'http://user:password@frontend/'}, {guest: fixture().operator},
    {frontendUrl: 'http://frontend/no-trailing-slash'}]) {
    assert.throws(() => parseLab({...fixture(), ...patch}, id));
  }
  assert.throws(() => parseLab(fixture(), ''));
});

test('Playwright loads the real integration configuration and discovers tests without a broker', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kth-devops-discovery-'));
  const manifest = join(directory, 'manifest.json');
  try {
    writeFileSync(manifest, JSON.stringify(fixture()));
    // --list exercises Playwright's module loader without starting browsers or MQTT connections.
    const result = spawnSync(process.execPath, [
      'node_modules/@playwright/test/cli.js', 'test', '--list', '--config', 'playwright.integration.config.ts',
    ], {
      encoding: 'utf8', timeout: 20000,
      env: {...process.env, KTH_LAB_MANIFEST: manifest, KTH_EXPECTED_ENVIRONMENT: id},
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Total: [1-9]\d* tests? in/);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
