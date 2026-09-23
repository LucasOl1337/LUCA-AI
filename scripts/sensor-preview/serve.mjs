import { createServer } from 'node:http';
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Prévia isolada do laboratório /sensor sob a CSP real do app (sem login e sem APIs).
// Uso: SENSOR_PREVIEW_PORT=5211 node scripts/sensor-preview/serve.mjs
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.env.SENSOR_PREVIEW_PORT || 5211);
const output = resolve(process.env.SENSOR_PREVIEW_OUTPUT || `${repo}/.sensor-preview`);
mkdirSync(output, { recursive: true });
if (process.env.SENSOR_PREVIEW_SKIP_BUILD !== '1') {
  await build({
    absWorkingDir: repo,
    entryPoints: [`${repo}/scripts/sensor-preview/preview.tsx`],
    outfile: `${output}/preview.js`,
    bundle: true,
    format: 'esm',
    minify: process.env.SENSOR_PREVIEW_MINIFY !== '0',
    sourcemap: process.env.SENSOR_PREVIEW_MINIFY === '0' ? 'inline' : false,
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { '@': `${repo}/src` },
    external: ['/fonts/*'],
    logLevel: 'warning',
  });
}
writeFileSync(`${output}/index.html`, '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A massa de prova · prévia</title><style>html,body{margin:0;background:#07090d}</style><link rel="stylesheet" href="/preview.css"><div id="root"></div><script type="module" src="/preview.js"></script></html>');
const csp = readFileSync(`${repo}/server/index.js`, 'utf8').match(/res\.setHeader\('Content-Security-Policy', [`"]([^`"]+)[`"]\)/)?.[1]?.replace('${scriptPolicy}', "'self'");
if (!csp || csp.includes('sandbox')) throw new Error('CSP do app não encontrada');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
createServer((req, res) => {
  res.setHeader('Content-Security-Policy', csp.replace("connect-src 'self' ws: wss:", "connect-src 'self'"));
  const url = new URL(req.url || '/', 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  if (req.method !== 'GET' || path.startsWith('/api/')) { res.writeHead(405).end('Prévia: APIs desligadas'); return; }
  const base = /^\/(models|sompo|fonts)\//.test(path) ? `${repo}/public` : output;
  const file = resolve(base, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(`${base}/`)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('Content-Length', statSync(file).size);
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Prévia do /sensor: http://127.0.0.1:${port}/?sensorDebug`));
