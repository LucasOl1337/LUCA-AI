import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarTetoDiario, diaBrasilia, tetoDiarioDoEnv } from './teto-diario.js';

test('dia de Brasília vira à meia-noite local, não UTC', () => {
  assert.equal(diaBrasilia(Date.parse('2026-10-20T02:59:00Z')), '2026-10-19');
  assert.equal(diaBrasilia(Date.parse('2026-10-20T03:00:00Z')), '2026-10-20');
});

test('teto soma, estoura e zera no dia seguinte de Brasília', () => {
  let agora = Date.parse('2026-10-19T15:00:00Z');
  const teto = criarTetoDiario({ teto: 100, agora: () => agora });
  teto.somar(60);
  assert.equal(teto.estourou(), false);
  teto.somar(40);
  assert.equal(teto.estourou(), true);
  assert.equal(teto.restantes(), 0);
  teto.somar(-5);
  teto.somar('x');
  assert.equal(teto.usados(), 100);
  agora = Date.parse('2026-10-20T03:00:01Z');
  assert.equal(teto.estourou(), false);
  assert.deepEqual(teto.resumo(), { dia: '2026-10-20', usados: 0, teto: 100 });
});

test('contador sobrevive a restart pelo arquivo e ignora dia velho', (t) => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-teto-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'stand', 'creditos-dia.json');
  const agora = () => Date.parse('2026-10-19T15:00:00Z');
  criarTetoDiario({ teto: 1000, arquivo, agora }).somar(321.5);
  assert.equal(criarTetoDiario({ teto: 1000, arquivo, agora }).usados(), 321.5);
  const amanha = () => Date.parse('2026-10-20T12:00:00Z');
  assert.equal(criarTetoDiario({ teto: 1000, arquivo, agora: amanha }).usados(), 0);
  fs.writeFileSync(arquivo, 'lixo');
  assert.equal(criarTetoDiario({ teto: 1000, arquivo, agora }).usados(), 0);
});

test('teto do env: número positivo ou o padrão de 25 mil', () => {
  assert.equal(tetoDiarioDoEnv({}), 25000);
  assert.equal(tetoDiarioDoEnv({ STAND_TETO_DIARIO_CREDITOS: '5000' }), 5000);
  assert.equal(tetoDiarioDoEnv({ STAND_TETO_DIARIO_CREDITOS: '-1' }), 25000);
});
