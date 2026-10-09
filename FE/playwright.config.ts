import {defineConfig, devices} from '@playwright/test';
const external = process.env['KTH_SMOKE_BASE_URL'];

export default defineConfig({
  testDir: './e2e/smoke',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  workers: 2,
  timeout: 30000,
  expect: {timeout: 5000},
  outputDir: 'test-results/browser',
  reporter: [
    ['list'],
    ['html', {outputFolder: 'playwright-report', open: 'never'}],
    ['junit', {outputFile: 'test-results/browser.xml'}],
  ],
  use: {
    baseURL: external ?? 'http://127.0.0.1:4173/kth_project_devops/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    {name: 'mobile-chromium', use: {...devices['Pixel 7']}},
  ],
  webServer: external ? undefined : {
    command: 'node scripts/serve-build.mjs',
    url: 'http://127.0.0.1:4173/kth_project_devops/',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
