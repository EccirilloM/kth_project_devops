# DigitalOcean deployment

The disposable test environment is managed by `infra/lab`. This directory manages a separate persistent App Platform demo: frontend, Mosquitto and simulator, with verified images stored in DigitalOcean Container Registry (DOCR). GitHub Pages remains the frontend deployment from `main`.

## Account and state setup

Use an account/team you control and a dedicated registry name beginning with `kth-devops-`. The workflow uses only the `KTH_` settings below; it does not fall back to another contributor's account, domain or credentials. The app uses DigitalOcean's generated HTTPS domain and TLS termination for `/mqtt`, so a custom domain is unnecessary.

Create a private Spaces Standard bucket separately, disable CDN and keep file listing restricted. Use a bucket-scoped Read/Write/Delete key for Terraform: deletion permission is needed to release its lockfile. Keep this bucket after application teardown until you have finished managing the resources. Enable object versioning through the Spaces S3 API and retain a private recovery copy before relying on the backend for ongoing deployment. Never upload state or plans as public CI artifacts.

GitHub repository **secrets**:

| Name | Purpose |
| --- | --- |
| `KTH_DIGITALOCEAN_ACCESS_TOKEN` | App Platform and registry access in the intended account. |
| `KTH_TF_STATE_ACCESS_KEY_ID` | Spaces access key ID. |
| `KTH_TF_STATE_SECRET_ACCESS_KEY` | Spaces secret key. |
| `KTH_GUEST_PASSWORD` | Read-only broker user. |
| `KTH_OPERATOR_PASSWORD` | Broker user allowed to send commands. |
| `KTH_SIMULATOR_PASSWORD` | Shared by the broker configuration and simulator. |

Use three different random broker passwords, each 24–128 characters from letters, digits, `_` and `-`. Guest/Guest aliases share the guest password; operator/Staff/staff share the operator password. Password hashes are generated at container startup, never baked into the image.

GitHub repository **variables**:

| Name | Purpose |
| --- | --- |
| `KTH_DO_DEPLOY_ENABLED` | Leave unset/false until setup is verified. Set `true` to allow cloud CD on `dev`. |
| `KTH_TF_REGISTRY_NAME` | Globally unique registry name, for example `kth-devops-YOUR-ID`. |
| `KTH_TF_REGION` | App region; defaults to `ams`. |
| `KTH_TF_STATE_CONFIG_JSON` | Public backend coordinates. Credentials must not appear here. |

Example Spaces backend configuration (replace the bucket and endpoint):

```json
{
  "bucket": "YOUR_PRIVATE_BUCKET",
  "key": "kth-devops/demo/terraform.tfstate",
  "region": "us-east-1",
  "endpoints": {"s3": "https://ams3.digitaloceanspaces.com"},
  "skip_credentials_validation": true,
  "skip_requesting_account_id": true,
  "skip_metadata_api_check": true,
  "skip_region_validation": true,
  "skip_s3_checksum": true
}
```

Here `region` is an S3 compatibility setting; the endpoint selects the actual Amsterdam storage location. Terraform 1.13.3 uses `use_lockfile=true` from `backend.tf`. The compatibility flags do not disable TLS certificate verification. See the [official Spaces backend documentation](https://docs.digitalocean.com/products/spaces/reference/terraform-backend/).

## First deployment to a new account

1. Verify the account, bucket privacy and recovery setup. Do not use bootstrap to replace lost state from an existing deployment.
2. Configure the secrets and variables above. Review costs before enabling CD: three `apps-s-1vcpu-0.5gb` components, a Starter registry and Spaces storage. Check current quotas and prices in the provider console.
3. Publish the reviewed workflows to `main` (to expose manual dispatch) and `dev`. In **Actions → CI → Run workflow**, choose **dev** and enable **bootstrap-cloud**. All CI checks run before cloud provisioning; no older artifact is substituted.
4. If the app address is absent, the workflow permits only empty state or registry-only state. It refuses an existing app with the requested name or an untracked registry. Terraform creates the registry using only `registry.tf` and `backend.tf` in a temporary working directory, sharing the same backend key and resource address as the full configuration.
5. CD uploads the three images verified by this CI run, resolves their digests, then creates the app using those digests. No dummy image references or mutable release tags are deployed. A partial first run can resume with the explicit bootstrap option; if an app exists without its state, recover the state first.
6. Inspect the release summary, then test guest/operator login, visible telemetry and recording controls at the reported UI URL. Deployment success checks the active image digests and exact public broker configuration; it does not replace this remote MQTT verification.

Subsequent pushes to `dev` update the app after CI passes. They require the registry and app in state, reject deletion/replacement, and do not recreate missing cloud resources. Deployments are serialized and Terraform uses backend locks. Do not manually cancel an apply. State and plan files remain private on the runner; only image references are uploaded.

The bootstrap root is derived from the same `registry.tf`, not a second copy of the registry definition. `ci/verify-infra.sh` validates both roots and the Docker laboratory. CI also tests the plan gate with synthetic update, creation, deletion and replacement plans. Keep reviewed provider lockfiles in Git after initialization.

## Existing deployments and recovery

Never point a fresh token at another account's state or run bootstrap to bypass a missing-state error. Freeze all writers, recover the latest state privately, and verify its resource IDs and lineage against the intended account. Back it up before migrating with `terraform init -migrate-state` using the containerized CLI in `Docker/terraform.compose.yaml`. Check `terraform state list` and a reviewed plan before resuming. The current automated cloud job intentionally uses the new account's `KTH_` settings only; adopting an older deployment requires deliberate configuration and state review.

## GitHub Pages

After verifying the public broker, configure `PAGES_PUBLIC_CONFIG_JSON` with its WSS endpoint and the application's public usernames. Enable `PAGES_DEPLOY_ENABLED` and release through `main`. Pages reuses the validated frontend build and supplies public configuration separately at runtime. Broker passwords never belong in this configuration.
