import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { cli, root, runtime, temporary } from './support/cli.js';

const temDist = fs.existsSync(path.join(root, 'dist/index.html'));

test('feira checar no runtime local isolado: só GET, sem sessão, release real passa', { timeout: 60000 }, async t => {
  const directory = await temporary(t);
  const url = await runtime(t, directory);
  const env = { LUCA_CLI_CONFIG: path.join(directory, 'cli.json') };
  const result = await cli(['feira', 'checar', '--url', url], { env });
  const porId = Object.fromEntries(result.json.checks.map(c => [c.id, c]));
  assert.equal(porId.health.ok, true);
  assert.match(result.json.versao, /^\d+\.\d+\.\d+/);
  assert.equal(porId['state-sem-login'].status, 401);
  if (!temDist) return t.diagnostic('sem dist/: assets não conferidos (rode npm run build)');
  assert.equal(result.code, 0, JSON.stringify(result.json.falhas));
  assert.equal(result.json.ok, true);
  assert.match(porId['pagina stand'].permissionsPolicy, /microphone=\(self\)/);
  assert.match(porId['pagina totem'].permissionsPolicy, /microphone=\(\)/);
  for (const chunk of ['StandPage', 'GameplayPage', 'OperadorPage', 'TotemPage']) {
    assert.ok(result.json.checks.some(c => c.id.startsWith(`asset /assets/${chunk}-`) && c.ok && c.bytes > 0), chunk);
  }
  // Sem o GLB no checkout (aceite sem a coruja 3D) ele é só aviso, como na produção.
  const temGlb = fs.existsSync(path.join(root, 'public/stand/avatar/coruja-3d/coruja-3d.glb'));
  assert.equal(porId['coruja-3d.glb'].presente, temGlb);
  assert.equal(porId['coruja-3d.glb'].ok, true);
  if (temGlb) {
    assert.match(porId['coruja-3d.glb'].caminho, /^\/assets\/coruja-3d-[\w-]{8}\.glb$/, 'o build sai com o GLB com hash');
    assert.equal(porId['coruja-3d.glb'].cacheControl, 'public, max-age=31536000, immutable');
  }
});

test('feira checar acusa release errada (fallback SPA), microfone bloqueado e /api/state aberto; exit 1', async t => {
  const html = '<!doctype html><script type="module" src="/assets/index-abc123.js"></script>';
  const metodos = new Set();
  const server = createServer((req, res) => {
    metodos.add(req.method);
    const politica = 'camera=(), microphone=(), geolocation=()';
    if (req.url === '/api/health') return res.end(JSON.stringify({ ok: true, version: '9.9.9' }));
    if (req.url === '/api/state') return res.end('{}');
    if (req.url === '/assets/index-abc123.js') { res.setHeader('content-type', 'text/javascript'); return res.end('"assets/StandPage-x1.js";"assets/TotemPage-t1.js"'); }
    if (req.url === '/assets/TotemPage-t1.js') { res.setHeader('content-type', 'text/javascript'); return res.end('export{}'); }
    res.writeHead(200, { 'content-type': 'text/html', 'permissions-policy': politica });
    res.end(html);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const directory = await temporary(t);
  const url = `http://127.0.0.1:${server.address().port}`;
  const result = await cli(['feira', 'checar'], { env: { LUCA_URL: url, LUCA_CLI_CONFIG: path.join(directory, 'cli.json') } });
  assert.equal(result.code, 1);
  assert.equal(result.json.ok, false);
  for (const id of ['state-sem-login', 'pagina stand', 'asset /assets/StandPage-x1.js', 'chunk gameplay', 'chunk operador']) assert.ok(result.json.falhas.includes(id), id);
  assert.equal(result.json.checks.find(c => c.id === 'asset /assets/StandPage-x1.js').motivo, 'fallback SPA: release errada');
  assert.ok(!result.json.falhas.includes('pagina totem'));
  assert.ok(!result.json.falhas.includes('asset /assets/TotemPage-t1.js'));
  assert.equal(result.json.checks.find(c => c.id === 'coruja-3d.glb').ok, true, 'GLB ausente é aviso, não falha');
  assert.deepEqual([...metodos], ['GET']);
  const plano = await cli(['feira', 'checar', '--url', url, '--dry-run'], { env: { LUCA_CLI_CONFIG: path.join(directory, 'cli.json') } });
  assert.equal(plano.code, 0);
  assert.ok(plano.json.urls.every(item => item.startsWith(url)));
});

test('feira checar segue o GLB da coruja com hash que o chunk do stand pede; release pela metade falha', async t => {
  const glb = Buffer.from('glTF'.repeat(64));
  let hashPresente = false;
  const server = createServer((req, res) => {
    const js = corpo => { res.setHeader('content-type', 'text/javascript'); res.end(corpo); };
    if (req.url === '/api/health') return res.end(JSON.stringify({ ok: true, version: '9.9.9' }));
    if (req.url === '/assets/index-abc123.js') return js('"assets/StandPage-x1.js"');
    if (req.url === '/assets/StandPage-x1.js') return js('import"./stand-s1.js"');
    if (req.url === '/assets/stand-s1.js') return js('const u="/assets/coruja-3d-ABCD_e-1.glb"');
    if (req.url === '/stand/avatar/coruja-3d/coruja-3d.glb') return res.end(glb);
    if (req.url === '/assets/coruja-3d-ABCD_e-1.glb' && hashPresente) {
      res.writeHead(200, { 'content-type': 'model/gltf-binary', 'cache-control': 'public, max-age=31536000, immutable' });
      return res.end(glb);
    }
    res.writeHead(200, { 'content-type': 'text/html', 'permissions-policy': 'microphone=(self)' });
    res.end('<!doctype html><script type="module" src="/assets/index-abc123.js"></script>');
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const directory = await temporary(t);
  const url = `http://127.0.0.1:${server.address().port}`;
  const env = { LUCA_CLI_CONFIG: path.join(directory, 'cli.json') };
  const coruja = async () => (await cli(['feira', 'checar', '--url', url], { env })).json.checks.find(c => c.id === 'coruja-3d.glb');

  const metade = await coruja();
  assert.equal(metade.caminho, '/assets/coruja-3d-ABCD_e-1.glb', 'o GLB conferido é o que o stand carrega, não a cópia de nome fixo');
  assert.equal(metade.ok, false, 'chunk pede o GLB com hash e ele não veio: release pela metade');
  hashPresente = true;
  const inteira = await coruja();
  assert.equal(inteira.ok, true);
  assert.equal(inteira.presente, true);
  assert.equal(inteira.cacheControl, 'public, max-age=31536000, immutable');
});
