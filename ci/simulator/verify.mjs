import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';

mkdirSync('test-results', {recursive: true});
const results = [];
function run(name, command, args) {
  console.log('\n=== ' + name + ' ===');
  const result = spawnSync(command, args, {stdio: 'inherit', timeout: 180000});
  const status = result.status === 0 && !result.error && !result.signal ? 'passed' : 'failed';
  results.push({check: name, status});
  return status === 'passed';
}
const built = run('TypeScript and build', 'npm', ['run', 'build']);
if (built) {
  run('Simulator behavior', 'node', [
    '--experimental-transform-types', '--import', '/app/FE/tests/register.mjs',
    '--test', '--test-reporter=spec', '--test-reporter=junit',
    '--test-reporter-destination=stdout', '--test-reporter-destination=test-results/unit.xml',
    'test/model.test.mjs', 'test/frontend-contract.test.mjs',
  ]);
} else {
  results.push({check: 'Simulator behavior', status: 'skipped: build failed'});
}
run('Dependency audit', 'node', ['/opt/kth-devops/audit.mjs']);
writeFileSync('test-results/verification.json', JSON.stringify({results}, null, 2) + '\n');
console.table(results);
process.exitCode = results.every(result => result.status === 'passed') ? 0 : 1;
