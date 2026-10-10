# DigitalOcean deployment

This guide explains how to deploy your own copy of the demo. Terraform manages the frontend, Mosquitto broker and simulator on DigitalOcean App Platform, using images from DigitalOcean Container Registry (DOCR). GitHub Pages provides a second frontend. To run the project locally instead, follow the [main README](../README.md).

## Account and state setup

Use a DigitalOcean account you control and choose a unique registry name starting with `kth-devops-`. App Platform supplies the HTTPS domain and TLS termination, so you do not need a custom domain. The deployment creates three paid app components and uses a registry and Spaces storage.

First, create a private Spaces Standard bucket for Terraform state, with CDN disabled and file listing restricted. Give Terraform a bucket-scoped Read/Write/Delete key; delete permission lets it release state locks. Keep the bucket while managing the deployment, and keep state and plan files out of Git and public artifacts.

GitHub repository **secrets**:

| Name | Purpose |
| --- | --- |
| `KTH_DIGITALOCEAN_ACCESS_TOKEN` | App Platform and registry access in the intended account. |
| `KTH_TF_STATE_ACCESS_KEY_ID` | Spaces access key ID. |
| `KTH_TF_STATE_SECRET_ACCESS_KEY` | Spaces secret key. |
| `KTH_GUEST_PASSWORD` | Read-only broker user. |
| `KTH_OPERATOR_PASSWORD` | Broker user allowed to send commands. |
| `KTH_SIMULATOR_PASSWORD` | Shared by the broker configuration and simulator. |

Use three different random broker passwords, each 24–128 characters long using letters, digits, `_` and `-`. The broker generates password hashes at startup rather than storing credentials in its image.

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

The endpoint selects the storage location; `us-east-1` is an S3 compatibility setting. State locking is enabled in `backend.tf`, and TLS verification remains enabled. See the [Spaces backend documentation](https://docs.digitalocean.com/products/spaces/reference/terraform-backend/) for details.

### Enable state versioning once

Enable versioning so previous state versions can be recovered. This one-time step needs a temporary **Full Access** Spaces key, which covers all buckets in the account. Keep it separate from the limited Terraform key and do not save it in GitHub.

From the repository root, replace `YOUR_BUCKET` with the dedicated bucket name and `ams3` if necessary. Windows CMD:

```cmd
docker run --rm -it --mount "type=bind,source=%cd%,target=/workspace,readonly" --entrypoint /bin/bash public.ecr.aws/aws-cli/aws-cli:latest /workspace/ci/deploy/enable-state-versioning.sh YOUR_BUCKET ams3
```

macOS/Linux:

```sh
docker run --rm -it --mount "type=bind,source=$PWD,target=/workspace,readonly" --entrypoint /bin/bash public.ecr.aws/aws-cli/aws-cli:latest /workspace/ci/deploy/enable-state-versioning.sh YOUR_BUCKET ams3
```

Enter the temporary key ID and secret at the hidden prompts. When the script confirms `Object versioning: Enabled`, revoke that temporary key. Keep the bucket-scoped Terraform key for deployments. See the [Spaces versioning guide](https://docs.digitalocean.com/products/spaces/how-to/enable-versioning/) for background.

## First deployment to a new account

1. Configure the secrets and variables above, verify the private versioned bucket, and set `KTH_DO_DEPLOY_ENABLED=true`.
2. Make the workflows available on both `main` and `dev`. In **Actions → CI → Run workflow**, select **dev**, enable **bootstrap-cloud**, and leave **recover-app-id** empty. Bootstrap is for a new deployment, not for replacing lost state.
3. Wait for CI and deployment to finish. Terraform creates the registry and app, and CD publishes the three images tested by that run. If creation stops partway through, check the resources and state before retrying; use the recovery instructions below if the app exists but is missing from state.
4. Open the URL in the release summary and verify guest telemetry and operator recording controls. Automated release checks verify image references and public configuration, but do not replace this live MQTT check.

After setup, pushes to `dev` update the app once CI passes; leave bootstrap and recovery inputs at their defaults. Each release uses unique image tags, with digests checked before and after deployment. Automatic deployment on image push is disabled. The workflow never reuses tags, although another registry writer could change them.

Routine deployments require the existing app and registry in Terraform state and reject deletion or replacement. They run one at a time with state locking. Avoid cancelling a Terraform apply midway through.

## Existing deployments and recovery

An interrupted first deployment can leave an app on DigitalOcean without its entry in Terraform state. Check the app in the correct account and copy its exact UUID. If the registry is already tracked, run **CI** manually on **dev**, leave **bootstrap-cloud** off and enter the UUID in **recover-app-id**.

Recovery checks the app's identity and configuration, backs up the current state privately, and imports the app under a state lock before continuing deployment. Verify the resulting application afterward. Do not delete the app or use an empty state to bypass recovery errors.

For other state problems or migrations, stop deployments, back up the latest state and verify that its resource IDs belong to the intended account. Recover that state before applying again; bootstrap is not a general recovery mechanism.

## GitHub Pages

Select **Settings → Pages → Source: GitHub Actions**. Set `PAGES_PUBLIC_CONFIG_JSON` to the broker's WSS endpoint and public usernames, using the format in the main README, then set `PAGES_DEPLOY_ENABLED=true`. A successful push workflow on `main` publishes the tested frontend with these runtime settings. Do not include passwords in the JSON. With deployment flags unset, CI and frontend delivery packaging still run.

## Repository rules

The proposal calls for PR review and required CI checks. To enforce this, activate a ruleset on `dev` and `main` requiring a pull request, one peer approval and all five CI checks. A disabled ruleset does not enforce these requirements.

## Local test environment

The integration script described in the main README creates a temporary Docker environment. Its second-apply check covers those resources, not DigitalOcean. Only documented null-to-empty normalization in selected Docker-provider fields is tolerated; planned changes and other drift fail.

Logs are saved in `FE/test-results/lab-diagnostics/` and `FE/test-results/integration/`. State, plans and certificates stay in the ignored `.runtime/<environment-id>/` directory and should remain private. If cleanup fails, keep that directory, set `KTH_ENVIRONMENT_ID` to its environment ID and run `bash ci/lab/run.sh down` from Git Bash, Linux or macOS.

In GitHub Actions, diagnostics are retained for 7 days, runtime image archives for 3 days, and the frontend delivery candidate for 14 days. Download any evidence you need to keep beyond these periods.
