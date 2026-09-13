import { chromium } from 'playwright';
const port = process.env.SHOT_PORT || '5197';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/?benchmark=1&offscreen=1`);
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({
  compact: window.matchMedia('(max-width: 700px), (pointer: coarse)').matches,
  coarse: window.matchMedia('(pointer: coarse)').matches,
  narrow: window.matchMedia('(max-width: 700px)').matches,
  dpr: window.devicePixelRatio,
}));
console.log(JSON.stringify(info));
await browser.close();
