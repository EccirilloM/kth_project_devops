import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditDecision} from '../scripts/audit-policy.mjs';

function report(patch = {}) {
  return {auditReportVersion: 2, vulnerabilities: {}, metadata: {
    vulnerabilities: {info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...patch},
  }};
}
test('dependency gate blocks high/critical findings and reports lower severities without blocking', () => {
  assert.equal(auditDecision(report()).blocked, false);
  assert.equal(auditDecision(report({moderate: 2, total: 2})).blocked, false);
  assert.equal(auditDecision(report({high: 1, total: 1})).blocked, true);
  assert.equal(auditDecision(report({critical: 1, total: 1})).blocked, true);
});
test('dependency gate never interprets a failed or malformed scan as a clean scan', () => {
  for (const sample of [null, {}, {...report(), error: {code: 'ENETWORK'}},
    report({high: '0'}), report({critical: -1}), {...report(), auditReportVersion: 999}]) {
    assert.throws(() => auditDecision(sample));
  }
});
