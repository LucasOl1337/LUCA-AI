// Source lock: canonical docs must not present worker DO as current production.
// Run: node --test scripts/docs-production-path.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('AGENTS.md describes Express/VM production and marks worker as legacy', () => {
  const agents = read('AGENTS.md');
  assert.match(agents, /runtime Express/i);
  assert.match(agents, /luca-ai-vm-proxy\.js/);
  assert.match(agents, /legado/i);
  assert.equal(agents.includes('Worker Cloudflare publicado em `app.luca-ai.com.br`'), false);
  assert.equal(agents.includes('Inclua a migration do Durable Object no mesmo commit'), false);
});

test('INDEX.md routes deploy/ for publication and worker/ as legacy', () => {
  const index = read('INDEX.md');
  assert.match(index, /\| `deploy\/` \|/);
  assert.match(index, /legado/);
  assert.match(index, /app\.luca-ai\.com\.br/);
  assert.match(index, /publica(?:ç|c)(?:ã|a)o pela VM/);
});


test('README.md stack does not list bare Cloudflare Workers as product runtime', () => {
  const readme = read('README.md');
  assert.match(readme, /Express/i);
  assert.match(readme, /Cloudflare Tunnel/i);
  assert.match(readme, /luca-ai-vm-proxy\.js/);
  assert.match(readme, /worker\/.*legado|legado.*worker\//i);
  // bare stack list used to end with "Cloudflare Workers e Cloudflare Tunnel"
  assert.equal(/Cloudflare Workers e Cloudflare Tunnel/.test(readme), false);
});

test('docs/* still document VM Express + edge proxy as production', () => {
  const op = read('docs/operacao.md');
  const arq = read('docs/arquitetura.md');
  const integ = read('docs/integracoes.md');
  assert.ok(op.includes('luca-ai-vm-proxy.js'));
  assert.ok(op.includes('luca-ai.com.br'));
  assert.ok(arq.includes('worker/') && /legado/i.test(arq));
  assert.ok(integ.includes('luca-ai-vm-proxy.js'));
  assert.ok(existsSync(join(root, 'deploy/luca-ai-vm-proxy.js')));
  assert.ok(existsSync(join(root, 'worker/src/index.js')));
  // live production flow must name edge proxy, not "Worker de borda" / bare Worker gate
  assert.equal(arq.includes('Worker de borda'), false);
  assert.match(arq, /proxy de borda \(deploy\/luca-ai-vm-proxy\.js\)/);
  assert.match(arq, /borda Cloudflare \(proxy\/Tunnel\)/);
  // operacao/integracoes must not reintroduce Worker label for the edge proxy
  assert.equal(op.includes('Worker de borda'), false);
  assert.match(op, /proxy de borda `luca-ai-vm-proxy`/);
  assert.equal(integ.includes('único Worker ativo'), false);
  assert.equal(integ.includes('unico Worker ativo'), false);
  assert.match(integ, /proxy mínimo de borda versionado em `deploy\/luca-ai-vm-proxy\.js`/);
});
test('DocsDev/codegraph is marked SUPERSEDED and not production truth', () => {
  const cgReadme = read('DocsDev/codegraph/README.md');
  const inventory = read('DocsDev/codegraph/inventory.md');
  const release = read('DocsDev/releases/release-v0.1.0.md');
  const index = read('INDEX.md');
  assert.match(cgReadme, /HIST[OÓ]RICO\s*\/\s*SUPERSEDED/i);
  assert.match(cgReadme, /luca-ai-vm-proxy\.js/);
  assert.match(cgReadme, /legado/i);
  assert.match(inventory, /HIST[OÓ]RICO\s*\/\s*SUPERSEDED/i);
  assert.match(inventory, /legado/i);
  // release note must not present worker as current project surface without historical framing
  assert.match(release, /Worker Cloudflare \(hist[oó]rico da tag\)/);
  assert.match(release, /legado/);
  assert.equal(
    release.includes('registram a superficie de worker usada pelo projeto'),
    false,
  );
  assert.match(index, /DocsDev\/codegraph\//);
  assert.match(index, /SUPERSEDED|pre-VM|pré-VM|pre-vm/i);
  assert.ok(existsSync(join(root, 'DocsDev/codegraph/README.md')));
});
test('DocsDev/codegraph/codegraph-visual.html is marked SUPERSEDED not live production map', () => {
  const visual = read('DocsDev/codegraph/codegraph-visual.html');
  assert.match(visual, /HIST[OÓ]RICO\s*\/\s*SUPERSEDED/i);
  assert.match(visual, /luca-ai-vm-proxy\.js/);
  assert.match(visual, /Cloud Worker \(legado\)/);
  assert.match(visual, /hist[oó]rico pr[eé]-VM|legado/i);
  // bare "Cloud Worker" node label without legado framing is banned
  assert.equal(/<text[^>]*>Cloud Worker<\/text>/.test(visual), false);
  // cloud flow must not present runtimeMode=cloud as current commercial path without historical frame
  assert.match(visual, /Cloud \(hist[oó]rico pr[eé]-VM \/ legado\)/);
  assert.match(visual, /N[AÃ]O [eé] o path comercial atual/);
  assert.ok(existsSync(join(root, 'DocsDev/codegraph/codegraph-visual.html')));
});
