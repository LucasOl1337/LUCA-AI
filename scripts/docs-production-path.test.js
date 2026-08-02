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
});
