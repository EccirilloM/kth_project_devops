import {test, expect} from '@playwright/test';

// These are startup smoke tests, not real broker integration tests.
test.beforeEach(async ({context}) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  // No smoke test should open a broker connection, even after a regression.
  await context.routeWebSocket(/.*/, socket => socket.close());
});

test('unconfigured build renders login without opening a broker connection', async ({page}) => {
  const errors: string[] = [];
  const sockets: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => sockets.push(socket.url()));
  await page.goto('./');
  await expect(page.getByRole('heading', {name: 'Sailing monitor', exact: true})).toBeVisible();
  await expect(page.getByText('Broker not configured.', {exact: false})).toBeVisible();
  await expect(page.getByLabel('Password', {exact: true})).toBeEmpty();
  await expect(page.getByRole('button', {name: 'Sign in'})).toBeDisabled();
  await expect(page.getByRole('img', {name: 'Polimi Sailing Team'})).toBeVisible();
  const logoLoaded = await page.getByRole('img', {name: 'Polimi Sailing Team'})
    .evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0);
  expect(logoLoaded).toBe(true);
  expect(errors).toEqual([]);
  expect(sockets).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path: test.info().outputPath('login.png'), fullPage: true});
});

test('a Pages-style hash deep link still requires authentication', async ({page}) => {
  await page.goto('./#/map');
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByRole('button', {name: 'Sign in'})).toBeDisabled();
});

test('runtime settings enable credential entry without rebuilding or contacting a broker', async ({page}) => {
  await page.route('**/assets/config.json', route => route.fulfill({
    json: {brokerUrl: 'wss://broker.invalid/mqtt', users: {operator: 'ADMIN'}},
  }));
  await page.goto('./');
  await expect(page.getByText('Broker not configured.', {exact: false})).toHaveCount(0);
  await page.getByLabel('Username', {exact: true}).fill('operator');
  await page.getByLabel('Password', {exact: true}).fill('nonfunctional-smoke-password');
  await expect(page.getByRole('button', {name: 'Sign in'})).toBeEnabled();
  // Do not submit: real authentication belongs to the integration suite.
});

for (const scenario of ['missing', 'malformed', 'insecure-url']) {
  test('startup fails visibly for ' + scenario + ' runtime configuration', async ({page}) => {
    await page.route('**/assets/config.json', route => {
      if (scenario === 'missing') return route.fulfill({status: 404, body: 'Not found'});
      if (scenario === 'malformed') return route.fulfill({contentType: 'application/json', body: '{bad'});
      return route.fulfill({json: {brokerUrl: 'ws://broker.invalid'}});
    });
    await page.goto('./');
    await expect(page.getByRole('alert')).toContainText('Sailing monitor could not start');
    await expect(page.getByRole('button', {name: 'Sign in'})).toHaveCount(0);
  });
}

test('missing assets return an error rather than an HTML fallback', async ({request}) => {
  const response = await request.get('assets/does-not-exist.json');
  expect(response.status()).toBe(404);
});
