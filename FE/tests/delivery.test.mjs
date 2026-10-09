import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createManifest, verifyManifest} from '../scripts/artifact.mjs';
import {prepareDelivery} from '../scripts/prepare-delivery.mjs';

async function build(t) {
  const directory = await mkdtemp(join(tmpdir(), 'kth-delivery-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<script src="app.js"></script>');
  await writeFile(join(directory, 'app.js'), 'console.log("fixture");');
  await writeFile(join(directory, 'assets/config.json'), '{"brokerUrl":""}');
  await createManifest(directory);
  return directory;
}

test('delivery changes public settings while preserving the compiled artifact', async t => {
  const directory = await build(t);
  const before = await readFile(join(directory, 'build-manifest.json'), 'utf8');
  await prepareDelivery(directory, {brokerUrl: 'wss://broker.invalid/mqtt'});
  assert.equal(JSON.parse(await readFile(join(directory, 'assets/config.json'), 'utf8')).brokerUrl,
    'wss://broker.invalid/mqtt');
  assert.equal(await readFile(join(directory, 'build-manifest.json'), 'utf8'), before);
  await verifyManifest(directory);
});

test('delivery rejects empty, insecure and secret-bearing configuration without writing it', async t => {
  const directory = await build(t);
  for (const config of [
    {brokerUrl: ''}, {brokerUrl: 'ws://broker.invalid'},
    {brokerUrl: 'wss://broker.invalid', password: 'nonfunctional-example'},
  ]) await assert.rejects(prepareDelivery(directory, config));
  assert.equal(await readFile(join(directory, 'assets/config.json'), 'utf8'), '{"brokerUrl":""}');
});

test('delivery rejects modified compiled files before changing settings', async t => {
  const directory = await build(t);
  await writeFile(join(directory, 'app.js'), 'changed');
  await assert.rejects(prepareDelivery(directory, {brokerUrl: 'wss://broker.invalid'}));
  assert.equal(await readFile(join(directory, 'assets/config.json'), 'utf8'), '{"brokerUrl":""}');
});
