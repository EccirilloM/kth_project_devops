# Sailing Monitor — DD2482 DevOps Project

Reproducible testing and secure delivery for an Angular MQTT application, based on the [Polimi Sailing Team frontend](https://github.com/Sailing-Team-Polimi/sail_monitoring_web).

**Authors:** Ettore Mugisha Cirillo (`emcir@kth.se`) and Juozas Skarbalius (`juozas@kth.se`).

The browser connects directly to an MQTT broker over secure WebSockets (WSS), displaying boat telemetry and a map with role-dependent recording controls. A synthetic boat simulator and a real Mosquitto broker make testing possible without the physical boat.

This README explains setup and verification. Architecture, design choices and limitations belong in the separate [project report](https://github.com/EccirilloM/DevOps_Project_Report). Application code is in `FE/`, the simulator in `simulator/`, infrastructure in `infra/`, and container tooling and automation in `Docker/` and `ci/`.

## Requirements

Git, Docker with Linux containers and Compose v2, and internet access. Windows laboratory commands also require Git for Windows. No host Node.js, Python or Terraform installation is needed. Run all commands from the **repository root**.

## Local frontend

With port 4200 available, start the development environment:

```sh
docker compose -f Docker/compose.yaml up --build --wait --wait-timeout 600
docker compose -f Docker/compose.yaml exec web npm start
```

Open [localhost:4200](http://localhost:4200) after compilation. Without broker settings, the login displays **Broker not configured**. Stop Angular with `Ctrl+C`, then stop the environment:

```sh
docker compose -f Docker/compose.yaml down
```

To use an existing broker, create `.runtime/` and copy [demo.config.example.json](Docker/demo.config.example.json) to `.runtime/demo-config.json`, preserving any existing configuration. Replace the example with your environment's public settings:

```json
{
  "brokerUrl": "wss://broker.example/mqtt",
  "users": { "guest": "GUEST", "operator": "ADMIN" }
}
```

The broker must support MQTT 5 over WSS with a browser-trusted certificate. For the DigitalOcean demo, use the deployment's `broker_wss_url` Terraform output. Enter passwords only at sign-in; the public role mapping does not replace broker topic permissions.

Start with the configuration override:

```sh
docker compose -f Docker/compose.yaml -f Docker/demo.compose.yaml up --build --wait --wait-timeout 600
docker compose -f Docker/compose.yaml -f Docker/demo.compose.yaml exec web npm start
```

After `Ctrl+C`, stop this configuration with:

```sh
docker compose -f Docker/compose.yaml -f Docker/demo.compose.yaml down
```

## Build and verification

Run workflow/infrastructure validation, frontend checks, secret scanning and simulator checks:

```sh
docker compose -f Docker/checks.compose.yaml run --rm workflows
docker compose -f Docker/checks.compose.yaml run --rm infrastructure
docker compose -f Docker/checks.compose.yaml build checks secrets simulator-checks simulator-image-test
docker compose -f Docker/checks.compose.yaml run --rm checks npm run verify
docker compose -f Docker/checks.compose.yaml run --rm secrets /opt/kth-devops/verify-secrets.sh
docker compose -f Docker/checks.compose.yaml run --rm simulator-checks
docker compose -f Docker/checks.compose.yaml run --rm simulator-image-test
```

These commands need no live broker. They cover lint, TypeScript, unit/contract tests, dependency auditing, the production build and browser startup tests. Controlled lint violations and nonfunctional tokens demonstrate the ESLint and Gitleaks gates. Rebuild checking images after source or dependency changes.

Then test the actual Nginx frontend image using the build just produced:

```sh
docker compose -f Docker/runtime.compose.yaml build frontend
docker compose -f Docker/runtime.compose.yaml up -d --wait --wait-timeout 120 frontend
docker compose -f Docker/runtime.compose.yaml run --rm runtime-checks
docker compose -f Docker/runtime.compose.yaml down
```

Successful checks exit with code `0`. Results are written to `FE/test-results/`, `FE/playwright-report/` and `simulator/test-results/`; the frontend build is in `FE/dist/sail-monitoring-web/browser/`.

### Real MQTT laboratory

After frontend verification above, run the disposable laboratory. It requires no cloud account, external broker or manually supplied credentials.

**Windows CMD** (default Git for Windows installation):

```bat
"%ProgramFiles%\Git\bin\bash.exe" ci/lab/check.sh
```

**macOS or Git Bash:**

```sh
bash ci/lab/check.sh
```

PowerShell users can run `./ci/lab/check.ps1`.

Terraform's Docker provider provisions an isolated network, the checked frontend, Mosquitto with authentication and topic ACLs, and the simulator. The script generates temporary credentials and TLS certificates, checks no-change plans before and after a second apply, runs [browser/broker E2E tests](FE/e2e/integration/broker.spec.ts), collects diagnostics and attempts teardown even after failures.

Scenarios cover telemetry and recording, malformed messages, stale data, broker restart recovery and broker-enforced guest command denial. Browser certificate verification stays enabled. The idempotence checker permits only documented null-to-empty refresh differences in selected Docker-provider fields; planned changes and other drift fail.

This idempotence check covers the **Docker laboratory**, as specified in the proposal; it does not check DigitalOcean resources. The flow is `up → plan → second apply → plan → MQTT tests → logs → down`. `ci/lab/run.sh` coordinates these steps, `adapter.sh` runs the container tools, and `terraform.sh` runs Terraform inside the tooling container.

Diagnostics are in `FE/test-results/lab-diagnostics/` and `FE/test-results/integration/`. Private state, plans and certificates stay under ignored `.runtime/<environment-id>/`. Never commit or share these files. If teardown fails, preserve the environment ID and state, set `KTH_ENVIRONMENT_ID` to that ID and run `bash ci/lab/run.sh down` from Git Bash/macOS. The laboratory never targets the shared demo broker.

## CI/CD and quality gates

[CI](.github/workflows/ci.yaml) runs on pushes to `main`, `dev`, `ettore` and `juozas`, PRs targeting `main`/`dev`, and manual dispatch. All five jobs must pass before [CD](.github/workflows/cd.yaml) runs on eligible pushes.

| Check | Blocking policy |
| --- | --- |
| ESLint | Errors and warnings block. |
| Type checks, tests, build and infrastructure validation | Failures block, including MQTT E2E and Terraform idempotence. |
| Gitleaks | Detected secrets block; reachable Git history and the non-ignored working tree are scanned. |
| Dependency audit | High/critical findings, including development dependencies, and scan errors block. Low/moderate findings are reported; no audit exceptions are configured. |

CD packages the checked frontend on `main`. Optional deployment paths publish it to GitHub Pages from `main`, or publish the three tested images to DigitalOcean Container Registry (DOCR) and update App Platform from `dev`. Compiled frontend hashes verify build reuse; only public runtime configuration changes. DigitalOcean releases use unique commit/run/attempt tags, checked against the tested image digests before and after deployment. The workflow never reuses a release tag; registry write access can still change tags.

For **Pages**, select **Settings → Pages → Source: GitHub Actions** and configure repository variables `PAGES_DEPLOY_ENABLED=true` and `PAGES_PUBLIC_CONFIG_JSON` using the JSON format above, with the actual broker endpoint and usernames. Pages hosts only the frontend; the broker runs separately. For **DigitalOcean**, follow the [account setup, private state and deployment instructions](infra/README.md) before enabling `KTH_DO_DEPLOY_ENABLED`. With deployment flags unset, CI and frontend delivery on `main` still run.

Configure required CI checks and one peer approval through an active GitHub branch ruleset or branch protection. A disabled ruleset does not enforce these requirements.

In each run's **Actions → Summary → Artifacts**, diagnostics are retained for 7 days, runtime image archives for 3 days, and the frontend delivery candidate for 14 days. Downloading them preserves evidence beyond that period; it is not required to run the project.

## External services and limits

GitHub hosts the repository, automation and Pages frontend; DigitalOcean App Platform and DOCR support the persistent demo. The map uses OpenStreetMap tiles. Container registries and npm supply tools, dependencies and vulnerability data.

GitHub runners check [Google's public Docker Hub cache](https://cloud.google.com/artifact-registry/docs/pull-cached-dockerhub-images) first, keeping the same image names and versions. No Google account or Docker Hub token is required. Cache misses fall back to Docker Hub and remain subject to its availability and limits. Secret scanning pulls Gitleaks from GHCR. Recognized temporary image-download failures get at most three attempts; test failures are never retried automatically. Local commands use the existing Docker Desktop settings.

Telemetry is synthetic and covers a defined command subset, not the full boat electronics. Passing laboratory tests does not prove the external deployment is healthy, and automated security scans do not guarantee the absence of vulnerabilities.

## AI assistance

AI tools supported code review, troubleshooting and conceptual discussions, as well as frontend simplification and workflow/test implementation. The authors are responsible for reviewing changes and validating them through the project checks.
