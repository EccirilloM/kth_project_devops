import {readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseRuntimeConfig} from '../src/app/core/mqtt/runtime-config.ts';
import {buildDirectory, verifyManifest} from './artifact.mjs';

// Environment settings may change; the previously tested JavaScript must not.
export async function prepareDelivery(directory, publicConfig) {
  const config = parseRuntimeConfig(publicConfig);
  if (!config.brokerUrl) throw new Error('Delivery requires an explicit WSS broker URL.');
  await verifyManifest(directory);
  await writeFile(join(directory, 'assets/config.json'), JSON.stringify(config, null, 2) + '\n');
  await verifyManifest(directory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [configFile, directory = buildDirectory] = process.argv.slice(2);
  if (!configFile) throw new Error('Usage: npm run prepare:delivery -- <public-config.json> [build-directory]');
  const source = configFile === '--env' ? process.env.KTH_PUBLIC_CONFIG : await readFile(configFile, 'utf8');
  let config;
  try { config = JSON.parse(source ?? ''); }
  catch { throw new Error('Missing or invalid public delivery configuration JSON.'); }
  await prepareDelivery(resolve(directory), config);
  console.log('Public runtime configuration prepared; compiled files match the tested manifest.');
}
