import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

// Docker provider 3.6.2 refreshes these unset optional collections as empty values.
// This exception applies only to observed state drift, never to planned actions.
const emptyDockerFields = {
  docker_container: {dns: [], dns_opts: [], dns_search: [], group_add: [],
    log_opts: {}, storage_opts: {}, sysctls: {}, tmpfs: {}},
  docker_network: {ipam_options: {}},
};
function isEmptyCollectionRefresh(item) {
  if (item.provider_name !== 'registry.terraform.io/kreuzwerker/docker' || item.mode !== 'managed' ||
      !Object.hasOwn(emptyDockerFields, item.type) ||
      !isDeepStrictEqual(item.change?.actions, ['update'])) return false;
  const {before, after} = item.change;
  if (!before || !after || Array.isArray(before) || Array.isArray(after)) return false;
  const normalized = {...before};
  let count = 0;
  for (const [key, empty] of Object.entries(emptyDockerFields[item.type])) {
    if (before[key] === null && isDeepStrictEqual(after[key], empty)) {
      normalized[key] = empty;
      count++;
    }
  }
  return count > 0 && isDeepStrictEqual(normalized, after);
}

export function assertNoChanges(plan) {
  if (!plan || !/^1\./.test(plan.format_version ?? '') || !plan.planned_values ||
      plan.errored === true || plan.complete === false || (plan.deferred_changes?.length ?? 0) > 0) {
    throw new Error('Expected a complete Terraform JSON plan.');
  }
  for (const item of plan.resource_changes ?? []) {
    if (!isDeepStrictEqual(item.change?.actions, ['no-op'])) throw new Error('Terraform resource changes remain.');
  }
  let normalizedDriftResources = 0;
  for (const item of plan.resource_drift ?? []) {
    if (isDeepStrictEqual(item.change?.actions, ['no-op'])) continue;
    if (!isEmptyCollectionRefresh(item)) throw new Error('Terraform resource drift remains.');
    normalizedDriftResources++;
  }
  for (const change of Object.values(plan.output_changes ?? {})) {
    if (JSON.stringify(change.actions) !== '["no-op"]') throw new Error('Terraform output changes remain.');
  }
  return {schemaVersion: 1, resourceChanges: 0, outputChanges: 0, driftChanges: 0, normalizedDriftResources};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: terraform-plan.mjs <private-plan.json> <public-summary.json>');
  let plan;
  try { plan = JSON.parse(await readFile(input, 'utf8')); }
  catch { throw new Error('Terraform plan cannot be read as JSON.'); }
  const summary = assertNoChanges(plan);
  await writeFile(output, JSON.stringify(summary, null, 2) + '\n');
  console.log('Terraform plan has no changes.');
  if (summary.normalizedDriftResources) {
    console.log('Docker empty-collection refreshes recorded: ' + summary.normalizedDriftResources);
  }
}
