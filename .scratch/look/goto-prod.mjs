import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();
await page.goto('https://luca-ai.com.br/sompo/', { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('url:', page.url(), '| title:', await page.title());
