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

function relogioComPrazos() {
  const fila = new Map();
  const prazos = [];
  let id = 0;
  return {
    agendar: (fn, ms) => { prazos.push(ms); fila.set(++id, fn); return id; },
    cancelar: (i) => { fila.delete(i); },
    pendentes: () => fila.size,
    prazos,
    async disparar() {
      const itens = [...fila.values()];
      fila.clear();
      for (const fn of itens) fn();
      await new Promise((r) => setImmediate(r));
    },
  };
}

test('jitter: cada religação espera 3 s + 0–999 ms pelo aleatório injetado', async () => {
  const relogio = relogioComPrazos();
  const sorteios = [0, 0.5, 0.999999, 1, -0.2];
  const religa = criarReligador(async () => false, relogio, 3000, () => sorteios.shift());
  await religa.tentar();
  for (let i = 0; i < 4; i += 1) await relogio.disparar();
  assert.deepEqual(relogio.prazos, [3000, 3500, 3999, 3999, 3000], 'fora de [0,1) fica preso na faixa');
});

test('1013 (teto por conta): o close religa no ritmo normal, uma tentativa por prazo, sem tempestade', async () => {
  const relogio = relogioComPrazos();
  let tentativas = 0;
  const fechamentos = [];
  // Igual ao useLucaState: o connect abre o socket (true), o servidor fecha com 1013
  // logo depois e o listener de close (que não olha o código) chama `agendar`.
  const aoFechar = (codigo) => { fechamentos.push(codigo); religa.agendar(); };
  const religa = criarReligador(async () => {
    tentativas += 1;
    queueMicrotask(() => aoFechar(1013));
    return true;
  }, relogio, 3000, () => 0.25);
  await religa.tentar();
  await new Promise((r) => setImmediate(r));
  for (let ciclo = 1; ciclo <= 5; ciclo += 1) {
    assert.equal(relogio.pendentes(), 1, `ciclo ${ciclo}: um agendamento só`);
    assert.equal(tentativas, ciclo, 'nenhuma tentativa fora do prazo');
    await relogio.disparar();
  }
  assert.ok(relogio.prazos.every((ms) => ms === 3250), 'todo 1013 espera o prazo inteiro');
  assert.deepEqual(fechamentos, [1013, 1013, 1013, 1013, 1013, 1013]);
});

test('fio: o close do /ws só agenda pelo religador (nenhum código religa na hora)', () => {
  const fonte = readFileSync(new URL('../src/hooks/useLucaState.tsx', import.meta.url), 'utf8');
  const close = fonte.slice(fonte.indexOf("socket.addEventListener('close'"), fonte.indexOf("socket.addEventListener('error'"));
  assert.match(close, /if \(!closed\) religador\.agendar\(\);/);
  assert.doesNotMatch(close, /connect\(\)|religador\.tentar\(\)/);
});
