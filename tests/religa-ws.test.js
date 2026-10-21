import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarReligador } = await loadFrontendModule('../../src/lib/religaWs.ts');

function relogioFalso() {
  const fila = new Map();
  let id = 0;
  return {
    agendar: (fn, ms) => { fila.set(++id, { fn, ms }); return id; },
    cancelar: (i) => { fila.delete(i); },
    pendentes: () => fila.size,
    async disparar() {
      const itens = [...fila.entries()];
      fila.clear();
      for (const [, { fn }] of itens) fn();
      await new Promise((r) => setImmediate(r));
    },
  };
}

test('servidor fora do ar na tentativa: agenda outra, e volta quando ele responde (sem F5)', async () => {
  const relogio = relogioFalso();
  const respostas = [false, false, true];
  let tentativas = 0;
  const religa = criarReligador(async () => { tentativas += 1; return respostas.shift(); }, relogio, 3000);
  await religa.tentar();
  assert.equal(relogio.pendentes(), 1, 'falhou: deixou a próxima tentativa agendada');
  await relogio.disparar();
  assert.equal(relogio.pendentes(), 1);
  await relogio.disparar();
  assert.equal(tentativas, 3);
  assert.equal(relogio.pendentes(), 0, 'abriu: quem agenda agora é o close do socket');
});

test('erro jogado pela tentativa também reagenda; um agendamento por vez', async () => {
  const relogio = relogioFalso();
  const religa = criarReligador(async () => { throw new Error('rede'); }, relogio);
  await religa.tentar();
  religa.agendar();
  religa.agendar();
  assert.equal(relogio.pendentes(), 1);
});

test('parar cancela o que estava agendado e ignora tentativas depois', async () => {
  const relogio = relogioFalso();
  let tentativas = 0;
  const religa = criarReligador(async () => { tentativas += 1; return false; }, relogio);
  await religa.tentar();
  religa.parar();
  assert.equal(relogio.pendentes(), 0);
  await religa.tentar();
  religa.agendar();
  assert.equal(tentativas, 1);
  assert.equal(relogio.pendentes(), 0);
});

test('useLucaState liga o /ws pelo religador (sem o retorno que desistia)', () => {
  const fonte = readFileSync(new URL('../src/hooks/useLucaState.tsx', import.meta.url), 'utf8');
  assert.match(fonte, /criarReligador\(connect\)/);
  assert.match(fonte, /if \(!hasBackend\) return false;/);
  assert.doesNotMatch(fonte, /if \(!hasBackend \|\| closed\) return;/);
});
