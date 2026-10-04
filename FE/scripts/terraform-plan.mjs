import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function assertNoChanges(plan) {
  if (!plan || !/^1\./.test(plan.format_version ?? '') || !plan.planned_values ||
      plan.errored === true || plan.complete === false || (plan.deferred_changes?.length ?? 0) > 0) {
    throw new Error('Expected a complete Terraform JSON plan.');
  }
  const changes = [...(plan.resource_changes ?? []), ...(plan.resource_drift ?? [])];
  for (const item of changes) {
    if (JSON.stringify(item.change?.actions) !== '["no-op"]') throw new Error('Terraform resource changes or drift remain.');
  }
  for (const change of Object.values(plan.output_changes ?? {})) {
    if (JSON.stringify(change.actions) !== '["no-op"]') throw new Error('Terraform output changes remain.');
  }
  return {schemaVersion: 1, resourceChanges: 0, outputChanges: 0, driftChanges: 0};
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
}
