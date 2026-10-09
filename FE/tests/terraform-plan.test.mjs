import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertNoChanges} from '../scripts/terraform-plan.mjs';
const plan = () => ({format_version: '1.2', planned_values: {}, resource_changes: [], output_changes: {}});
test('idempotence requires no resource/output changes, drift or deferred work', () => {
  assert.equal(assertNoChanges(plan()).resourceChanges, 0);
  for (const actions of [['create'], ['update'], ['delete'], ['delete', 'create'], ['read']]) {
    assert.throws(() => assertNoChanges({...plan(), resource_changes: [{change: {actions}}]}));
    assert.throws(() => assertNoChanges({...plan(), output_changes: {endpoint: {actions}}}));
  }
  assert.throws(() => assertNoChanges({...plan(), resource_drift: [{change: {actions: ['update']}}]}));
  for (const patch of [{complete: false}, {errored: true}, {deferred_changes: [{}]}, {format_version: 'unknown'}]) {
    assert.throws(() => assertNoChanges({...plan(), ...patch}));
  }
  assert.throws(() => assertNoChanges({}));
});

const dockerDrift = () => ({
  mode: 'managed', type: 'docker_container', provider_name: 'registry.terraform.io/kreuzwerker/docker',
  change: {
    actions: ['update'],
    before: {id: 'container-example', dns: null, dns_opts: null, dns_search: null, group_add: null,
      log_opts: null, storage_opts: null, sysctls: null, tmpfs: null, env: ['EXAMPLE=value']},
    after: {id: 'container-example', dns: [], dns_opts: [], dns_search: [], group_add: [],
      log_opts: {}, storage_opts: {}, sysctls: {}, tmpfs: {}, env: ['EXAMPLE=value']},
  },
});
test('Docker refresh can normalize unset collections while every planned action remains no-op', () => {
  const network = {mode: 'managed', type: 'docker_network', provider_name: 'registry.terraform.io/kreuzwerker/docker',
    change: {actions: ['update'], before: {ipam_options: null}, after: {ipam_options: {}}}};
  const result = assertNoChanges({...plan(), resource_drift: [dockerDrift(), network]});
  assert.equal(result.normalizedDriftResources, 2);
  assert.equal(result.resourceChanges, 0);
  // Even an empty-collection normalization must not excuse an actual planned update.
  assert.throws(() => assertNoChanges({...plan(), resource_changes: [dockerDrift()]}));
});
test('Docker refresh exception never hides changed values, credentials, unknown fields or other providers', () => {
  const mutations = [
    item => { item.change.after.dns = ['192.0.2.1']; },
    item => { item.change.after.dns = {}; },
    item => { item.change.after.env = ['EXAMPLE=changed']; },
    item => { item.change.after.id = 'different-container'; },
    item => { item.change.before.labels = null; item.change.after.labels = []; },
    item => { item.provider_name = 'registry.terraform.io/example/other'; },
    item => { item.type = 'docker_volume'; },
    item => { item.change.actions = ['delete', 'create']; },
  ];
  for (const mutate of mutations) {
    const item = dockerDrift();
    mutate(item);
    assert.throws(() => assertNoChanges({...plan(), resource_drift: [item]}));
  }
});
