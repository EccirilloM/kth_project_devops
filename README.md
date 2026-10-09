# Sailing Monitor — DD2482 DevOps Project

Reproducible testing and secure delivery for a boat telemetry application, based on the [Polimi Sailing Team frontend](https://github.com/Sailing-Team-Polimi/sail_monitoring_web).

**Authors:** Ettore Mugisha Cirillo (`emcir@kth.se`) and Juozas Skarbalius (`juozas@kth.se`).

The Angular frontend connects directly to an MQTT broker over secure WebSockets. It provides a telemetry dashboard, a boat map and role-dependent recording controls. A containerized simulator supplies synthetic telemetry for testing without the physical boat.

This README covers setup and verification. Architecture, design choices and limitations are discussed in the separate [project report](https://github.com/EccirilloM/DevOps_Project_Report).

## Services and dependencies

| Service | Role |
| --- | --- |
| GitHub Actions, Pages and Container Registry (GHCR) | Run the pipeline, host the delivered frontend and distribute the simulator image when enabled. |
| Demo MQTT endpoint: `wss://mqtt.devopsproject.lios.cloud/mqtt` | Connect the browser and simulator for the shared demonstration. Hosting, accounts and TLS are managed separately from frontend delivery. |
| OpenStreetMap tile service | Supply the map background; requires internet access. |
| Container registries and npm registry | Supply build images, dependencies and vulnerability advisory data for checks. |

An **external broker** means a service running separately from the frontend; it does not have to be a paid or managed cloud service. GitHub Pages serves static frontend files and cannot run the broker. The Terraform integration lab instead uses its own disposable Mosquitto container, without relying on the shared demo endpoint.

## Requirements

- Git and Docker with Linux containers and Docker Compose v2.
- Internet access for images and dependencies; port `4200` available.

No host Node.js or Python installation is needed. Run the commands below from the **repository root** on Windows or macOS.

## Run locally

```sh
docker compose -f Docker/compose.yaml up --build --wait --wait-timeout 600
docker compose -f Docker/compose.yaml exec web npm start
```

Wait for Angular to finish compiling, then open [localhost:4200](http://localhost:4200). Without a broker address, the app displays **Broker not configured** and disables sign-in.

To stop, press `Ctrl+C`, then run:

```sh
docker compose -f Docker/compose.yaml down
```

### Connect to a broker

Create `.runtime/demo-config.json` by copying [Docker/demo.config.example.json](Docker/demo.config.example.json), preserving any existing local configuration. Set the broker address and username-to-role mapping:

```json
{
  "brokerUrl": "wss://broker.example/mqtt",
  "users": { "guest": "GUEST", "operator": "ADMIN" }
}
```

Replace the example address and usernames with those supplied for your environment. The broker must support MQTT 5 over WSS with a browser-trusted certificate. Enter passwords only at sign-in: configuration is public, and the role mapping does not replace broker topic ACLs.

Use the demo override to mount the local settings:

```sh
docker compose -f Docker/compose.yaml -f Docker/demo.compose.yaml up --build --wait --wait-timeout 600
docker compose -f Docker/compose.yaml -f Docker/demo.compose.yaml exec web npm start
```

After `Ctrl+C`, stop with:

```sh
docker compose -f Docker/compose.yaml -f Docker/demo.compose.yaml down
```

This starts the frontend against an existing broker. The `.runtime` directory is ignored by Git; credentials, private keys and Terraform state must also remain outside version control.

## Build and test

These checks run without a broker. Rebuild checking images after source or dependency changes.

**Frontend and workflow validation:**

```sh
docker compose -f Docker/checks.compose.yaml run --rm workflows
docker compose -f Docker/checks.compose.yaml build checks
docker compose -f Docker/checks.compose.yaml run --rm checks npm run verify
```

This validates workflow syntax and runs lint, unit tests, type checks, the production build, Playwright smoke tests and dependency auditing. A controlled lint example verifies that the gate detects errors.

**Secret scanning:**

```sh
docker compose -f Docker/checks.compose.yaml build secrets
docker compose -f Docker/checks.compose.yaml run --rm secrets /opt/kth-devops/verify-secrets.sh
```

Gitleaks verifies detection with a nonfunctional test token, then scans reachable Git history and the non-ignored working tree.

**Simulator checks:**

```sh
docker compose -f Docker/checks.compose.yaml build simulator-checks simulator-image-test
docker compose -f Docker/checks.compose.yaml run --rm simulator-checks
docker compose -f Docker/checks.compose.yaml run --rm simulator-image-test
```

These cover type checks, model/contract tests, dependency auditing and tests in the built runtime image. Browser smoke and simulator model tests do not exercise real MQTT communication.

Successful checks exit with code `0`. Results are saved in `FE/test-results/`, `FE/playwright-report/` and `simulator/test-results/`. The frontend build is in `FE/dist/sail-monitoring-web/browser/`. CI retains diagnostic artifacts before cleanup.

## CI/CD

[ci.yaml](.github/workflows/ci.yaml) runs on pushes to `main`, `dev`, `ettore` and `juozas`, pull requests targeting `main` or `dev`, and manual dispatch. It checks the frontend, simulator and security gates, with an optional Terraform integration job.

[cd.yaml](.github/workflows/cd.yaml) is called by CI on eligible `dev`/`main` pushes. It reuses the checked frontend build and tested simulator image:

- On `main`, package the frontend delivery candidate.
- On `dev` or `main`, optionally publish the simulator to GHCR with a commit tag and immutable digest. Updating the remote server is separate.
- On `main`, optionally deploy to GitHub Pages **after real integration tests pass**, supplying public runtime settings without rebuilding Angular.

Candidates may be delivered with integration disabled; a failed integration job blocks CD. File hashes check frontend build reuse, excluding the replaceable runtime configuration.

| Check | Blocking policy |
| --- | --- |
| ESLint | Errors and warnings block. |
| Tests, type checks, build and workflow validation | Failures block. |
| Gitleaks | Detected secrets block. |
| Dependency audit | High/critical findings, including development dependencies, and scan errors block. Low/moderate findings are reported. No audit exceptions are configured. |
| Integration | When enabled, E2E and infrastructure/idempotence failures block. Required for Pages. |

Configure the following GitHub Actions repository variables:

| Variable | Purpose |
| --- | --- |
| `LAB_INTEGRATION_ENABLED=true` | Enable the Terraform lab after connecting its adapter. |
| `GHCR_PUBLISH_ENABLED=true` | Enable simulator image publication. |
| `PAGES_DEPLOY_ENABLED=true` | Enable Pages deployment after successful integration. |
| `PAGES_PUBLIC_CONFIG_JSON` | Public configuration in the JSON format above; no credentials. |

Absent enable flags leave those jobs disabled. Set the Pages deployment source to **GitHub Actions**, configure GHCR package read access for the deployment host, and require CI checks and peer review through GitHub branch protection.

## Infrastructure and real MQTT tests

**Infrastructure setup instructions will be added with Juozas's Terraform integration.** The adapter in [ci/lab/adapter.sh](ci/lab/adapter.sh) must be connected before enabling the integration job.

The lab contract uses an isolated Docker network with Mosquitto, the simulator and a server for the checked frontend build. [ci/lab/run.sh](ci/lab/run.sh) coordinates provisioning, a second apply with no changes, tests, diagnostics and cleanup; [manifest.example.json](ci/lab/manifest.example.json) defines the environment interface.

The prepared [E2E suite](FE/e2e/integration/broker.spec.ts) covers live telemetry and recording, malformed messages, stale data, broker restart/recovery and broker-enforced denial of guest commands. These disruptive tests require a disposable environment, separate from the shared demonstration broker.

## AI assistance

AI tools were consulted for code review, troubleshooting specific errors and discussing conceptual and technical choices. They also assisted with simplifying the original frontend for this project and with selected workflow and test changes. The authors are responsible for reviewing the changes and validating them through the project checks.
