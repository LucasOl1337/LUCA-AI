import { createServer } from 'node:http';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { build } from 'esbuild';

const repo = '/home/lol/Projects/LUCA-AI';
const output = '/tmp/sompo-voxel-preview/agri-csp';
mkdirSync(output, { recursive: true });
await build({
  absWorkingDir: repo,
  entryPoints: [`${repo}/scripts/sompo-agri/preview.ts`],
  outfile: `${output}/preview.js`,
  bundle: true,
  format: 'esm',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
writeFileSync(`${output}/preview.css`, readFileSync(`${repo}/scripts/sompo-agri/preview.css`));
writeFileSync(`${output}/index.html`, '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sompo Agrícola</title><link rel="stylesheet" href="/preview.css"></head><body><canvas></canvas><div class="caption"><strong>Sompo · máquinas agrícolas</strong>Trator 4x4 e colheitadeira · Hunyuan3D-2.1 · 28k tris cada</div><script type="module" src="/preview.js"></script></body></html>');

const indexSource = readFileSync(`${repo}/server/index.js`, 'utf8');
const csp = indexSource.match(/res\.setHeader\('Content-Security-Policy', "([^"]+)"\)/)?.[1];
if (!csp) throw new Error('Production CSP not found');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' };
createServer((request, response) => {
  response.setHeader('Content-Security-Policy', csp);
  const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  const base = pathname.startsWith('/models/') ? `${repo}/public` : output;
  const file = resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(`${base}/`)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    response.setHeader('Content-Length', statSync(file).size);
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}).listen(5190, '127.0.0.1', () => console.log('Sompo agri CSP preview: http://127.0.0.1:5190/'));

