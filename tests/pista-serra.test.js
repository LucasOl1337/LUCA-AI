import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';
import { contextoCircuito } from '../shared/circuito-context.js';
import { parseLabCase } from '../shared/lab-telemetry.js';
import { resumoDaCorrida } from '../server/bancada-fila.js';

const { criarCorridaPista } = await loadFrontendModule('../../src/components/pista/corridaPista.ts');
const { criarSessaoPista } = await loadFrontendModule('../../src/components/pista/sessaoPista.ts');
const pista = await loadFrontendModule('../../src/components/pista/pistaSerra.ts');
const { criarCaminhao, passoCaminhao } = await loadFrontendModule('../../src/components/pista/fisicaCaminhao.ts');
const { envioDoCircuito } = await loadFrontendModule('../../src/components/gameplay/EnviarBancada.tsx');
const { PISTA_SERRA, pontoLateral, SERRA } = pista;
const kph = (r) => r.caminhao.velocidade * 3.6;
const iso = '2026-10-24T11:00:00.000Z';

/** Piloto do teste: só comandos (esterço, pedais, freio-motor) mirando um ponto da pista à frente. */
function correr({ lateral = () => 1.8, acel = () => 1, freio = () => 0, freioMotor = () => false } = {}) {
  const corrida = criarCorridaPista(), sessao = criarSessaoPista('teste-serra', iso);
  let r = corrida.ler(), ultimo = r.caminhao;
  for (let i = 0; i < 60 * 300 && r.fase !== 'fim'; i += 1) {
    const c = r.caminhao, alvo = pontoLateral(PISTA_SERRA, c.s + 6 + c.velocidade * 0.6, lateral(c.s, r));
    let erro = Math.atan2(-(alvo.z - c.z), alvo.x - c.x) - c.rumo;
    erro = Math.atan2(Math.sin(erro), Math.cos(erro));
    r = corrida.quadro(1 / 60, { esterco: Math.max(-1, Math.min(1, -erro * 4)), acelerador: acel(c.s, r), freio: freio(c.s, r) }, freioMotor(c.s, r));
    assert.ok(Math.hypot(r.caminhao.x - ultimo.x, r.caminhao.z - ultimo.z) < 1, 'sem teleporte'); ultimo = r.caminhao;
    sessao.quadro(r, iso); sessao.registrar(r);
  }
  return { r, sessao };
}
const cauteloso = { acel: (s, r) => (!r.riscos.has('animal') && kph(r) < 55 && !r.falhaFreio ? 1 : 0), freio: (s, r) => (r.riscos.has('animal') ? 1 : 0) };
const rumoAoEscape = (s) => (s < 800 || s > 990 ? 1.8 : 1.8 + Math.min(1, (s - 800) / 60) * 8.5);

test('pista desce ~70 m com curvas para os dois lados e área de escape na descida forte', () => {
  const a = PISTA_SERRA.amostras;
  assert.ok(a[0].y - a.at(-1).y > 60);
  assert.ok(a.some((p) => p.curvatura > 0) && a.some((p) => p.curvatura < 0));
  assert.ok(SERRA.escape.s0 > SERRA.descida.s0 && SERRA.escape.s1 < SERRA.descida.s1);
  assert.ok(SERRA.animalS < SERRA.falhaFreioS, 'animal antes da falha');
});

test('freio falha na descida: pedal sem efeito, freio-motor ainda segura', () => {
  let c = criarCaminhao(PISTA_SERRA, 700); c = { ...c, velocidade: 20 };
  const passo = (e, freio, fm, ef) => passoCaminhao(e, { esterco: 0, acelerador: 0, freio }, fm, ef, 1 / 60, PISTA_SERRA);
  let comPedal = c, semPedal = c, motor = c;
  for (let i = 0; i < 120; i += 1) { comPedal = passo(comPedal, 1, false, 0); semPedal = passo(semPedal, 0, false, 0); motor = passo(motor, 0, true, 0); }
  assert.equal(comPedal.velocidade.toFixed(6), semPedal.velocidade.toFixed(6), 'pedal sem resposta');
  assert.ok(motor.velocidade < semPedal.velocidade - 1, 'freio-motor reduz');
  let bom = c; for (let i = 0; i < 120; i += 1) bom = passo(bom, 1, false, 1);
  assert.ok(bom.velocidade < 10, 'freio bom para');
});

test('sem freio-motor e sem escape o caminhão não chega ao pé da serra', () => {
  const { r, sessao } = correr(cauteloso);
  assert.notEqual(r.fim, 'chegada');
  assert.ok(['tombamento', 'saida_pista'].includes(r.fim), r.fim);
  assert.ok(sessao.registro.episodios.some((e) => e.sensor === 'freio'));
});

test('freio-motor segurado leva até a chegada; animal desviado por frenagem conta como reação', () => {
  const { r, sessao } = correr({ ...cauteloso, freioMotor: (s, r) => r.falhaFreio });
  assert.equal(r.fim, 'chegada');
  const animal = sessao.registro.episodios.find((e) => e.sensor === 'animal');
  assert.ok(animal?.resposta && animal.evitado, JSON.stringify(animal));
  assert.equal(sessao.registro.progresso, 1);
});

test('área de escape é um fim seguro, com ou sem freio-motor', () => {
  for (const fm of [true, false]) {
    const { r } = correr({ ...cauteloso, lateral: rumoAoEscape, freioMotor: (s, r) => fm && r.falhaFreio });
    assert.equal(r.fim, 'area_escape');
  }
});

test('acelerar sem frear no animal termina em colisão', () => {
  const { r } = correr({ acel: (s, r) => (kph(r) < 60 ? 1 : 0) });
  assert.equal(r.fim, 'colisao');
  assert.ok(r.caminhao.s > SERRA.animalS - 20 && r.caminhao.s < SERRA.animalS + 10);
});

test('relatório no formato do circuito: servidor aceita, Laboratório lê o CSV, Fila separa o veículo', () => {
  const { sessao } = correr({ ...cauteloso, freioMotor: (s, r) => r.falhaFreio });
  const rel = sessao.relatorio();
  assert.equal(rel.registro.versao, 1); assert.equal(rel.registro.veiculo, 'caminhao'); assert.equal(rel.registro.cenario, 'serra-sem-freio');
  const ctx = contextoCircuito(rel.caso.metadata.circuito);
  assert.ok(ctx, 'whitelist do servidor aceita'); assert.equal(ctx.veiculo, 'caminhao'); assert.equal(ctx.resultado.motivo, 'chegada');
  const caso = parseLabCase(rel.caso.rawCsv, { fileName: rel.caso.sourceName, manifest: rel.caso.metadata, map: rel.caso.map });
  assert.ok(caso.samples.length > 100);
  assert.equal(caso.samples[0].machine_id, 'caminhao-simulador');
  assert.ok(caso.samples.some((s) => s.engine_rpm > 1000));
  const envio = envioDoCircuito(rel, { veiculo: 'caminhao', cenario: 'serra-sem-freio' });
  const resumo = resumoDaCorrida(envio.caso, envio.corrida);
  assert.equal(resumo.veiculo, 'caminhao'); assert.equal(resumo.cenario, 'serra-sem-freio'); assert.equal(resumo.desfecho, 'chegada');
});

test('trator antigo segue aceito com veículo trator', () => {
  assert.equal(contextoCircuito({ versao: 1, origem: 'SIMULAÇÃO', runId: 'x', elapsedMs: 10, episodios: [], resultado: { motivo: 'chegada' } }).veiculo, 'trator');
});
