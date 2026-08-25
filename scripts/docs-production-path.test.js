// Trava o fato de publicacao: Express na VM + proxy de borda. worker/ e legado.
// Run: node --test scripts/docs-production-path.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('AGENTS.md descreve Express/VM e marca worker como legado', () => {
  const agents = read('AGENTS.md');
  assert.match(agents, /runtime Express/i);
  assert.match(agents, /luca-ai-vm-proxy\.js/);
  assert.match(agents, /legado/i);
  assert.equal(agents.includes('Worker Cloudflare publicado em `app.luca-ai.com.br`'), false);
});

test('INDEX.md roteia deploy/ para publicacao e worker/ como legado', () => {
  const index = read('INDEX.md');
  assert.match(index, /\| `deploy\/` \|/);
  assert.match(index, /legado/);
  assert.match(index, /app\.luca-ai\.com\.br/);
  assert.match(index, /publica(?:ç|c)(?:ã|a)o pela VM/);
});

test('README.md nao lista Cloudflare Workers como runtime do produto', () => {
  const readme = read('README.md');
  assert.match(readme, /Express/i);
  assert.match(readme, /Cloudflare Tunnel/i);
  assert.match(readme, /luca-ai-vm-proxy\.js/);
  assert.match(readme, /worker\/.*legado|legado.*worker\//i);
  assert.equal(/Cloudflare Workers e Cloudflare Tunnel/.test(readme), false);
});

test('docs oficiais descrevem Express na VM + proxy de borda', () => {
  const op = read('docs/operacao.md');
  const integ = read('docs/integracoes.md');
  assert.ok(op.includes('luca-ai.com.br'));
  assert.ok(integ.includes('luca-ai-vm-proxy.js'));
  assert.ok(integ.includes('worker/') && /legado/i.test(integ));
  assert.ok(existsSync(join(root, 'deploy/luca-ai-vm-proxy.js')));
  assert.ok(existsSync(join(root, 'worker/src/index.js')));
  assert.equal(op.includes('Worker de borda'), false);
  assert.equal(integ.includes('único Worker ativo'), false);
  assert.equal(integ.includes('unico Worker ativo'), false);
});
