import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarSessaoRecusada } = await loadFrontendModule('../../src/lib/sessaoRecusada.ts');

test('401 e 403 avisam quem assinou; rede caída (0) e 5xx não', () => {
  const s = criarSessaoRecusada();
  let avisos = 0;
  s.assinar(() => { avisos += 1; });
  for (const status of [0, 500, 502, 524, 200]) assert.equal(s.avisar(status), false, `status ${status}`);
  assert.equal(avisos, 0);
  assert.equal(s.avisar(401), true);
  assert.equal(s.avisar(403), true);
  assert.equal(avisos, 2);
});

test('soltar a assinatura para de avisar', () => {
  const s = criarSessaoRecusada();
  let avisos = 0;
  const soltar = s.assinar(() => { avisos += 1; });
  soltar();
  s.avisar(401);
  assert.equal(avisos, 0);
});

test('fio: /api/state avisa o status e o AuthProvider revalida a sessão, sem esperar foco', () => {
  const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../src/hooks/useAuth.tsx', import.meta.url), 'utf8');
  const fetchState = api.slice(api.indexOf('export async function fetchState'), api.indexOf('export async function apiPost'));
  assert.match(fetchState, /sessaoRecusada\.avisar\(/);
  assert.match(auth, /sessaoRecusada\.assinar\(\(\) => \{ if \(hasUserRef\.current\) void refreshSession\(\); \}\)/);
});

test('/ws fechado com 4401 avisa a sessão recusada; queda comum (1006, 1001, 1008) não', () => {
  const s = criarSessaoRecusada();
  let avisos = 0;
  s.assinar(() => { avisos += 1; });
  for (const codigo of [1000, 1001, 1006, 1008, 1011]) assert.equal(s.avisarFechamentoWs(codigo), false, `código ${codigo}`);
  assert.equal(avisos, 0);
  assert.equal(s.avisarFechamentoWs(4401), true);
  assert.equal(avisos, 1);
});

test('fio: o close do /ws passa o código para a sessão recusada antes de religar', () => {
  const estado = readFileSync(new URL('../src/hooks/useLucaState.tsx', import.meta.url), 'utf8');
  const close = estado.slice(estado.indexOf("socket.addEventListener('close'"), estado.indexOf("socket.addEventListener('error'"));
  assert.match(close, /sessaoRecusada\.avisarFechamentoWs\(evento\.code\);\s*if \(!closed\) religador\.agendar\(\);/);
});
