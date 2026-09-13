import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const base = 'http://127.0.0.1:4399';
const token = readFileSync('/tmp/sompo-live/cookies.txt','utf8').split('\n').find(l=>l.includes('luca_session'))?.trim().split('\t').pop();
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
await context.addCookies([{ name:'luca_session', value: token, url: base, httpOnly:true }]);
const page = context.pages()[0] || await context.newPage();
await page.setViewportSize({ width: 1720, height: 960 });
await page.goto(`${base}/sompo/`, { waitUntil:'domcontentloaded', timeout:60000 });
await page.waitForTimeout(3500);
const el = await page.$('.sompo-stories');
if (el) { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(900); }
await el.screenshot({ path: '/tmp/sompo-look/ui/story-cards.png' }).catch(async()=>{ await page.screenshot({ path:'/tmp/sompo-look/ui/story-cards.png' }); });
await page.screenshot({ path: '/tmp/sompo-look/ui/welcome-full.png', fullPage: true });
console.log('ok');

