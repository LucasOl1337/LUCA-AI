import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarAoVivo, sinalAoVivo, ENVIO_INTERVALO_MS, SEM_SINAL_MS, PAUSADO_MAX_MS, TIPO_RETRATO } = await loadFrontendModule('../../src/lib/gameplayAoVivo.ts');

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

// Ensaio da feira (item 7, C3): aba do totem oculta deixava o tablet em "ao vivo" com o retrato congelado.
test('aba oculta: totem avisa já (ou no fim do intervalo) e o tablet mostra pausado, não sem sinal', () => {
  let t = 1000;
  const agendados = [];
  const ao = criarAoVivo(() => t, (fn, ms) => agendados.push({ fn, ms }));
  const enviados = [];
  ao.ligar((texto) => enviados.push(JSON.parse(texto)));
  ao.enviar(estado(1));
  assert.equal('oculto' in enviados[0], false);
  t += 100;
  ao.marcarOculto(true);
  assert.equal(enviados.length, 1, 'dentro do intervalo: agenda, não fura os 5 Hz');
  assert.equal(agendados[0].ms, ENVIO_INTERVALO_MS - 100);
  t += agendados[0].ms; agendados[0].fn();
  assert.deepEqual(enviados.at(-1), { kind: TIPO_RETRATO, estado: estado(1), oculto: true });
  t += 1000;
  ao.marcarOculto(false);
  assert.equal(enviados.length, 3, 'fora do intervalo: avisa na hora');
  assert.equal('oculto' in enviados.at(-1), false);
  ao.esquecer();
  t += 1000;
  ao.marcarOculto(true);
  assert.equal(enviados.length, 3, 'gameplay desmontado: não reenvia retrato velho');
});

test('tablet: pausado mostra há quanto tempo; depois de PAUSADO_MAX_MS volta a sem sinal', () => {
  const t = 100_000;
  const ao = criarAoVivo(() => t);
  ao.receber(estado(), 30_000, true);
  assert.deepEqual(sinalAoVivo(ao.ler(), t), { nivel: 'pausado', segundos: 30 });
  assert.equal(sinalAoVivo(ao.ler(), t + PAUSADO_MAX_MS).nivel, 'sem-sinal');
  ao.receber(estado());
  assert.deepEqual(sinalAoVivo(ao.ler(), t), { nivel: 'ao-vivo' });
});
