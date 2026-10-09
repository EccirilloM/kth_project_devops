import {request} from 'node:http';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
const lab = JSON.parse(readFileSync('/lab/manifest.json', 'utf8'));
const variables = JSON.parse(readFileSync('/lab/private.tfvars.json', 'utf8'));
const passwords = Object.entries(variables).filter(([key]) => key.endsWith('_password')).map(([, value]) => value);
function docker(path) {
  return new Promise((resolve, reject) => {
    const req = request({socketPath: '/var/run/docker.sock', path}, response => {
      const parts = [];
      response.on('data', chunk => parts.push(chunk));
      response.on('end', () => response.statusCode === 200
        ? resolve(Buffer.concat(parts)) : reject(new Error('Docker diagnostic request failed.')));
    });
    req.setTimeout(10000, () => req.destroy(new Error('Diagnostic timeout.')));
    req.on('error', reject); req.end();
  });
}
mkdirSync('/reports', {recursive: true});
for (const component of ['frontend', 'broker', 'simulator']) {
  const name = lab.environmentId + '-' + component;
  try {
    const info = JSON.parse((await docker('/containers/' + name + '/json')).toString());
    if (info.Config?.Labels?.['kth.devops.environment'] !== lab.environmentId) throw new Error('Wrong environment.');
    const buffer = await docker('/containers/' + name + '/logs?stdout=true&stderr=true&tail=200');
    // Docker non-TTY logs have an eight-byte header per frame.
    const parts = [];
    for (let offset = 0; offset + 8 <= buffer.length;) {
      const length = buffer.readUInt32BE(offset + 4);
      if (offset + 8 + length > buffer.length) break;
      parts.push(buffer.subarray(offset + 8, offset + 8 + length));
      offset += 8 + length;
    }
    let output = Buffer.concat(parts).toString('utf8');
    for (const password of passwords) output = output.split(password).join('[REDACTED]');
    writeFileSync('/reports/' + component + '.log', output);
    // Never save raw inspect output: it includes environment secrets.
    writeFileSync('/reports/' + component + '.json', JSON.stringify({
      name, status: info.State?.Status, health: info.State?.Health?.Status, exitCode: info.State?.ExitCode,
    }, null, 2));
  } catch {
    writeFileSync('/reports/' + component + '.log', 'Component diagnostics unavailable.\n');
  }
}
