import {test} from 'node:test';
import assert from 'node:assert/strict';
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
