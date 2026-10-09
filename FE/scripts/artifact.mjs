import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve, join, relative, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export const buildDirectory = 'dist/sail-monitoring-web/browser';
const manifestName = 'build-manifest.json';
async function inventory(root, directory = root) {
  const files = {};
  for (const item of (await readdir(directory, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(directory, item.name);
    const name = relative(root, full).split(sep).join('/');
    if (item.isSymbolicLink()) throw new Error('Build artifacts must not contain symbolic links.');
    if (item.isDirectory()) Object.assign(files, await inventory(root, full));
    else if (item.isFile() && name !== manifestName && name !== 'assets/config.json') {
      files[name] = createHash('sha256').update(await readFile(full)).digest('hex');
    }
  }
  return files;
}
export async function createManifest(directory) {
  const root = resolve(directory);
  const files = await inventory(root);
  if (!files['index.html'] || !Object.keys(files).some(name => name.endsWith('.js'))) {
    throw new Error('Expected a compiled frontend with index.html and JavaScript.');
  }
  const manifest = {schemaVersion: 1, algorithm: 'sha256', excluded: ['assets/config.json'], files};
  await writeFile(join(root, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export async function verifyManifest(directory) {
  const root = resolve(directory);
  const expected = JSON.parse(await readFile(join(root, manifestName), 'utf8'));
  if (expected.schemaVersion !== 1 || expected.algorithm !== 'sha256' ||
      JSON.stringify(expected.excluded) !== '["assets/config.json"]' || !expected.files) {
    throw new Error('Invalid build manifest.');
  }
  const actual = await inventory(root);
  const names = [...new Set([...Object.keys(expected.files), ...Object.keys(actual)])];
  if (!actual['index.html'] || !Object.keys(actual).some(name => name.endsWith('.js')) ||
      names.some(name => expected.files[name] !== actual[name])) {
    throw new Error('Compiled files changed after the build manifest was created.');
  }
  return expected;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, directory = buildDirectory] = process.argv.slice(2);
  if (mode === 'create') await createManifest(directory);
  else if (mode === 'verify') await verifyManifest(directory);
  else throw new Error('Usage: node scripts/artifact.mjs create|verify [build-directory]');
  console.log('Build manifest ' + mode + ' completed.');
}
