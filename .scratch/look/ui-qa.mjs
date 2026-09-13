// QA da UI completa (welcome + stories + banner) no Chrome headed via CDP.
// Uso: UIQA_BASE=http://127.0.0.1:4399 UIQA_STEP=welcome|sim node ui-qa.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.UIQA_BASE || 'http://127.0.0.1:4399';
const step = process.env.UIQA_STEP || 'welcome';
const scenario = process.env.UIQA_SCENARIO || 'animal-crossing';
const outcome = process.env.UIQA_OUTCOME || 'colisao';
const at = Number(process.env.UIQA_AT || 0);
const out = '/tmp/sompo-look/ui';
mkdirSync(out, { recursive: true });

// sessao local do cookies.txt do curl
let token = '';
try {
  const line = readFileSync('/tmp/sompo-live/cookies.txt', 'utf8')
    .split('\n').find((l) => l.includes('luca_session'));
  token = line?.trim().split('\t').pop() || '';
} catch {}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
if (token) {
  const host = new URL(base).hostname;
  await context.addCookies([{ name: 'luca_session', value: token, url: base, httpOnly: true }]);
}
const page = context.pages()[0] || await context.newPage();
await page.setViewportSize({ width: 1720, height: 960 });

if (step === 'welcome') {
  await page.goto(`${base}/sompo/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/welcome.png` });
  const cards = await page.$$eval('.sompo-story-card', (els) => els.map((e) => e.querySelector('h3')?.textContent));
  console.log('cards:', JSON.stringify(cards));
} else {
  await page.goto(`${base}/sompo/?aba=telemetria&fonte=simulacao&cenario=${scenario}&desfecho=${outcome}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-sompo-simulator]');
    return el?.dataset.sompoModel && el.dataset.sompoModel !== 'loading';
  }, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  if (at > 0) await page.waitForTimeout(at);
  await page.screenshot({ path: `${out}/sim-${scenario}-${outcome}${at ? `-${at}` : ''}.png` });
  const banner = await page.$eval('.sompo-story-banner', (el) => ({
    title: el.querySelector('.sompo-story-banner__title')?.textContent,
    speed: el.querySelector('[data-story-speed]')?.textContent,
    phase: el.querySelector('[data-story-phase]')?.textContent,
  })).catch(() => null);
  console.log('banner:', JSON.stringify(banner));
}

