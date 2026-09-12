import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const out = process.env.SOMPO_QA_OUTPUT || '.scratch/sompo-round2/evidence'; mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['scripts/sompo-preview/serve.mjs'],{env:{...process.env,SOMPO_PREVIEW_PORT:'5199',SOMPO_PREVIEW_OUTPUT:'/tmp/sompo-round2-preview'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',code=>reject(new Error('Fixture exit '+code)));});
let browser;
const errors=[];const checks=[];
try {
  browser=await chromium.launch({headless:false,executablePath:process.env.SOMPO_CHROME || '/opt/google/chrome/chrome',args:['--ozone-platform=x11','--use-angle=gl','--enable-gpu','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  page.on('pageerror',error=>errors.push(String(error)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text().slice(0,1500));});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  const click=name=>page.getByRole('button',{name,exact:true}).click();
  const advance=async ms=>{await page.evaluate(ms=>window.__sompoPreview.advance(ms),ms);await page.waitForFunction(()=>window.__sompoPreview.time===window.__sompoPreview.until);};
  const screenshot=async name=>{await page.locator('[data-sompo-simulator]').screenshot({path:`${out}/${name}.png`});};
  await page.goto('http://127.0.0.1:5199/?benchmark=1');await page.locator('[data-sompo-model="modular"]').waitFor();await page.waitForTimeout(3500);
  const renderer=await page.evaluate(()=>window.__sompoPreview.measure().renderer);assert.match(renderer,/NVIDIA/);console.log('GPU',renderer);
  await advance(3000);await screenshot('truck');
  await click('Oficina 3D');await click('Materiais');
  await page.getByRole('slider',{name:'Separar peças do caminhão'}).fill('0.7');await advance(100);await screenshot('studio-parts');
  await page.getByLabel('Cor da cabine',{exact:true}).fill('#9c3524');await page.getByRole('slider',{name:'Rugosidade da pintura'}).fill('0.3');await advance(100);await screenshot('studio-paint');
  await click('Biblioteca');await page.getByLabel('Nome da variação').fill('Frota QA');await click('Salvar variação');assert.match(await page.locator('.sompo-studio').innerText(),/Variação salva/);
  const presetDownload=page.waitForEvent('download');await click('Exportar preset');const preset=await presetDownload;await preset.saveAs(`${out}/preset.json`);const data=JSON.parse(readFileSync(`${out}/preset.json`,'utf8'));assert.equal(data.paint,'#9c3524');
  const glbDownload=page.waitForEvent('download',{timeout:60000});await click('Exportar GLB');const glb=await glbDownload;await glb.saveAs(`${out}/truck.glb`);const binary=readFileSync(`${out}/truck.glb`);assert.equal(binary.toString('ascii',0,4),'glTF');assert.ok(binary.length>10000);checks.push({check:'preset and GLB export',bytes:binary.length});
  const pngDownload=page.waitForEvent('download');await click('Capturar cena');const png=await pngDownload;await png.saveAs(`${out}/captured.png`);assert.equal(readFileSync(`${out}/captured.png`).subarray(1,4).toString(),'PNG');
  await click('Restaurar direção original');await click('Simulador');await click('Pausar simulação');
  const before=await page.getByRole('slider',{name:'Instante da simulação'}).inputValue();await advance(1000);const after=await page.getByRole('slider',{name:'Instante da simulação'}).inputValue();assert.equal(before,after);checks.push({check:'pause holds telemetry clock',at:before});
  await page.getByRole('slider',{name:'Instante da simulação'}).fill('7000');await page.waitForTimeout(300);assert.equal(Number(await page.getByRole('slider',{name:'Instante da simulação'}).inputValue()),7000);await click('Reproduzir simulação');
  const options=await page.locator('select[name="sompo-scenario"] option').evaluateAll(xs=>xs.map(x=>x.value));
  for(const scenario of options){await page.locator('select[name="sompo-scenario"]').selectOption(scenario);await page.waitForFunction(()=>document.querySelector('[data-sompo-simulator]').dataset.sompoModel!=='loading');await advance(2500);if(['engine-fire','agri-harvest-dust','agri-field-bogging','agri-night-operation'].includes(scenario)){await advance(6500);await screenshot(scenario);}checks.push({check:'scenario renders',scenario,model:await page.locator('[data-sompo-simulator]').getAttribute('data-sompo-model')});}
  const resources=[];
  for(let cycle=0;cycle<4;cycle++){
    await page.locator('select[name="sompo-scenario"]').selectOption('agri-harvest-dust');await page.locator('[data-sompo-model="gltf"]').waitFor();await page.waitForTimeout(800);
    await page.locator('select[name="sompo-scenario"]').selectOption('normal');await page.locator('[data-sompo-model="modular"]').waitFor();await page.waitForTimeout(1800);resources.push(await page.evaluate(()=>({...window.__sompoPreview.resources})));
  }
  assert.ok(resources.at(-1).textures<=resources[1].textures+2,JSON.stringify(resources));assert.ok(resources.at(-1).buffers<=resources[1].buffers+2,JSON.stringify(resources));checks.push({check:'no growth across stage alternations',resources});
  const {getSompoEpisodePlan}=await import('../../shared/sompo-telemetry-simulator.js');const {getSompoAgriEpisodePlan}=await import('../../shared/sompo-agri-brief.js');
  for(const id of ['engine-fire','agri-harvest-dust']){
    await page.locator('select[name="sompo-scenario"]').selectOption(id);await page.waitForFunction(()=>document.querySelector('[data-sompo-simulator]').dataset.sompoModel!=='loading');await page.waitForTimeout(1200);
    const outcome=await page.locator('select[name="sompo-scenario-outcome"]').inputValue();const plan=id.startsWith('agri-')?getSompoAgriEpisodePlan(id,outcome):getSompoEpisodePlan(id,outcome);
    await page.evaluate(()=>{window.__sompoPreview.frames=[];window.__sompoPreview.samples=[];});await page.locator('[data-sompo-episode-run]').click();await page.locator('[data-sompo-episode-recording]').waitFor();
    assert.equal(await page.getByRole('button',{name:'Oficina 3D',exact:true}).isDisabled(),true);await advance(plan.totalMs+500);await page.locator('[data-sompo-episode-done]').waitFor();
    const result=await page.evaluate(()=>({frames:window.__sompoPreview.frames,samples:window.__sompoPreview.samples,finished:window.__sompoPreview.finished}));assert.equal(result.finished,'complete');assert.equal(result.frames.length,plan.frameMoments.length);
    result.frames.forEach((frame,index)=>{const bytes=Buffer.from(frame.dataUrl.split(',')[1],'base64');assert.equal(bytes.readUInt16BE(0),0xffd8);assert.ok(bytes.length>6000);writeFileSync(`${out}/${id}-frame-${index}.jpg`,bytes);});checks.push({check:'complete recorded episode',id,frames:result.frames.length});
  }
  // Every measured frame advances the logical clock, unlike the former frozen benchmark.
  const measurements=[];
  for(const [name,scenario,width,height] of [['road','normal',1440,1000],['harvest','agri-harvest-dust',1440,1000],['road-mobile','normal',390,844],['harvest-mobile','agri-harvest-dust',390,844]]){
    await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5199/?benchmark=1');await page.locator('[data-sompo-model="modular"]').waitFor();await page.locator('select[name="sompo-scenario"]').selectOption(scenario);await page.waitForFunction(()=>document.querySelector('[data-sompo-simulator]').dataset.sompoModel!=='loading');await page.waitForTimeout(3500);await click('Visão geral');await advance(2000);await page.evaluate(()=>{window.__sompoPreview.metrics=[]});await advance(8000);const data=await page.evaluate(()=>window.__sompoPreview.measure());measurements.push({name,logicalStart:2000,logicalEnd:10000,...data});await screenshot(name+'-moving');console.log(name,JSON.stringify({cpu:data.cpuMs,triangles:data.triangles,calls:data.calls}));
  }
  await page.setViewportSize({width:390,height:844});await click('Oficina 3D');await screenshot('studio-mobile');const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);checks.push({check:'mobile no horizontal overflow'});
  assert.deepEqual(errors,[]);writeFileSync(`${out}/checks.json`,JSON.stringify({renderer,checks,errors,measurements},null,2));console.log('PASS',checks.length,'checks');
} finally {await browser?.close();server.kill();}
