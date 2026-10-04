import {spawnSync} from 'node:child_process';
import {mkdirSync, readdirSync} from 'node:fs';

mkdirSync('test-results', {recursive: true});
const files = readdirSync('tests').filter(name => /\.test\.(ts|mjs)$/.test(name))
  .sort().map(name => 'tests/' + name);
const result = spawnSync(process.execPath, [
  '--experimental-transform-types', '--import', './tests/register.mjs',
  '--test', '--test-reporter=spec', '--test-reporter=junit',
  '--test-reporter-destination=stdout', '--test-reporter-destination=test-results/unit.xml',
  ...files,
], {stdio: 'inherit'});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
