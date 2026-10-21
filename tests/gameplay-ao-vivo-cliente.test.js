import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarAoVivo, sinalAoVivo, ENVIO_INTERVALO_MS, SEM_SINAL_MS, TIPO_RETRATO } = await loadFrontendModule('../../src/lib/gameplayAoVivo.ts');

const estado = (x = 0) => ({ versao: 1, fase: 'dirigindo', maquina: { x } });

test('sem retrato: aguardando; até 2 s: ao vivo; depois: sem sinal há N s; retrato novo: ao vivo de novo', () => {
  let t = 10_000;
  const ao = criarAoVivo(() => t);
  assert.deepEqual(sinalAoVivo(ao.ler(), t), { nivel: 'aguardando' });
  ao.receber(estado(1));
  assert.deepEqual(sinalAoVivo(ao.ler(), t), { nivel: 'ao-vivo' });
  t += SEM_SINAL_MS;
  assert.deepEqual(sinalAoVivo(ao.ler(), t), { nivel: 'ao-vivo' });
  t += 1;
  assert.equal(sinalAoVivo(ao.ler(), t).nivel, 'sem-sinal');
  t += 5000;
  assert.deepEqual(sinalAoVivo(ao.ler(), t), { nivel: 'sem-sinal', segundos: 7 });
  ao.receber(estado(2));
  assert.deepEqual(sinalAoVivo(ao.ler(), t), { nivel: 'ao-vivo' });
  assert.equal(ao.ler().estado.maquina.x, 2);
});

test('retrato guardado no servidor chega com a idade dele: velho já abre em sem sinal', () => {
  const t = 50_000;
  const ao = criarAoVivo(() => t);
  ao.receber(estado(), 4500);
  assert.deepEqual(sinalAoVivo(ao.ler(), t), { nivel: 'sem-sinal', segundos: 4 });
});

test('totem envia no máximo a cada 250 ms, só o tipo do retrato, e nada sem /ws', () => {
  let t = 0;
  const ao = criarAoVivo(() => t);
  const enviados = [];
  assert.equal(ao.enviar(estado()), false, 'sem /ws ligado não envia');
  ao.ligar((texto) => enviados.push(JSON.parse(texto)));
  for (let i = 0; i < 60; i++) { ao.enviar(estado(i)); t += 1000 / 60; }
  // 1 s a 60 quadros: 4 retratos (0, 250, 500, 750 ms), abaixo dos 5 Hz do servidor.
  assert.equal(enviados.length, Math.ceil(1000 / ENVIO_INTERVALO_MS));
  assert.ok(enviados.every((m) => m.kind === TIPO_RETRATO && Object.keys(m).length === 2));
  ao.ligar(null);
  t += 1000;
  assert.equal(ao.enviar(estado()), false, '/ws fechado não envia');
});

test('assinante é avisado a cada retrato e pode cancelar', () => {
  const ao = criarAoVivo(() => 0);
  let avisos = 0;
  const cancelar = ao.assinar(() => { avisos += 1; });
  ao.receber(estado());
  cancelar();
  ao.receber(estado());
  assert.equal(avisos, 1);
});
