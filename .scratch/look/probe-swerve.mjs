import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = '/tmp/sompo-look/shots';
const port = process.env.SHOT_PORT || '5201';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/google/chrome/chrome',
  args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('PAGE', String(e)));
await page.goto(`http://127.0.0.1:${port}/?benchmark=1&offscreen=1`);
await page.waitForFunction(() => {
  const el = document.querySelector('[data-sompo-simulator]');
  return el?.dataset.sompoModel && el.dataset.sompoModel !== 'loading';
}, null, { timeout: 90000 });
await page.locator('select[name="sompo-scenario"]').selectOption('animal-crossing');
await page.locator('select[name="sompo-scenario-outcome"]').selectOption('desvio');
await page.waitForTimeout(4000);
await page.evaluate(ms => window.__sompoPreview.advance(ms), 4200);
await page.waitForFunction(() => window.__sompoPreview.time === window.__sompoPreview.until, null, { timeout: 60000 });
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const scene = window.__sompoPreview.scene;
  if (!scene) return { error: 'no scene' };
  const asset = scene.getObjectByName('generated-rural-truck')
    || scene.getObjectByName('tesla-semi')
    || scene.getObjectByName('sompo-rural-machine');
  const data = { found: !!asset };
  let pose = asset;
  while (pose && !data.poseRotationY) {
    if (Math.abs(pose.rotation.y) > 1e-4 || Math.abs(pose.position.z) > 1e-4) {
      data.poseRotationY = pose.rotation.y;
      data.poseZ = pose.position.z;
      data.poseX = pose.position.x;
      data.poseName = pose.name || pose.type;
      data.poseParent = pose.parent?.name || pose.parent?.type;
    }
    pose = pose.parent;
  }
  return data;
});
console.log('POSE', JSON.stringify(info));

// Vista aérea: posiciona a câmera diretamente acima do caminhão.
const placeTopCamera = () => page.evaluate(() => {
  const { camera, scene } = window.__sompoPreview;
  const asset = scene.getObjectByName('sompo-rural-machine');
  const v = asset.getWorldPosition(new camera.position.constructor());
  camera.position.set(v.x + 0.5, 15, v.z + 0.5);
  camera.lookAt(v.x, 0, v.z);
});
await placeTopCamera();
await page.waitForTimeout(400);
await placeTopCamera();
await page.waitForTimeout(300);
await page.locator('[data-sompo-simulator]').screenshot({ path: `${out}/desvio-aereo.png` });
await browser.close();
