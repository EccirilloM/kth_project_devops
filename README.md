# Sailing Monitor — DD2482 DevOps Project

This project adds automated testing and deployment to the [Polimi Sailing Team frontend](https://github.com/Sailing-Team-Polimi/sail_monitoring_web). The Angular application displays live boat telemetry and a map, with recording controls available to operators. It connects directly to an MQTT broker over secure WebSockets (WSS).

**Authors:** Ettore Mugisha Cirillo (`emcir@kth.se`) and Juozas Skarbalius (`juozas@kth.se`).

To work without the physical boat, we use a simulator that publishes synthetic telemetry through a real Mosquitto broker. This lets us test the browser's communication with the broker, including permissions and recovery from connection failures, before deploying the application.

The frontend is in `FE/`, the simulator in `simulator/`, and the Terraform configuration in `infra/`. Container definitions and automation scripts are in `Docker/` and `ci/`. The [project report](DD2482_Project_report.pdf) explains the architecture, design choices and limitations.

## Live application

You can try the application on [GitHub Pages](https://eccirillom.github.io/kth_project_devops/) or [DigitalOcean App Platform](https://kth-devops-sailing-hryqr.ondigitalocean.app/) without installing anything. Both frontends connect to our demo broker at `wss://kth-devops-sailing-hryqr.ondigitalocean.app/mqtt` and display data from the simulator. Sign in as `guest` to view telemetry, or as `operator` to use the recording controls. Contact the authors for access credentials.

This is a temporary demonstration for course assessment, using synthetic data rather than a connection to the physical boat. The guest account can only read telemetry; it cannot publish messages or send commands. We plan to retire the demo after assessment.

## Run locally

To run or test the project on your own computer, clone this repository and install Git and Docker with Linux containers and Compose v2. You will also need internet access. The tools run in containers, so there is no need to install Node.js, Python or Terraform separately. On Windows, Git for Windows provides Bash for the MQTT integration test script below. Run all commands from the **repository root**.

With port 4200 available, start the development environment:

```sh
docker compose -f Docker/compose.yaml up --build --wait --wait-timeout 600
docker compose -f Docker/compose.yaml exec web npm start
```

Open [localhost:4200](http://localhost:4200) after compilation. Without broker settings, the login displays **Broker not configured**. Stop Angular with `Ctrl+C`, then stop the environment:

```sh
docker compose -f Docker/compose.yaml down
```

To connect the local frontend to a broker, create `.runtime/` and copy [demo.config.example.json](Docker/demo.config.example.json) to `.runtime/demo-config.json`. Set the broker address and usernames for your environment:

```json
{
  "brokerUrl": "wss://broker.example/mqtt",
  "users": { "guest": "GUEST", "operator": "ADMIN" }
}
```

You can use our demo broker address above or another broker supporting MQTT 5 over WSS with a browser-trusted certificate. Enter passwords at sign-in. The configuration tells the frontend which controls to display; the broker enforces the actual topic permissions.

Start with the configuration override:

```sh
docker compose -f Docker/compose.yaml -f Docker/demo.compose.yaml up --build --wait --wait-timeout 600
docker compose -f Docker/compose.yaml -f Docker/demo.compose.yaml exec web npm start
```

After `Ctrl+C`, stop this configuration with:

```sh
docker compose -f Docker/compose.yaml -f Docker/demo.compose.yaml down
```

## Run the checks

The following commands validate the workflows and infrastructure, check the frontend and simulator, and scan for secrets and vulnerable dependencies:

```sh
docker compose -f Docker/checks.compose.yaml run --rm workflows
docker compose -f Docker/checks.compose.yaml run --rm infrastructure
docker compose -f Docker/checks.compose.yaml build checks secrets simulator-checks simulator-image-test
docker compose -f Docker/checks.compose.yaml run --rm checks npm run verify
docker compose -f Docker/checks.compose.yaml run --rm secrets /opt/kth-devops/verify-secrets.sh
docker compose -f Docker/checks.compose.yaml run --rm simulator-checks
docker compose -f Docker/checks.compose.yaml run --rm simulator-image-test
```

These checks do not need a running broker. They cover linting, types, unit tests, the production build and browser startup, and include controlled examples that verify the ESLint and Gitleaks checks reject problems. Rebuild the checking images after changing source code or dependencies.

Then test the actual Nginx frontend image using the build just produced:

```sh
docker compose -f Docker/runtime.compose.yaml build frontend
docker compose -f Docker/runtime.compose.yaml up -d --wait --wait-timeout 120 frontend
docker compose -f Docker/runtime.compose.yaml run --rm runtime-checks
docker compose -f Docker/runtime.compose.yaml down
```

Successful checks exit with code `0`. Results are written to `FE/test-results/`, `FE/playwright-report/` and `simulator/test-results/`; the frontend build is in `FE/dist/sail-monitoring-web/browser/`.

### MQTT integration tests

After the frontend checks above have produced a build, you can test it with a real MQTT connection. The script creates a temporary Docker environment using Terraform, runs the browser tests, and cleans up afterward. It generates its own test credentials and TLS certificates, so you do not need a cloud account or access to our deployed demo.

**Windows CMD** (default Git for Windows installation):

```bat
"%ProgramFiles%\Git\bin\bash.exe" ci/lab/check.sh
```

**Linux, macOS or Git Bash:**

```sh
bash ci/lab/check.sh
```

PowerShell users can run `./ci/lab/check.ps1`.

The environment contains the frontend, Mosquitto and the simulator on an isolated network. The [browser tests](FE/e2e/integration/broker.spec.ts) cover telemetry, recording, malformed messages, stale data, broker restart and rejection of guest commands. The script also checks that applying the same Terraform configuration again leaves this environment unchanged. See the [infrastructure notes](infra/README.md#local-test-environment) for diagnostics and cleanup troubleshooting.

## CI/CD and quality gates

[GitHub Actions](.github/workflows/ci.yaml) runs these checks on pushes to `main`, `dev`, `ettore` and `juozas`, and on pull requests targeting `main` or `dev`. It can also be started manually. All five CI jobs must pass before the [delivery workflow](.github/workflows/cd.yaml) can publish a release.

| Check | Blocking policy |
| --- | --- |
| ESLint | Errors and warnings block. |
| Type checks, tests, build and infrastructure validation | Failures block, including MQTT E2E and Terraform idempotence. |
| Gitleaks | Detected secrets block; reachable Git history and the non-ignored working tree are scanned. |
| Dependency audit | High/critical findings, including development dependencies, and scan errors block. Low/moderate findings are reported; no audit exceptions are configured. |

After successful checks, the push branch determines where the application is deployed:

| Branch | Deployment after successful CI |
| --- | --- |
| `main` | Publish the validated frontend to GitHub Pages. |
| `dev` | Publish the three tested images to DOCR and update DigitalOcean App Platform. |

This is why a successful run may show one deployment job as skipped. Deployment reuses the tested frontend build and supplies public settings separately at runtime. For DigitalOcean, each release uses unique image tags whose digests are checked before and after deployment. Setup instructions for deploying your own copy are in [infra/README.md](infra/README.md).

Test reports and build artifacts are available under **Actions → Summary → Artifacts** for each run.

## External services and limits

The live demo relies on GitHub Pages, DigitalOcean App Platform and DigitalOcean Container Registry (DOCR), while the map loads OpenStreetMap tiles. Building and testing also requires container registries and npm; CI uses Google's public Docker Hub cache to reduce download failures.

The simulator represents a subset of the boat's behaviour. Its tests help us check changes without hardware, but they cannot reproduce every condition on the real boat. Similarly, the security checks detect specific classes of problems rather than guarantee that the application has no vulnerabilities.
