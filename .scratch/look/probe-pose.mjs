import { chromium } from 'playwright';
const port = process.env.SHOT_PORT || '5201';
const scenario = process.env.SHOT_SCENARIO || 'normal';
const at = Number(process.env.SHOT_AT || 6000);
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('PAGE', String(e).slice(0, 600)));
await page.goto(`http://127.0.0.1:${port}/?benchmark=1&offscreen=1`);
await page.evaluate(() => { const f = window.__sompoPreview; f.onFrame = (s) => { f.scene = s; }; });
await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]')?.dataset.sompoModel && document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading', null, { timeout: 90000 });
if (scenario !== 'normal') {
  await page.locator('select[name="sompo-scenario"]').selectOption(scenario);
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(3000);
await page.evaluate(ms => window.__sompoPreview.advance(ms), at);
await page.waitForFunction(() => window.__sompoPreview.time === window.__sompoPreview.until, null, { timeout: 60000 });
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const s = window.__sompoPreview.scene;
  if (!s) return { scene: null };
  const pose = s.getObjectByName('sompo-rural-machine');
  const out = { posePos: pose.position.toArray().map(v => +v.toFixed(3)), poseRotDeg: [pose.rotation.x, pose.rotation.y, pose.rotation.z].map(r => +(r * 180 / Math.PI).toFixed(2)) };
  // Wheel world positions: lowest point of each wheel mesh bbox.
  const wheelYs = [];
  pose.traverse(o => {
    if (o.isMesh && /tire|Tires|wheel/i.test(o.name || '')) {
      const box = new (Object.getPrototypeOf(s).constructor === Object ? null : 0, window.THREE_NS?.Box3 || class {})();
    }
  });
  // Simpler: use three from the scene objects — compute world box via geometry boundingBox.
  const lows = [];
  pose.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry;
    if (!g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    // 8 corners to world Y min
    let min = Infinity;
    for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) {
      const v = { x: cx, y: cy, z: cz };
      const e = o.matrixWorld.elements;
      const wy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13];
      if (wy < min) min = wy;
    }
    lows.push({ name: o.name || o.type, minY: +min.toFixed(3) });
  });
  lows.sort((a, b) => a.minY - b.minY);
  out.lowestMeshes = lows.slice(0, 10);
  // Support array stats
  const support = pose.children[0]?.userData?.groundSupport ?? s.getObjectByName('sompo-rural-machine')?.children?.[0]?.userData?.groundSupport;
  out.supportPoints = support ? support.length / 3 : null;
  const truckGroup = pose.children.find(c => c.name && c.name !== '');
  out.childNames = pose.children.map(c => c.name || c.type);
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
