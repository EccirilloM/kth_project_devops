import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditDecision, auditDetails} from '../scripts/audit-policy.mjs';

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

test('audit diagnostics identify advisories and inherited findings without hiding the blocking decision', () => {
  const sample = report({high: 2, total: 2});
  sample.vulnerabilities = {
    parser: {
      severity: 'high', range: '<1.2.2',
      via: [{title: 'Nonfunctional diagnostic example', url: 'https://example.test/advisory'}],
      fixAvailable: true,
    },
    tool: {
      severity: 'high', range: '<2.0.0', via: ['parser'],
      fixAvailable: {name: 'tool', version: '2.0.0', isSemVerMajor: true},
    },
  };
  assert.equal(auditDecision(sample).blocked, true);
  const details = auditDetails(sample).join('\n');
  assert.match(details, /parser: high/);
  assert.match(details, /https:\/\/example\.test\/advisory/);
  assert.match(details, /Via dependency: parser/);
  assert.match(details, /tool@2\.0\.0 \(major upgrade; review compatibility\)/);
  assert.deepEqual(auditDetails(report()), []);
});
