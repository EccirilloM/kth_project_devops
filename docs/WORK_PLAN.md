# DD2482 parallel work plan

Owners: Ettore Mugisha Cirillo and Juozas Skarbalius.

Target deadline: 2026-10-11, 23:59 Europe/Stockholm. Target completion of
implementation: October 8; reserve October 9-10 for reproduction and reporting.

## Current state and working rules

- The frozen upstream baseline is `32db3ae3312734cab72c478a86d740a65150e7e8`.
- Existing code provides an Angular frontend, MQTT protocol unit tests, a Docker
  development workspace and a GitHub Pages workflow. There is no integration
  broker, simulator, Terraform environment or Playwright suite yet.
- This plan describes future work. No containers, application tests or deployment
  were run while preparing it. Existing workflow success is not established here.
- Use containers for development and test tooling; no host Node or Python is required.
- Ettore and Juozas run local Docker commands and record the results. The assistant
  prepares files and instructions but does not run Docker.
- Do not connect integration tests to the operational broker. No operational Sailing
  Team changes are part of this project.
- Work in short feature branches with PRs and reciprocal review. Select one PR base
  before starting; `main` is proposed because the existing workflow targets it.
- Each PR states what changed, how to reproduce its checks, observed results and
  remaining limitations. Do not call an unexecuted check successful.
- Shared documentation, new code and the report are written in English.

## Ownership and interfaces

| Area | Primary owner | Reviewer |
| --- | --- | --- |
| Frontend runtime configuration, ESLint and browser tests | Ettore | Juozas |
| Simulator, Mosquitto, TLS and Terraform | Juozas | Ettore |
| CI orchestration and Pages delivery | Ettore | Juozas |
| Broker authorization tests and security scanner configuration | Juozas | Ettore |
| Reproduction instructions, AI usage record and report | Both, in separate sections | Each other |

Ettore owns edits to `FE/package.json`, its lockfile and `.github/workflows/`.
Juozas supplies scanner commands and infrastructure entry points for those workflows.
Juozas owns the proposed `simulator/` and `infra/` directories; Ettore owns the
proposed `e2e/` directory. Coordinate changes to shared `Docker/` files before editing.
These new directories and commands are proposals, not existing interfaces.

## Phase 0: agree on the contract (October 1, together)

This is the only prerequisite for both initial development tracks.

- Record topic names, sample payloads, units, publication frequency, QoS and retained
  message behavior in a short protocol document based on the frozen frontend.
- Define guest, operator and simulator permissions. Guest login requires the three
  subscriptions currently used by the app: dashboard, mechatronics and indicators.
- Proposed initial simulator scope: dashboard, map, mechatronics, indicators and
  recording state; start/stop recording commands with matching `requestId` responses
  and subsequent live state. Explicitly document unsupported commands. The baseline
  diagnostic topic is `sail_gui/data/diagnostics`; agree whether to publish it as well.
- Agree on the public runtime configuration schema, browser-visible broker hostname,
  certificate names, internal Docker service names and frontend port.
- Agree on commands for provisioning, readiness, stopping/restarting the simulator,
  restarting the broker, gathering logs and teardown. Keep lifecycle control in test
  tooling, not in a new application backend.
- Start `AI_USAGE.md`: assistance received, human review, commands actually executed
  and unresolved limitations. Record this planning and repository preparation work.

Acceptance: both people can describe one telemetry message and a complete start/stop
exchange, and implement their side using the same examples without waiting for the other.

## Phase 1: independent foundations (October 1-3)

### Ettore: application and test preparation

1. Run the existing tests, type checks and build in Docker; capture a baseline result.
2. Load validated public configuration before MQTT initialization. Never fall back to
   the operational broker when test configuration is missing. Keep passwords out of
   runtime configuration and compiled assets.
3. Serve the compiled frontend with a static server; prepare a containerized Playwright
   runner and the first login/telemetry test. Test development can proceed before the
   real environment exists, but the E2E check is complete only after real integration.
4. Configure ESLint with a focused initial rule set and fix relevant violations.

Acceptance: existing checks run successfully; one compiled build can use two public
configuration files without rebuilding its JavaScript; missing configuration fails clearly.

### Juozas: simulator and broker

1. Implement a deterministic simulator, proposed in TypeScript/Node with MQTT.js,
   including unit tests for the declared command subset.
2. Configure Mosquitto authentication, topic authorization and WSS using generated
   laboratory TLS material. Document how the test browser trusts the laboratory CA.
3. Verify real client connections, permitted subscriptions and the operator command
   round trip. Ensure simulator reconnection and resubscription after a broker restart.
4. Begin Terraform resources for the Docker network, broker and simulator.

Acceptance: an authorized client receives known samples; start/stop returns the matching
request ID and updated state; wrong credentials fail; no operational broker is contacted.

## Phase 2: first complete integration (October 3-4)

- Juozas adds the static frontend service and configuration mounts to Terraform.
- Ettore connects Playwright to the compiled frontend, using the agreed runtime config.
- Together verify WSS certificate trust, login, a known UI telemetry value and start/stop.
- Use bounded readiness checks rather than assuming a container is ready when started.

Acceptance: browser -> real broker -> simulator -> broker -> browser works locally.
Resolve TLS, networking and payload mismatches here before adding more scenarios.

## Phase 3: failure and security checks (October 4-6, parallel)

### Ettore: browser scenarios

- Telemetry: a known simulator sample appears in the correct UI field.
- Malformed messages: invalid input does not replace valid data or crash the page;
  a later valid message is still displayed. Invalid input does not refresh data age.
- Stale data: stop simulator publication while keeping the broker connected; the UI
  marks data unavailable after the configured timeout and disables affected commands.
- Broker restart: the UI reports the outage, reconnects and receives fresh telemetry;
  commands from before the outage are not replayed.
- Keep tests independent of external map tile availability. Isolate or substitute tile
  requests only; do not mock MQTT transport in tests intended to verify real integration.
- Run disruptive scenarios serially against a shared environment, or provision a
  separate environment per worker to avoid interference.

### Juozas: authorization, infrastructure and scanners

- Attempt guest publications directly, bypassing UI restrictions. Assert broker denial
  and non-delivery to an authorized observer; prove the same path works for the operator.
- Verify Terraform formatting/validation, successful provisioning, a second apply with
  zero changes, and a final empty plan. Reuse generated credentials and certificates
  within one environment so repeated apply does not rotate them.
- Verify teardown and prepare diagnostic collection before destruction, including on
  test failure. Exclude passwords, private keys and Terraform state from artifacts.
- Configure Gitleaks and dependency scanning. Proposed gates: detected secrets, lint
  errors and high/critical dependency findings block release; exceptions require a
  narrow scope, rationale, owner and expiration date.
- Demonstrate gates with controlled lint violations, nonfunctional secret fixtures and
  a documented dependency-scanner example. Keep intentionally failing examples out
  of the normal passing production dependency graph; do not create broad allowlists.

Acceptance: each scenario has a reproducible result; the guest check would fail if broker
write access were accidentally granted; repeated apply produces no infrastructure changes.

## Phase 4: CI and delivery (October 6-8, parallel)

- Ettore integrates lint, type checks, unit tests, scanners, one frontend build,
  Terraform provisioning and E2E into GitHub Actions for PRs and `main`.
- Juozas validates clean-run infrastructure behavior and scanner gates, reviews the
  workflow and helps remove local path and architecture assumptions.
- Upload test reports, traces, screenshots and relevant logs before teardown, even on
  failure. Teardown must still run if testing or artifact upload fails.
- Deploy only after all required checks pass on `main`. Reuse the same frontend build
  artifact tested by E2E, with public runtime configuration supplied separately.
  Compare checksums of compiled assets before testing and delivery; do not rebuild.
- Configure the dedicated fork's Pages settings and required PR checks with reciprocal
  review. Deployment authorization and repository settings must be confirmed before
  enabling a workflow that publishes automatically.

Acceptance: successful PR checks do not deploy; a blocking failure prevents delivery;
an authorized successful `main` run publishes the tested build to the course fork's Pages.
Terraform never provisions or changes the operational MQTT broker.

## Phase 5: reproduction and hand-in (October 9-11)

- Ettore follows the instructions from a clean checkout on Windows; Juozas does the same
  on macOS, including ARM compatibility if applicable. Both use containerized tooling.
- Both verify setup, tests, diagnostics, repeated apply and cleanup. Reproducible setup
  may require internet access for images and dependencies; do not describe it as offline.
- Ettore drafts application interactions, runtime config and E2E/report evidence.
  Juozas drafts infrastructure, access controls, security gates and their limitations.
- Combine and review a 2-3 page report covering architecture, process, choices and
  trade-offs, including synthetic telemetry and differences from the operational broker.
- Complete the English README and AI usage record, distinguishing executed verification
  from planned or unverified behavior. Preserve links to CI runs and reviewed PRs.
- Submit through a new course-repository PR updating the approved proposal with artifact
  links, before October 11 at 23:59 Stockholm time. Reserve October 11 for final checks
  and submission rather than new features.

Acceptance: a teammate can reproduce the system using only the repository instructions,
and the final report and linked evidence cover every mandatory project criterion.
