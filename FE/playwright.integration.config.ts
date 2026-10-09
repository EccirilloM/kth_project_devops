import {defineConfig, devices} from '@playwright/test';
import {readLab} from './scripts/lab-contract';
const lab = readLab();
export default defineConfig({
  testDir: './e2e/integration', workers: 1, fullyParallel: false, retries: 0,
  forbidOnly: true, timeout: 60000, expect: {timeout: 20000},
  outputDir: 'test-results/integration/browser',
  reporter: [['list'], ['junit', {outputFile: 'test-results/integration/junit.xml'}]],
  use: {
    ...devices['Desktop Chrome'], baseURL: lab.frontendUrl,
    ignoreHTTPSErrors: false, serviceWorkers: 'block',
    // Login actions/traces can contain passwords. Keep only screenshots and JUnit.
    trace: 'off', video: 'off', screenshot: 'only-on-failure',
  },
});
