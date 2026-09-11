// Public checkout smoke test: run against scripts/sompo-demo.mjs without local Fairfax data.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = new URL(process.env.LAB_TEST_URL || 'http://127.0.0.1:4246');
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  await page.goto(new URL('/sompo', base).href);
  const registration = await page.request.post(new URL('/api/auth/register', base).href, { data: { name: 'Public Lab test', email: `public-lab-${Date.now()}@example.test`, password: 'Public-lab-test-12345' } });
  assert.equal(registration.status(), 201);
  await page.reload();
  await page.getByText(/O pacote da fazenda é opcional/).waitFor();
  assert.equal(await page.locator('#lab-case-panel').isVisible(), true);
  await page.locator('[data-lab-example="water"]').click();
  await page.locator('[data-lab-canvas][data-gps="available"]').waitFor();
  assert.equal(await page.locator('[data-lab-scene]').getAttribute('data-terrain'), 'flat');
  assert.ok(await page.locator('[data-lab-event]').count() > 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: ['optional-farm-absent', 'public-example-replay', 'water-events', 'mobile-no-overflow'], browserErrors: errors }));
} finally { await browser.close(); }
