# Sailing Monitor — DD2482 DevOps Project

Reproducible testing and secure delivery for a boat telemetry application, based on the [Polimi Sailing Team frontend](https://github.com/Sailing-Team-Polimi/sail_monitoring_web).

**Authors:** Ettore Mugisha Cirillo (`emcir@kth.se`) and Juozas Skarbalius (`juozas@kth.se`).

The Angular frontend connects directly to an MQTT broker over secure WebSockets. It provides a telemetry dashboard, a boat map and role-dependent recording controls. A containerized simulator supplies synthetic telemetry for testing without the physical boat.

This README covers setup and verification. Architecture, design choices and limitations are discussed in the separate [project report](https://github.com/EccirilloM/DevOps_Project_Report).

## Services and dependencies

| Service | Role |
| --- | --- |
| GitHub Actions and Pages | Run the pipeline and publish the validated static frontend on main. |
| DigitalOcean App Platform and Container Registry (DOCR) | Host the persistent demo and distribute the exact container images verified in CI. |
| Demo MQTT broker | Connect the browser and simulator for the shared demonstration. Use the deployed environment's `broker_wss_url` Terraform output; accounts and TLS are managed separately from frontend delivery. |
| OpenStreetMap tile service | Supply the map background; requires internet access. |
| Container registries and npm registry | Supply build images, dependencies and vulnerability advisory data for checks. |

An **external broker** means a service running separately from the frontend; it does not have to be a paid or managed cloud service. GitHub Pages serves static frontend files and cannot run the broker. The Terraform integration lab instead uses its own disposable Mosquitto container, without relying on the shared demo endpoint.

## Requirements

- Git and Docker with Linux containers and Docker Compose v2. Git Bash is needed for laboratory orchestration on Windows.
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
docker compose -f Docker/checks.compose.yaml run --rm infrastructure
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

### Runtime frontend

After frontend verification, test the actual Nginx image rather than only the lightweight smoke-test server:

```sh
docker compose -f Docker/runtime.compose.yaml build frontend
docker compose -f Docker/runtime.compose.yaml up -d --wait --wait-timeout 120 frontend
docker compose -f Docker/runtime.compose.yaml run --rm runtime-checks
docker compose -f Docker/runtime.compose.yaml down
```

These checks verify missing-file handling, login startup and the identity of the compiled files served by Nginx.

## CI/CD

[ci.yaml](.github/workflows/ci.yaml) runs on pushes to `main`, `dev`, `ettore` and `juozas`, pull requests targeting `main` or `dev`, and manual dispatch. It checks the frontend, simulator and security gates, followed by runtime-image checks and a required Terraform integration job.

[cd.yaml](.github/workflows/cd.yaml) is called by CI on eligible `dev`/`main` pushes. It reuses the checked frontend build and tested simulator image:

- On `main`, package the frontend delivery candidate.
- On `dev`, optionally publish the three checked images to DOCR and update the DigitalOcean demo together using their immutable digests.
- On `main`, optionally deploy to GitHub Pages **after real integration tests pass**, supplying public runtime settings without rebuilding Angular.

Integration must pass before CD runs. File hashes check frontend build reuse, excluding the replaceable runtime configuration. Images are transferred between jobs without rebuilding, and each release uses unique tags and immutable digests.

| Check | Blocking policy |
| --- | --- |
| ESLint | Errors and warnings block. |
| Tests, type checks, build and workflow validation | Failures block. |
| Gitleaks | Detected secrets block. |
| Dependency audit | High/critical findings, including development dependencies, and scan errors block. Low/moderate findings are reported. No audit exceptions are configured. |
| Integration | E2E and infrastructure/idempotence failures block delivery and deployment. |

Configure the following GitHub Actions repository variables:

| Variable | Purpose |
| --- | --- |
| `DO_DEPLOY_ENABLED=true` | Enable DigitalOcean deployment after state migration and credential setup. |
| `TF_STATE_MIGRATED=true` | Confirm the existing infrastructure state has been migrated and checked. |
| `PAGES_DEPLOY_ENABLED=true` | Enable Pages deployment after successful integration. |
| `PAGES_PUBLIC_CONFIG_JSON` | Public configuration in the JSON format above; no credentials. |

Absent deployment flags disable cloud deployment; the laboratory and the delivery-candidate job on `main` still run. Set the Pages source to **GitHub Actions** and require CI checks and peer review through an active branch ruleset or branch protection. DigitalOcean additionally requires the backend settings and secrets in [infra/README.md](infra/README.md).

## Infrastructure and real MQTT tests

The laboratory is independent of DigitalOcean: Terraform's Docker provider creates an isolated network, a real WSS Mosquitto broker, the simulator and the checked frontend image. Temporary credentials and a local certificate authority are generated per environment. Browser certificate verification remains enabled.

After `npm run verify` through the checking container, run:

**Windows CMD (Git for Windows installed in its default location):**

```bat
"%ProgramFiles%\Git\bin\bash.exe" ci/lab/check.sh
```

**Windows PowerShell:**

```powershell
./ci/lab/check.ps1
```

**macOS or Git Bash:**

```sh
bash ci/lab/check.sh
```

The script builds container tools and runtime images, provisions the lab, verifies no-change plans around a second apply, runs the real MQTT suite, collects redacted diagnostics and tears down the resources even after failures. No cloud credentials or host Terraform installation are required. Private state, plans and certificates remain under the ignored `.runtime/<environment-id>/` directory; do not share that directory.

Idempotence requires every planned resource/output action to be `no-op`. The checker separately records the Docker provider's refresh of specific unset optional collections into empty lists/maps; other detected drift still fails the check.

The [E2E suite](FE/e2e/integration/broker.spec.ts) checks live telemetry and recording, malformed messages, stale data, broker recovery and broker-enforced guest command denial. Public diagnostics are in `FE/test-results/lab-diagnostics/` and `FE/test-results/integration/`. These disruptive tests never target the shared demo broker.

On a teardown failure, retain the printed environment ID and run `bash ci/lab/run.sh down` with `KTH_ENVIRONMENT_ID` set to that same value. Do not delete its private state before cleanup succeeds.

## AI assistance

AI tools were consulted for code review, troubleshooting specific errors and discussing conceptual and technical choices. They also assisted with simplifying the original frontend for this project and with selected workflow and test changes. The authors are responsible for reviewing the changes and validating them through the project checks.
