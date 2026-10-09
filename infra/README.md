# DigitalOcean deployment and state migration

The disposable Docker laboratory is in `infra/lab`; it needs no DigitalOcean access. This directory manages the existing persistent demo. CD is disabled unless `DO_DEPLOY_ENABLED=true`, and refuses to run unless `TF_STATE_MIGRATED=true`.

## Required settings

GitHub repository **secrets**:

| Name | Purpose |
| --- | --- |
| `DIGITALOCEAN_ACCESS_TOKEN` | Manage the existing app and registry; the older `DIGITALOCEAN_TOKEN` name is also accepted. |
| `GUEST_PASSWORD` | Broker guest credential. |
| `OPERATOR_PASSWORD` | Broker operator credential. |
| `SIMULATOR_PASSWORD` | Shared by the simulator and broker configuration. |
| `TF_STATE_ACCESS_KEY_ID`, `TF_STATE_SECRET_ACCESS_KEY` | Restricted access to the remote state object and its lock. |

Each broker password must contain 24–128 characters from `A–Z`, `a–z`, digits, `_` and `-`. Generate distinct random values using a password manager. The broker generates its password hashes at startup; no password database is stored in Git or baked into new images. The guest/Guest aliases share the guest password; operator/Staff/staff share the operator password.

GitHub repository **variables**:

| Name | Purpose |
| --- | --- |
| `DO_DEPLOY_ENABLED` | Set to `true` only after the migration and checks below. |
| `TF_STATE_MIGRATED` | Set to `true` only after checking the migrated state. |
| `TF_STATE_CONFIG_JSON` | Public coordinates of the state backend, as JSON. |
| `TF_REGISTRY_NAME`, `TF_IMAGE_REPOSITORY` | Exact existing registry and repository names; defaults are `mqtt-emulator-dev` and `mqtt`. Do not guess these values. |
| `TF_REGION` | Existing app region, default `ams`. |
| `TF_DOMAIN`, `TF_ZONE`, `TF_PROJECT_NAME` | Preserve the values used by the existing deployment; omit only if those optional resources are absent. |

Example backend coordinates (placeholders, not an existing bucket):

```json
{
  "bucket": "YOUR_PRIVATE_STATE_BUCKET",
  "key": "kth-devops/demo/terraform.tfstate",
  "region": "YOUR_STATE_STORAGE_REGION",
  "encrypt": true
}
```

The backend uses the S3 API with Terraform lockfiles. Use private, durable storage with version recovery, encryption and support for conditional lock creation. A compatible non-AWS endpoint can be supplied in `endpoints.s3` (HTTPS); provider-specific compatibility flags are accepted by the preflight script. Do not assume every S3-compatible service supports Terraform locking: confirm it before migration. The CI does not create the storage or choose an account.

Credentials are supplied through environment variables, never in this JSON. Terraform 1.13.3 is used for the workflow and maintenance container. Keep the provider lockfile produced during initialization in Git after verifying it.

## Migrate the existing state once

Coordinate this with the infrastructure owner; do not run a new apply against an empty state.

1. Freeze DigitalOcean deployments while migrating. Keep `DO_DEPLOY_ENABLED` unset/false in the corrected workflow, and prevent older workflow runs from applying changes.
2. Recover the **latest successful Terraform state** privately from the existing working copy or the old CI cache. Check its lineage, serial and app/registry IDs against DigitalOcean. Keep a secure backup; do not put it in Git, a chat or a public artifact.
3. Prepare the private remote backend and verify access, encryption, version recovery and lock support.
4. Put the verified state at `infra/terraform.tfstate` and backend coordinates at `.runtime/backend.json` (both ignored). Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in your local terminal, using the state-storage credentials.
5. From the repository root, migrate with the containerized CLI:

```sh
docker compose -f Docker/terraform.compose.yaml run --rm terraform init -migrate-state -backend-config=/workspace/.runtime/backend.json
docker compose -f Docker/terraform.compose.yaml run --rm terraform state list
```

Review the migration prompt rather than forcing it. The state must still contain `digitalocean_app.mqtt` and `digitalocean_container_registry.mqtt`, plus any existing DNS/project resources. Verify that the remote state has the same resource identities. Do not delete the only copy of a state file.

6. Rotate the old demo credentials and configure the new GitHub secrets above. The first corrected deployment updates both broker and simulator credentials together; existing demo users need the new passwords.
7. Remove the old Terraform-state caches once the remote copy and private backup are verified. Sensitive data in previous caches must be treated as potentially exposed; deleting a cache does not revoke credentials.
8. Set the public variables to match the actual resources, set `TF_STATE_MIGRATED=true`, then enable `DO_DEPLOY_ENABLED=true`. Integrate the reviewed code and examine the deployment plan. The workflow refuses automatic resource deletion/replacement.

The repository no longer restores or saves Terraform state through Actions cache and no longer automatically adopts whichever registry/app it finds. Backend migration, storage provisioning and credential rotation are operator actions, not actions already performed by these changes.

## Release behavior

CI verifies the frontend build, runtime image, broker, simulator and isolated integration environment. CD loads those same images, publishes unique release tags to DOCR and sets all three service image digests in one Terraform update. Stable tags are not overwritten and `deploy_on_push` is disabled; App Platform cannot begin a partial release while images are still being published.

The deployment waits for an active app deployment containing the expected digests and checks the public frontend configuration. The summary and release artifact contain image references, not credentials. Real login and remote telemetry should also be checked after the first migration.

State locks and serialized deployments protect against overlapping infrastructure writes. New pushes do not cancel in-progress CI/CD runs on `dev` or `main`. Manual cancellation can still interrupt work and should be avoided during an apply.

