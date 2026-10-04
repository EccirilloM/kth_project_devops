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
