import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [phase = 'before', port = '5197'] = process.argv.slice(2);
const out = resolve(`delivery/${phase}`); mkdirSync(out,{recursive:true});
const browser = await chromium.connectOverCDP('http://127.0.0.1:9347');
const pages = browser.contexts()[0].pages();
const page = pages[0];
for (const other of pages.slice(1)) {
  if (/^http:\/\/127\.0\.0\.1:519[78]/.test(other.url())) await other.close();
}
page.setDefaultTimeout(60_000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const errors=[];page.on('pageerror', e=>errors.push(String(e)));
const cases = [ ['normal','normal',6000,1440,1000], ['fire','engine-fire',12000,1440,1000], ['harvest','agri-harvest-dust',9000,1440,1000], ['mud','agri-field-bogging',9000,1440,1000], ['night','agri-night-operation',9000,1440,1000], ['mobile','agri-harvest-dust',9000,390,844], ['mobile-road','normal',6000,390,844] ];
for (const [name,scenario,at,width,height] of cases) {
  if (process.env.SOMPO_CAPTURE_CASES && !process.env.SOMPO_CAPTURE_CASES.split(',').includes(name)) continue;
  await page.setViewportSize({width,height});
  await page.goto(`http://127.0.0.1:${port}/?benchmark=1`);
  await page.locator('[data-sompo-model="gltf"]').waitFor();
  if(scenario!=='normal') await page.locator('select[name="sompo-scenario"]').selectOption(scenario);
  await page.locator('[data-sompo-model="gltf"]').waitFor();
  await page.waitForTimeout(2500);
  await page.evaluate(ms=>window.__sompoPreview.advance(ms),at);
  await page.waitForFunction(()=>window.__sompoPreview.time===window.__sompoPreview.until, {timeout:60000});
  await page.waitForTimeout(5500);
  const data=await page.evaluate(()=>window.__sompoPreview.measure());
  const outcome=await page.locator('select[name="sompo-scenario-outcome"]').inputValue();
  await page.screenshot({path:`${out}/${name}.png`,fullPage:true});
  await page.locator('.sompo-simulator-stage').screenshot({path:`${out}/${name}-scene.png`});
  writeFileSync(`${out}/${name}.json`,JSON.stringify({scenario,outcome,at,cache:'disabled',browserPages:browser.contexts()[0].pages().length,errors:[...errors],...data},null,2));
  console.log(JSON.stringify({phase,name,renderer:data.renderer,interval:data.intervalMs,cpu:data.cpuMs,calls:data.calls,triangles:data.triangles,bytes:data.loadedBytes}));
}
await browser.close();
