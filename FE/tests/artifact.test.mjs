import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createManifest, verifyManifest} from '../scripts/artifact.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kth-devops-artifact-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<html></html>');
  await writeFile(join(root, 'main.js'), 'const example = 1;');
  await writeFile(join(root, 'assets/config.json'), '{"brokerUrl":""}');
  await createManifest(root);
  return root;
}
test('runtime configuration can change without changing compiled build identity', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'assets/config.json'), '{"brokerUrl":"wss://broker.invalid/mqtt"}');
  await verifyManifest(root);
});
test('changed, added and missing compiled files fail artifact verification', async t => {
  for (const change of ['modify', 'add', 'remove']) {
    const root = await fixture(t);
    if (change === 'modify') await writeFile(join(root, 'main.js'), 'const example = 2;');
    if (change === 'add') await writeFile(join(root, 'injected.js'), 'const unexpected = true;');
    if (change === 'remove') await rm(join(root, 'main.js'));
    await assert.rejects(verifyManifest(root));
  }
});
