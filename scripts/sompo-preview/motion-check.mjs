// Read-only application fixture. Owned GPU browser is routed silently to workspace 7.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getSompoScenarioScript } from '../../shared/sompo-telemetry-simulator.js';
import { getSompoAgriScenario } from '../../shared/sompo-agri-scenarios.js';
const out = process.env.SOMPO_MOTION_OUTPUT || '.scratch/sompo-motion/evidence'; mkdirSync(out, { recursive: true });
let browser, server; const checks = [], errors = [];
try {
  execFileSync('hyprctl', ['eval', 'if not sompo_studio_qa_rule then sompo_studio_qa_rule=hl.window_rule({name="sompo-studio-qa-only",match={class="^sompo-studio-qa$"},workspace="7 silent",no_initial_focus=true,suppress_event="activate activatefocus"}) end']);
  server = spawn(process.execPath, ['scripts/sompo-preview/serve.mjs'], { env: { ...process.env, SOMPO_PREVIEW_PORT: '5201', SOMPO_PREVIEW_OUTPUT: '/tmp/sompo-motion-qa', SOMPO_PREVIEW_INSPECT: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('exit', code => reject(Error(`Fixture ${code}`))); });
  browser = await chromium.launch({ headless: false, executablePath: '/opt/google/chrome/chrome', args: ['--class=sompo-studio-qa', '--ozone-platform=x11', '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => { errors.push(String(e)); console.error('PAGE',String(e)); });
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text().slice(0, 2000)); });
  const own = JSON.parse(execFileSync('hyprctl', ['clients', '-j'])).filter(x => x.class === 'sompo-studio-qa');
  assert.ok(own.length && own.every(x => x.workspace.id === 7)); console.log('Verified workspace 7');
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  cdp.on('Page.screencastFrame',({sessionId})=>{void cdp.send('Page.screencastFrameAck',{sessionId}).catch(()=>{});});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:15,maxWidth:64,maxHeight:64,everyNthFrame:5});
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.goto('http://127.0.0.1:5201/?benchmark=1&offscreen=1'); await page.locator('[data-sompo-model="modular"]').waitFor();
  await page.evaluate(() => {
    const f = window.__sompoPreview;
    f.pose = () => {
      const scene = f.scene; if (!scene) return null;
      const machine = scene.getObjectByName('sompo-agri-machine') || scene.getObjectByName('sompo-rural-machine');
      if (!machine) return null;
      const wheels = [], parts = [];
      machine.traverse(node => {
        if (node.name.startsWith('agri-wheel-') && node.isGroup || node.name.startsWith('tire-') && node.isMesh) wheels.push(node.quaternion.toArray());
        if (['agri-implement','agri-header','agri-header-reel','cab-assembly'].includes(node.name)) parts.push({ name: node.name, p: node.position.toArray(), q: node.quaternion.toArray() });
      });
      return { p: machine.position.toArray(), q: machine.quaternion.toArray(), wheels, parts };
    };
  });
  const advance = async (ms, step = 1000 / 60) => {
    await page.evaluate(({ ms, step }) => { const f = window.__sompoPreview; f.stepMs = step; f.advance(ms); }, { ms, step });
    await page.waitForFunction(() => window.__sompoPreview.time === window.__sompoPreview.until, null, { timeout: 60000, polling: 30 }).catch(async error => { console.error('CLOCK', await page.evaluate(() => ({ time:window.__sompoPreview.time, until:window.__sompoPreview.until, frames:window.__sompoPreview.motionFrames?.length, captureError:window.__sompoPreview.captureError }))); throw error; });
  };
  const pose = async () => {
    await page.waitForFunction(() => window.__sompoPreview.pose()?.wheels.length >= 4, null, { polling: 30 });
    return page.evaluate(() => window.__sompoPreview.pose());
  };
  const scenario = async (id, outcome) => {
    await page.locator('select[name="sompo-scenario"]').selectOption(id);
    if (outcome) await page.locator('select[name="sompo-scenario-outcome"]').selectOption(outcome);
    await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading');
  };
  const seek = async at => {
    const pause = page.getByRole('button', { name: 'Pausar simulação', exact: true }); if (await pause.count()) await pause.click();
    await page.getByRole('slider', { name: 'Instante da simulação' }).fill(String(at)); await advance(1);
  };
  const resume = async () => { const button = page.getByRole('button', { name: 'Reproduzir simulação', exact: true }); if (await button.count()) await button.click(); };
  const renderer = await page.evaluate(() => window.__sompoPreview.measure().renderer); assert.match(renderer, /NVIDIA/); console.log(renderer);
  if (!process.env.SOMPO_MOTION_VIDEO_ONLY) {
    const ids = await page.locator('select[name="sompo-scenario"] option').evaluateAll(xs => xs.map(x => x.value));
    if (!process.env.SOMPO_MOTION_CADENCE_ONLY) for (const id of ids) {
      await scenario(id);
      const outcomes = await page.locator('select[name="sompo-scenario-outcome"] option').evaluateAll(xs => xs.map(x => x.value));
      for (const outcome of outcomes) {
        await page.locator('select[name="sompo-scenario-outcome"]').selectOption(outcome);
        await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading');
        const totalMs = id.startsWith('agri-') ? getSompoAgriScenario(id).totalMs : getSompoScenarioScript(id, outcome)?.totalMs ?? 6000;
        await resume(); await advance(totalMs, 250);
        const end = await pose(); assert.ok(end && end.wheels.length >= 4, `${id}/${outcome} wheels`);
        const numbers = [...end.p, ...end.q, ...end.wheels.flat(), ...end.parts.flatMap(x => [...x.p, ...x.q])]; assert.ok(numbers.every(Number.isFinite));
        checks.push({ check: 'complete scenario render', id, outcome, totalMs, pose: end });
        if (['agri-tractor-rollover','agri-hydraulic-failure','agri-harvest-dust','animal-crossing','tight-reverse'].includes(id)) await page.locator('[data-sompo-simulator]').screenshot({ path: `${out}/${id}-${outcome}-end.png` });
      }
      writeFileSync(`${out}/catalog-checks.json`, JSON.stringify(checks, null, 2));
      console.log('CATALOG', id, outcomes.length);
    }
    // Actual scene poses, including articulated objects, after replaying different display cadences.
    for (const [id, outcome, at] of [['normal', null, 5500], ['bogged-down', 'afunda-mais', 8500], ['agri-field-bogging', 'assisted-recovery', 8500], ['agri-hydraulic-failure', 'isolated', 5500], ['agri-harvest-dust', 'clean-pass', 5500]]) {
      await scenario(id, outcome); await seek(at); const expected = await pose(); await advance(700); const paused = await pose();
      const flatten = value => [...value.p, ...value.q, ...value.wheels.flat(), ...value.parts.flatMap(x => [...x.p, ...x.q])];
      const pauseError = Math.max(...flatten(paused).map((x, i) => Math.abs(x - flatten(expected)[i]))); assert.ok(pauseError < 1e-9, `${id} paused pose changed: ${pauseError}`);
      for (const hz of [30, 60, 120]) {
        await seek(at - 1000); await resume(); await advance(1000, 1000 / hz);
        const actual = await pose();
        const a = [...actual.p, ...actual.q, ...actual.wheels.flat(), ...actual.parts.flatMap(x => [...x.p, ...x.q])];
        const b = [...expected.p, ...expected.q, ...expected.wheels.flat(), ...expected.parts.flatMap(x => [...x.p, ...x.q])];
        assert.equal(a.length, b.length); const delta = Math.max(...a.map((x, i) => Math.abs(x - b[i]))); assert.ok(delta < .00001, `${id} ${hz}Hz drift ${delta}`);
        checks.push({ check: 'actual scene pose matches seek and pause', id, hz, maxError: delta });
      }
      writeFileSync(`${out}/motion-partial.json`, JSON.stringify({checks,errors},null,2));
      console.log('CADENCE', id);
    }
    const resources = [];
    for (let i = 0; i < 4; i++) {
      await scenario('agri-harvest-dust'); await advance(1000, 100); await scenario('normal'); await advance(1000, 100);
      resources.push(await page.evaluate(() => ({ ...window.__sompoPreview.resources })));
    }
    assert.ok(resources.at(-1).buffers <= resources[1].buffers + 2, JSON.stringify(resources)); assert.ok(resources.at(-1).textures <= resources[1].textures + 2, JSON.stringify(resources));
    checks.push({ check: 'resource reuse across stage alternations', resources });
    for (const id of ['normal','agri-harvest-dust','agri-hydraulic-failure']) {
      await page.setViewportSize({ width: 390, height: 844 }); await scenario(id); await seek(6000);
      await page.locator('[data-sompo-simulator]').screenshot({ path: `${out}/${id}-mobile.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      checks.push({ check: 'mobile rendering', id });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const [id, asset] of [['agri-hydraulic-failure','tractor'],['agri-harvest-dust','harvester']]) {
      const pattern = `**/generated-agri-${asset}.glb`;
      await page.route(pattern, route => route.fulfill({ status: 404, body: 'Intentional fixture asset failure' })); await scenario(id); await page.locator('[data-sompo-model="fallback"]').waitFor();
      await seek(5000); const a = await pose(); await resume(); await advance(500); const b = await pose();
      assert.equal(a.wheels.length, 4); assert.notDeepEqual(a.wheels, b.wheels);
      checks.push({check:'articulated fallback after failed GLB',id}); await page.unroute(pattern);
    }

  }
  // Capture actual post-render WebGL buffers at 30 logical frames/sec. These are
  // motion evidence, NOT a measurement of presentation FPS in the hidden workspace.
  if (!process.env.SOMPO_MOTION_SKIP_VIDEO) for (const [id, outcome, start, duration] of [
    ['agri-hydraulic-failure','isolated',2000,8500],
    ['agri-field-bogging','assisted-recovery',6500,8000],
    ['agri-harvest-dust','clean-pass',3000,6500],
    ['agri-tractor-rollover','side-rollover',4000,8500],
    ['bogged-down','afunda-mais',5000,7000],
    ['animal-crossing','colisao',4000,7500],
  ].filter(item => !process.env.SOMPO_MOTION_VIDEO_IDS || process.env.SOMPO_MOTION_VIDEO_IDS.split(',').includes(item[0])).slice(0,Number(process.env.SOMPO_MOTION_VIDEO_LIMIT)||6)) {
    await scenario(id, outcome); await seek(start); await page.waitForTimeout(1200);
    const dir = `${out}/${id}-frames`; mkdirSync(dir, { recursive: true });
    await page.evaluate(() => {
      const f = window.__sompoPreview, canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 608;
      const ctx = canvas.getContext('2d', {willReadFrequently:true}); f.motionFrames = []; let last = -1;
      f.onFrame = (_scene, _camera, renderer) => {
        if (last === f.time) return; last = f.time;
        ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
        f.motionFrames.push(canvas.toDataURL('image/jpeg', .87));
      };
    });
    await resume();
    const captureDuration = Number(process.env.SOMPO_MOTION_DURATION) || duration;
    for (let captured = 0; captured < captureDuration; captured += 1000) {
      await advance(Math.min(1000,captureDuration-captured), 1000 / 30);
      console.log('CAPTURE',id,captured+1000,await page.evaluate(()=>window.__sompoPreview.motionFrames.length));
    }
    const frames = await page.evaluate(() => { const f = window.__sompoPreview; f.onFrame = null; return f.motionFrames; });
    frames.forEach((data, i) => writeFileSync(`${dir}/${String(i).padStart(4, '0')}.jpg`, Buffer.from(data.split(',')[1], 'base64')));
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '30', '-i', `${dir}/%04d.jpg`, '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/${id}.mp4`]);
    checks.push({ check: 'actual WebGL motion capture', id, outcome, start, duration:captureDuration, frames: frames.length, fps: 30 }); console.log('VIDEO', id, frames.length);
  }
  writeFileSync(`${out}/motion-checks.json`, JSON.stringify({ renderer, scheduler: 'fixture timer; no presentation FPS claim', checks, errors }, null, 2));
  assert.deepEqual(errors, []); console.log('PASS', checks.length);
} catch (error) { writeFileSync(`${out}/motion-failed.json`,JSON.stringify({checks,errors,error:String(error)},null,2)); throw error; } finally { await browser?.close(); server?.kill(); }
