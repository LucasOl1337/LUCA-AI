import { chromium } from 'playwright';

const port = process.env.SHOT_PORT || '5199';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('PAGE', String(e)));
await page.goto(`http://127.0.0.1:${port}/?benchmark=1&offscreen=1`);
await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]')?.dataset.sompoModel === 'modular', null, { timeout: 90000 });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const f = window.__sompoPreview;
  const scene = f.scene, camera = f.camera;
  const out = { camera: camera.position.toArray().map(v => +v.toFixed(2)), targetY: null, truck: null, terrainSamples: [], objects: [] };
  const truck = scene.getObjectByName('sompo-rural-machine');
  if (truck) out.truck = truck.position.toArray().map(v => +v.toFixed(2));
  const terrain = scene.getObjectByName('rural-terrain-relief');
  if (terrain) {
    const pos = terrain.geometry.attributes.position;
    out.terrainY = [terrain.position.y];
    // sample a few vertex heights near the camera
    for (const [sx, sz] of [[10, 14], [10, 5], [10, -5], [10, -20], [10, -60], [10, -100], [10, 40], [10, 100]]) {
      // find nearest vertex
      let best = 1e9, by = null;
      for (let i = 0; i < pos.count; i += 4) {
        const dx = pos.getX(i) + terrain.position.x - sx, dz = pos.getZ(i) + terrain.position.z - sz;
        const d = dx * dx + dz * dz;
        if (d < best) { best = d; by = pos.getY(i) + terrain.position.y; }
      }
      out.terrainSamples.push([sx, sz, +by.toFixed(2)]);
    }
  }
  const sky = scene.getObjectByName('sompo-atmospheric-sky');
  if (sky) out.skyPos = sky.position.toArray().map(v => +v.toFixed(2));
  const lake = scene.getObjectByName('valley-lake-water');
  if (lake) out.lake = lake.position.toArray().map(v => +v.toFixed(2));
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
