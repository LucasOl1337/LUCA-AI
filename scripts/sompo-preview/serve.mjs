import { createServer } from 'node:http';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const repo = resolve(process.env.SOMPO_PREVIEW_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const port = Number(process.env.SOMPO_PREVIEW_PORT || 5197);
const output = resolve(process.env.SOMPO_PREVIEW_OUTPUT || `${repo}/.sompo-preview`);
mkdirSync(output, { recursive: true });
const inspect = process.env.SOMPO_PREVIEW_INSPECT === '1' ? [{ name: 'fixture-scene-probe', setup(build) {
  build.onLoad({ filter: /\/createSompoRuralStage\.ts$/ }, args => ({ loader: 'ts', contents: readFileSync(args.path, 'utf8')
    .replace('const settings = controlsRef.current;', `const settings = controlsRef.current;
      (window as any).__sompoFrame = { started: startedAtRef.current, stamp: runStamp, scenario: settings.scenarioId, outcome: settings.outcomeId, lastX: lastTruckWorldX };`)
    .replace('animalAnchorX = animalAnchorFor(settings, runOriginX);', `animalAnchorX = animalAnchorFor(settings, runOriginX);
        (window as any).__sompoAnchor = { anchorX: animalAnchorX, originX: runOriginX, scenario: settings.scenarioId, outcome: settings.outcomeId, lastX: lastTruckWorldX, stamp: runStamp, started: startedAtRef.current };`) }));
  build.onLoad({ filter: /\/sompoStage\.ts$/ }, args => ({ loader: 'ts', contents: readFileSync(args.path, 'utf8').replace('return { renderer, budget };', `
    const draw = renderer.render.bind(renderer);
    renderer.render = (scene, camera) => {
      const fixture = (window as any).__sompoPreview;
      draw(scene, camera);
      // Environment-map preprocessing also calls render. Observe only the stage.
      if (scene.getObjectByName('sompo-rural-machine') || scene.getObjectByName('sompo-agri-machine')) {
        fixture.scene = scene; fixture.camera = camera;
        fixture.onFrame?.(scene, camera, renderer);
      }
    };
    return { renderer, budget };`) }));
} }] : [];
if (process.env.SOMPO_PREVIEW_SKIP_BUILD !== '1') await build({ absWorkingDir: repo, entryPoints: [`${repo}/scripts/sompo-preview/preview.tsx`], outfile: `${output}/preview.js`, bundle: true, format: 'esm', minify: true, plugins: inspect, define: { 'process.env.NODE_ENV': '"production"' }, alias: { '@': `${repo}/src` } });
writeFileSync(`${output}/instrument.js`, readFileSync(`${repo}/scripts/sompo-preview/instrument.js`));
writeFileSync(`${output}/index.html`, '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SOMPO · prévia isolada</title><link rel="stylesheet" href="/preview.css"><div id="root"></div><script src="/instrument.js"></script><script type="module" src="/preview.js"></script></html>');
const csp = readFileSync(`${repo}/server/index.js`, 'utf8').match(/res\.setHeader\('Content-Security-Policy', "([^"]+)"\)/)?.[1];
if (!csp) throw new Error('CSP missing');
const types = { '.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp' };
createServer((req,res) => {
  res.setHeader('Content-Security-Policy', csp.replace("connect-src 'self' ws: wss:", "connect-src 'self'"));
  const url = new URL(req.url || '/', 'http://localhost'); const path = decodeURIComponent(url.pathname);
  if (req.method !== 'GET' || path.startsWith('/api/')) { res.writeHead(405).end('Preview: APIs disabled'); return; }
  const base = /^\/(models|environments|sompo)\//.test(path) ? `${repo}/public` : output;
  const file = resolve(base, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(`${base}/`)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');res.setHeader('Content-Length',statSync(file).size);createReadStream(file).pipe(res); } catch { res.writeHead(404).end(); }
}).listen(port, '127.0.0.1', () => console.log(`Local fixture: http://127.0.0.1:${port}`));
