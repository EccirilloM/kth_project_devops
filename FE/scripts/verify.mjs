import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
const results = [];
function run(script) {
  console.log('\n=== ' + script + ' ===');
  const result = spawnSync('npm', ['run', script], {stdio: 'inherit', timeout: 1200000});
  const status = result.status === 0 ? 'passed' : 'failed';
  results.push({check: script, status});
  return status === 'passed';
}
const built = run('check');
run('test:gates');
if (built) run('test:smoke');
else results.push({check: 'test:smoke', status: 'skipped: build/check failed'});
run('audit');
mkdirSync('test-results', {recursive: true});
writeFileSync('test-results/verification.json', JSON.stringify({results}, null, 2) + '\n');
console.table(results);
process.exitCode = results.every(result => result.status === 'passed') ? 0 : 1;
