import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getSompoEpisodePlan } from '../../shared/sompo-telemetry-simulator.js';
import { getSompoAgriEpisodePlan } from '../../shared/sompo-agri-brief.js';
const out='delivery/smoke';mkdirSync(out,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:9347');
const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(60000);
const errors=[],external=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',route=>{if(!route.request().url().startsWith('http://127.0.0.1:5198/')){external.push(route.request().url());return route.abort();}return route.continue();});
await page.setViewportSize({width:1440,height:1000});
const open=()=>page.goto('http://127.0.0.1:5198/?benchmark=1');
const ready=()=>page.locator('[data-sompo-model="gltf"]').waitFor();
const select=id=>page.locator('select[name="sompo-scenario"]').selectOption(id);
async function advance(ms){await page.evaluate(value=>window.__sompoPreview.advance(value),ms);await page.waitForFunction(()=>window.__sompoPreview.time===window.__sompoPreview.until);await page.waitForTimeout(300);}
await open();await ready();
const ids=await page.locator('select[name="sompo-scenario"] option').evaluateAll(items=>items.map(o=>o.value));assert.equal(ids.length,26);
const catalog=[];
for(const id of ids){await select(id);await ready();await advance(100);catalog.push({id,source:await page.evaluate(()=>window.__sompoPreview.snapshot.source.scenarioId)});assert.equal(catalog.at(-1).source,id);assert.equal(await page.locator('.sompo-simulator-canvas canvas').count(),1);}
console.log('26 cenários: seleção, telemetria e canvas único OK');
// Resource counts after the same destination; no monotonic growth across alternating stages.
const resources=[];
for(let cycle=0;cycle<5;cycle++){
  await select('agri-harvest-dust');await ready();await page.waitForTimeout(1200);
  await select('normal');await ready();await page.waitForTimeout(1500);
  resources.push(await page.evaluate(()=>({...window.__sompoPreview.resources})));
}
assert.ok(resources.at(-1).buffers <= resources[1].buffers+2,JSON.stringify(resources));
assert.ok(resources.at(-1).textures <= resources[1].textures+2,JSON.stringify(resources));
console.log('Trocas repetidas:',JSON.stringify(resources));
// Orbit/focus controls and keyboard produce a real camera change.
const cameraBefore=await page.locator('.sompo-simulator-stage').screenshot();
await page.getByRole('button',{name:'Focar ESP32',exact:true}).click();await page.waitForTimeout(300);
const cameraAfter=await page.locator('.sompo-simulator-stage').screenshot();assert.notDeepEqual(cameraBefore,cameraAfter);
await page.locator('.sompo-simulator-canvas').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');
await page.getByRole('button',{name:'Visão geral',exact:true}).click();
await advance(1500);await page.getByRole('button',{name:'Reiniciar cenário',exact:true}).click();await page.waitForTimeout(300);
assert.equal(await page.evaluate(()=>window.__sompoPreview.snapshot.deviceTimestamp),0);
// Complete rural + agricultural runs with actual JPEG captures from the renderer.
const episodes=[];
for(const id of ['engine-fire','agri-harvest-dust']){
  await select(id);await ready();await page.waitForTimeout(700);
  const outcome=await page.locator('select[name="sompo-scenario-outcome"]').inputValue();
  const plan=id.startsWith('agri-')?getSompoAgriEpisodePlan(id,outcome):getSompoEpisodePlan(id,outcome);
  await page.evaluate(()=>{window.__sompoPreview.frames=[];window.__sompoPreview.samples=[];});
  await page.locator('[data-sompo-episode-run]').click();await page.locator('[data-sompo-episode-recording]').waitFor();
  assert.equal(await page.locator('select[name="sompo-scenario"]').isDisabled(),true);
  await advance(plan.totalMs+500);await page.locator('[data-sompo-episode-done]').waitFor();
  const result=await page.evaluate(()=>({frames:window.__sompoPreview.frames,samples:window.__sompoPreview.samples,finished:window.__sompoPreview.finished}));
  assert.equal(result.finished,'complete');assert.equal(result.frames.length,plan.frameMoments.length);
  for(const [index,frame] of result.frames.entries()){
    assert.ok(frame.offsetMs>=plan.frameMoments[index].offsetMs&&frame.offsetMs-plan.frameMoments[index].offsetMs<=1000);
    const bytes=Buffer.from(frame.dataUrl.split(',')[1],'base64');assert.ok(bytes.length>6000);assert.equal(bytes.readUInt16BE(0),0xffd8);
    writeFileSync(`${out}/${id}-frame-${index}.jpg`,bytes);
  }
  const timestamps=result.samples.flatMap(b=>b.episodeId?b.samples:[]).map(s=>s.timestamp);
  assert.ok(timestamps.length>10);assert.ok(timestamps.every((t,i)=>i===0||t>=timestamps[i-1]));
  episodes.push({id,outcome,totalMs:plan.totalMs,frames:result.frames.map(({dataUrl,...frame})=>frame),sampleCount:timestamps.length,lastTimestamp:timestamps.at(-1)});
  await page.screenshot({path:`${out}/${id}-complete.png`,fullPage:true});
}
console.log('Episódios completos com JPEGs:',JSON.stringify(episodes.map(e=>({id:e.id,frames:e.frames.length,samples:e.sampleCount}))));
// A failed start is actionable; it does not disable the simulator.
await select('engine-fire');await page.evaluate(()=>window.__sompoPreview.fail='start');await page.locator('[data-sompo-episode-run]').click();await page.locator('[data-sompo-episode-error]').waitFor();assert.equal(await page.locator('select[name="sompo-scenario"]').isDisabled(),false);await page.evaluate(()=>window.__sompoPreview.fail=null);
// Asset chains: generated -> Tesla -> procedural, and agricultural silhouette.
await page.route('**/models/sompo/generated-rural-truck.glb',route=>route.fulfill({status:404,body:'fixture missing'}));
await open();await page.locator('[data-sompo-model="gltf"]').waitFor();
assert.notEqual(await page.locator('[data-sompo-asset]').getAttribute('data-sompo-asset'),'GeneratedRuralTruck');
await page.screenshot({path:`${out}/tesla-fallback.png`,fullPage:true});
await page.route('**/models/sompo/tesla-semi.glb*',route=>route.fulfill({status:404,body:'fixture missing'}));
await open();await page.locator('[data-sompo-model="fallback"]').waitFor();await page.screenshot({path:`${out}/procedural-fallback.png`,fullPage:true});
await page.route('**/models/sompo/generated-agri-harvester.glb',route=>route.fulfill({status:404,body:'fixture missing'}));
await select('agri-harvest-dust');await page.locator('[data-sompo-model="fallback"]').waitFor();await page.screenshot({path:`${out}/agri-fallback.png`,fullPage:true});
await page.unrouteAll();
// Fresh mobile mount chooses compact budget, followed by resize of the same canvas.
await page.setViewportSize({width:390,height:844});await open();await ready();
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
const mobile=await page.evaluate(()=>window.__sompoPreview.measure());
await page.setViewportSize({width:844,height:390});await page.waitForTimeout(500);
assert.equal(await page.locator('.sompo-simulator-canvas canvas').count(),1);
const landscape=await page.evaluate(()=>({width:document.querySelector('canvas').width,stage:document.querySelector('.sompo-simulator-canvas').getBoundingClientRect().width}));assert.ok(Math.abs(landscape.width-landscape.stage)<=1);
// Firebase mode uses a fixed local snapshot and produces no history writes.
await page.goto('http://127.0.0.1:5198/?benchmark=1&source=firebase');await ready();await page.waitForTimeout(2200);
assert.equal(await page.evaluate(()=>window.__sompoPreview.samples.length),0);
await page.getByText('Calibração de eixos',{exact:true}).click();
await page.getByRole('checkbox',{name:'Inverter arfagem',exact:true}).check();
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('luca:sompo-axis-calibration:v2')).invertPitch),true);
await page.getByRole('button',{name:'Voltar ao padrão',exact:true}).click();
await page.getByRole('button',{name:'Recentrar guinada',exact:true}).click();
writeFileSync(`${out}/results.json`,JSON.stringify({catalog,resources,episodes,mobile:{canvas:mobile.canvas,renderer:mobile.renderer},landscape,errors,external},null,2));
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
console.log('Fallbacks, câmera, reset, resize/mobile e Firebase em fixture: OK');
await browser.close();
