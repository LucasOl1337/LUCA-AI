// Infra do e2e da feira (tests/feira-e2e.test.js): build do front com o palco
// falso, uma borda HTTP que serve esse build e repassa /api e /ws ao runtime
// isolado, e uma "rede" TCP na frente da borda que cai e volta sob comando.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { extname, join, normalize } from 'node:path';
import { cabecalhosDeSeguranca } from '../../server/cabecalhos-seguranca.js';
import { root } from './cli.js';

const PALCO_FALSO = join(root, 'tests/support/palco-falso.ts');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

/** Build de produção sem `public/` (353 MB) e com o palco do gameplay sem WebGL. */
export async function buildSemWebgl(saida) {
  const { build } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const palcoFalso = {
    name: 'palco-falso', enforce: 'pre',
    resolveId(fonte, importador) {
      if (/\/createSompoAgriStage$/.test(fonte) && /GameplayKiosk\.tsx$/.test(importador ?? '')) return PALCO_FALSO;
      return null;
    },
  };
  await build({
    root, configFile: false, logLevel: 'error', plugins: [react(), palcoFalso],
    resolve: { alias: { '@': join(root, 'src') } },
    build: { outDir: saida, emptyOutDir: true, copyPublicDir: false },
  });
}

/** Borda: estáticos (build, depois `public/`, depois o index da SPA) e repasse cru de /api e /ws. */
export async function borda(t, dist, alvo) {
  const portaAlvo = Number(new URL(alvo).port);
  const publico = join(root, 'public');
  const servidor = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      const ida = request({ host: '127.0.0.1', port: portaAlvo, method: req.method, path: req.url, headers: req.headers }, (volta) => {
        res.writeHead(volta.statusCode, volta.headers);
        volta.pipe(res);
      });
      ida.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(ida);
      return;
    }
    // Sem o plugin do offline o sw.js não tem a config: 404 faz o stand desregistrar e seguir.
    if (url.pathname === '/stand/sw.js') { res.writeHead(404); res.end(); return; }
    for (const [nome, valor] of Object.entries(cabecalhosDeSeguranca(url.pathname))) res.setHeader(nome, valor);
    const relativo = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let arquivo = [join(dist, relativo), join(publico, relativo)].find((c) => existsSync(c) && statSync(c).isFile());
    arquivo ??= join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream', 'Content-Length': statSync(arquivo).size });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(arquivo).on('error', () => res.destroy()).pipe(res);
  });
  servidor.on('upgrade', (req, socket, cabeca) => {
    const ida = net.connect(portaAlvo, '127.0.0.1', () => {
      const linhas = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) linhas.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      ida.write(`${linhas.join('\r\n')}\r\n\r\n`);
      if (cabeca?.length) ida.write(cabeca);
      socket.pipe(ida).pipe(socket);
    });
    const fim = () => { socket.destroy(); ida.destroy(); };
    ida.on('error', fim); socket.on('error', fim); ida.on('close', fim); socket.on('close', fim);
  });
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(() => { servidor.closeAllConnections(); servidor.close(); });
  return `http://127.0.0.1:${servidor.address().port}`;
}

/** Rede do quiosque: proxy TCP na frente da borda. `cair()` fecha tudo e recusa; `voltar()` religa. */
export async function rede(t, alvo) {
  const portaAlvo = Number(new URL(alvo).port);
  const vivos = new Set();
  let caida = false;
  const servidor = net.createServer((cliente) => {
    if (caida) { cliente.destroy(); return; }
    const ida = net.connect(portaAlvo, '127.0.0.1');
    vivos.add(cliente); vivos.add(ida);
    cliente.pipe(ida); ida.pipe(cliente);
    const fim = () => { cliente.destroy(); ida.destroy(); vivos.delete(cliente); vivos.delete(ida); };
    cliente.on('error', fim); ida.on('error', fim); cliente.on('close', fim); ida.on('close', fim);
  });
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(() => { for (const s of vivos) s.destroy(); servidor.close(); });
  return {
    url: `http://127.0.0.1:${servidor.address().port}`,
    cair() { caida = true; for (const s of vivos) s.destroy(); vivos.clear(); },
    voltar() { caida = false; },
  };
}
