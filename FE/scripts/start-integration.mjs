import {mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
const database = join(homedir(), '.pki/nssdb');
mkdirSync(database, {recursive: true});
execFileSync('certutil', ['-N', '--empty-password', '-d', 'sql:' + database], {stdio: 'inherit'});
execFileSync('certutil', ['-A', '-d', 'sql:' + database, '-n', 'kth-devops-lab', '-t', 'C,,', '-i', '/lab/ca.crt'], {stdio: 'inherit'});
let lab;
try { lab = JSON.parse(readFileSync(process.env.KTH_LAB_MANIFEST, 'utf8')); }
catch { throw new Error('Cannot read the private laboratory manifest.'); }
const passwords = [lab.operator.password, lab.guest.password, lab.probe.password];
const redact = text => passwords.reduce((result, password) => result.split(password).join('[REDACTED]'), text);
// Buffer output so even Playwright action logs from a failed password fill are redacted.
const result = spawnSync('npm', ['run', 'test:integration'], {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 720000,
});
function redactReports(directory) {
  if (!existsSync(directory)) return;
  for (const item of readdirSync(directory, {withFileTypes: true})) {
    const path = join(directory, item.name);
    if (item.isDirectory()) redactReports(path);
    else if (/\.(xml|json|txt|md)$/.test(item.name)) writeFileSync(path, redact(readFileSync(path, 'utf8')));
  }
}
redactReports('test-results/integration');
process.stdout.write(redact(result.stdout ?? ''));
process.stderr.write(redact(result.stderr ?? ''));
if (result.error) console.error('Integration test process did not complete normally.');
process.exitCode = result.status ?? 1;
