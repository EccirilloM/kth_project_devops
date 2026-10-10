# Sailing Monitor — DD2482 DevOps Project

Reproducible testing and secure delivery for an Angular MQTT application, based on the [Polimi Sailing Team frontend](https://github.com/Sailing-Team-Polimi/sail_monitoring_web).

**Authors:** Ettore Mugisha Cirillo (`emcir@kth.se`) and Juozas Skarbalius (`juozas@kth.se`).

The browser connects directly to an MQTT broker over secure WebSockets (WSS), displaying boat telemetry and a map with role-dependent recording controls. A synthetic boat simulator and a real Mosquitto broker make testing possible without the physical boat.

Code: `FE/` (frontend), `simulator/`, `infra/` (Terraform), `Docker/` and `ci/` (tooling). See the [project report](https://github.com/EccirilloM/DevOps_Project_Report) for architecture, design choices and limitations.

## Live application

Open the [GitHub Pages frontend](https://eccirillom.github.io/kth_project_devops/) or the [App Platform frontend](https://kth-devops-sailing-hryqr.ondigitalocean.app/). Both use the DigitalOcean broker at `wss://kth-devops-sailing-hryqr.ondigitalocean.app/mqtt` and its simulator. Use `guest` for telemetry or `operator` for recording controls; obtain credentials privately from the authors.

[Run #65, attempt 2](https://github.com/EccirilloM/kth_project_devops/actions/runs/38052448425/attempts/2) passed CI and deployed Pages. On 10 October 2026, manual checks confirmed guest telemetry on Pages and operator recording controls on App Platform.

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

These checks need no live broker. They include lint, types, unit tests, audit, build, browser startup and controlled ESLint/Gitleaks gate demonstrations. Rebuild checking images after source or dependency changes.

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

Terraform's Docker provider provisions an isolated network, the checked frontend, Mosquitto with topic ACLs, and the simulator. The script generates temporary credentials and TLS certificates, checks plans before and after a second apply, runs [MQTT E2E tests](FE/e2e/integration/broker.spec.ts), collects diagnostics and attempts teardown even after failures.

Scenarios cover telemetry, recording, malformed messages, stale data, broker restart and guest command denial. TLS verification stays enabled. Idempotence permits only documented null-to-empty refreshes in selected Docker-provider fields; planned changes and other drift fail.

Idempotence covers the **Docker laboratory**, not DigitalOcean. The flow in `ci/lab/run.sh` is `up → plan → second apply → plan → MQTT tests → logs → down`.

Diagnostics: `FE/test-results/lab-diagnostics/` and `FE/test-results/integration/`. Private state, plans and certificates stay in ignored `.runtime/<environment-id>/`; do not share them. If teardown fails, preserve that directory, set `KTH_ENVIRONMENT_ID` to its environment ID and run `bash ci/lab/run.sh down` from Git Bash/macOS. The shared demo broker is never targeted.

## CI/CD and quality gates

[CI](.github/workflows/ci.yaml) runs on pushes to `main`, `dev`, `ettore` and `juozas`, PRs targeting `main`/`dev`, and manual dispatch. All five jobs must pass before [CD](.github/workflows/cd.yaml) runs on eligible pushes.

| Check | Blocking policy |
| --- | --- |
| ESLint | Errors and warnings block. |
| Type checks, tests, build and infrastructure validation | Failures block, including MQTT E2E and Terraform idempotence. |
| Gitleaks | Detected secrets block; reachable Git history and the non-ignored working tree are scanned. |
| Dependency audit | High/critical findings, including development dependencies, and scan errors block. Low/moderate findings are reported; no audit exceptions are configured. |

CD packages the checked frontend on `main`. The configured deployment paths are:

| Branch | Deployment after successful CI |
| --- | --- |
| `main` | Publish the validated frontend to GitHub Pages. |
| `dev` | Publish the three tested images to DOCR and update DigitalOcean App Platform. |

The other branch's deployment job is **skipped by design**. Compiled frontend hashes verify build reuse; only public runtime configuration changes. DigitalOcean releases use unique commit/run/attempt tags, checked against the tested image digests before and after deployment. The workflow never reuses a release tag; registry write access can still change tags.

For **Pages**, select **Settings → Pages → Source: GitHub Actions** and configure repository variables `PAGES_DEPLOY_ENABLED=true` and `PAGES_PUBLIC_CONFIG_JSON` using the JSON format above, with the actual broker endpoint and usernames. Pages hosts only the frontend; the broker runs separately. For **DigitalOcean**, follow the [account setup, private state and deployment instructions](infra/README.md) before enabling `KTH_DO_DEPLOY_ENABLED`. With deployment flags unset, CI and frontend delivery on `main` still run.

Configure required CI checks and one peer approval through an active GitHub branch ruleset or branch protection. A disabled ruleset does not enforce these requirements.

In each run's **Actions → Summary → Artifacts**, diagnostics are retained for 7 days, runtime image archives for 3 days, and the frontend delivery candidate for 14 days. Downloading them preserves evidence beyond that period; it is not required to run the project.

## External services and limits

GitHub hosts the repository, automation and Pages frontend; DigitalOcean App Platform and DOCR support the persistent demo. The map uses OpenStreetMap tiles. Container registries and npm supply tools, dependencies and vulnerability data.

CI uses [Google's public Docker Hub cache](https://cloud.google.com/artifact-registry/docs/pull-cached-dockerhub-images), falling back to Docker Hub, and pulls Gitleaks from GHCR. No Google account or Docker Hub token is required. Temporary image-download failures get at most three attempts; test failures are not retried. Local commands use Docker Desktop settings.

Telemetry is synthetic and covers a defined command subset, not the full boat electronics. Passing laboratory tests does not prove the external deployment is healthy, and automated security scans do not guarantee the absence of vulnerabilities.

## AI assistance

AI tools supported code review, troubleshooting and conceptual discussions, as well as frontend simplification and workflow/test implementation. The authors are responsible for reviewing changes and validating them through the project checks.
