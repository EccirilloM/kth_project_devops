import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {ESLint} from 'eslint';

const eslint = new ESLint();
const [bad] = await eslint.lintText('debugger;\n', {filePath: 'src/gate-probe.ts'});
assert.ok(bad.messages.some(message => message.ruleId === 'no-debugger' && message.severity === 2),
  'The intentional debugger statement must trigger the configured blocking rule.');
const [good] = await eslint.lintText('export const sample = 1;\n', {filePath: 'src/gate-probe.ts'});
assert.equal(good.errorCount + good.warningCount, 0);
mkdirSync('test-results/security', {recursive: true});
writeFileSync('test-results/security/lint-gate.json', JSON.stringify({
  rule: 'no-debugger', badSampleRejected: true, goodSampleAccepted: true,
}, null, 2) + '\n');
console.log('Lint gate demonstration passed: deliberate violation rejected, clean sample accepted.');
