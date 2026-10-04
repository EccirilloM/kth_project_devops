import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {auditDecision} from './audit-policy.mjs';

mkdirSync('test-results/security', {recursive: true});
const result = spawnSync('npm', ['audit', '--json', '--audit-level=high'], {
  encoding: 'utf8', timeout: 180000, maxBuffer: 20 * 1024 * 1024,
});
try {
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    throw new Error('Dependency audit could not complete; registry/tool errors block the check.');
  }
  const report = JSON.parse(result.stdout);
  const decision = auditDecision(report);
  writeFileSync('test-results/security/npm-audit.json', JSON.stringify(report, null, 2) + '\n');
  console.log('Dependency findings (including development dependencies):', decision.counts);
  // Reject unexpected nonzero results even if a malformed report claims zero findings.
  process.exitCode = decision.blocked || result.status !== 0 ? 1 : 0;
} catch (error) {
  writeFileSync('test-results/security/audit-error.txt', 'Audit did not produce a valid completed result.\n');
  console.error(error.message);
  process.exitCode = 2;
}
