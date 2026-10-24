import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';
import { contextoCircuito } from '../shared/circuito-context.js';
import { parseLabCase } from '../shared/lab-telemetry.js';
import { resumoDaCorrida } from '../server/bancada-fila.js';

const { criarCorridaPista } = await loadFrontendModule('../../src/components/pista/corridaPista.ts');
const { criarSessaoPista } = await loadFrontendModule('../../src/components/pista/sessaoPista.ts');
const pista = await loadFrontendModule('../../src/components/pista/pistaSerra.ts');
const fisica = await loadFrontendModule('../../src/components/pista/fisicaCaminhao.ts');
const { criarCaminhao, passoCaminhao } = fisica;
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

test('trator antigo segue aceito sem veículo declarado (a Fila assume trator)', () => {
  const ctx = contextoCircuito({ versao: 1, origem: 'SIMULAÇÃO', runId: 'x', elapsedMs: 10, episodios: [], resultado: { motivo: 'chegada' } });
  assert.ok(ctx); assert.equal(ctx.veiculo, undefined); assert.equal(ctx.cenario, undefined);
});

test('aderência: esterço total derrapa em vez de passar da lateral que o pneu segura (95 km/h no asfalto, 40 km/h no cascalho)', () => {
  const { CAMINHAO } = fisica;
  const roda = (kph, s, cascalho) => {
    let c = { ...criarCaminhao(PISTA_SERRA, cascalho ? SERRA.escape.s0 + 40 : 200, cascalho ? 9 : 1.8), velocidade: kph / 3.6 };
    let maxG = 0, derrapou = false;
    for (let i = 0; i < 90; i += 1) {
      c = passoCaminhao(c, { esterco: 1, acelerador: 0, freio: 0 }, false, 1, 1 / 60, PISTA_SERRA);
      maxG = Math.max(maxG, c.aLatG); derrapou ||= c.derrapando;
    }
    return { c, maxG, derrapou };
  };
  const asfalto = roda(95, 1.5, false);
  assert.ok(asfalto.derrapou, 'derrapa no asfalto a 95 km/h');
  assert.ok(asfalto.maxG <= CAMINHAO.aderenciaG + 0.01, `lateral ${asfalto.maxG} g presa à aderência`);
  const cascalho = roda(40, 1.5, true);
  assert.ok(cascalho.c.noCascalho, 'está no cascalho');
  assert.ok(cascalho.derrapou && cascalho.maxG <= CAMINHAO.aderenciaCascalhoG + 0.01, `cascalho escorrega (${cascalho.maxG} g)`);
  assert.equal(cascalho.c.tomboS, 0, 'no cascalho não tomba');
});

test('tombo não vem do nada: esterço total a 45 km/h na reta só inclina; a 60 km/h sustentado tomba', () => {
  const { CAMINHAO } = fisica;
  const roda = (kph, s) => {
    let c = { ...criarCaminhao(PISTA_SERRA, 150), velocidade: kph / 3.6 };
    let maxRol = 0;
    for (let i = 0; i < s * 60; i += 1) { c = passoCaminhao(c, { esterco: -1, acelerador: 0, freio: 0 }, false, 1, 1 / 60, PISTA_SERRA); maxRol = Math.max(maxRol, Math.abs(c.rolagem)); }
    return { c, maxRol };
  };
  const lento = roda(45, 2);
  assert.ok(lento.c.tomboS < CAMINHAO.tomboS, `45 km/h não tomba (tomboS ${lento.c.tomboS})`);
  assert.ok(lento.maxRol > 0.08 && lento.maxRol < 0.25, `inclina visivelmente (${lento.maxRol} rad)`);
  assert.ok(lento.c.rolagem > 0, 'esterço −1 = curva à esquerda: corpo rola para a direita (lado de fora)');
  const rapido = roda(60, 2);
  assert.ok(rapido.c.tomboS >= CAMINHAO.tomboS, `60 km/h sustentado tomba (tomboS ${rapido.c.tomboS})`);
});

test('rolagem da suspensão: cresce para o lado de fora da curva e volta a zero na reta', () => {
  let c = { ...criarCaminhao(PISTA_SERRA, 150), velocidade: 40 / 3.6 };
  for (let i = 0; i < 60; i += 1) c = passoCaminhao(c, { esterco: 1, acelerador: 0, freio: 0 }, false, 1, 1 / 60, PISTA_SERRA);
  // esterço +1 = curva à direita (guinada < 0, rumo cai) → corpo joga para a esquerda (rolagem < 0).
  assert.ok(c.guinada < 0 && c.rolagem < -0.05, `guinada ${c.guinada} rolagem ${c.rolagem}`);
  for (let i = 0; i < 120; i += 1) c = passoCaminhao(c, { esterco: 0, acelerador: 0, freio: 0 }, false, 1, 1 / 60, PISTA_SERRA);
  assert.ok(Math.abs(c.rolagem) < 0.01, `volta a zero (${c.rolagem})`);
});

test('queda: tombamento gira em volta da roda de fora, desliza até parar e assenta; outros fins só param', async () => {
  const { poseDaQueda, anguloDoTombo, QUEDA } = await loadFrontendModule('../../src/components/pista/quedaCaminhao.ts');
  const { CAMINHAO } = fisica;
  const h = 1.97, w = CAMINHAO.meiaLarguraM;
  const impacto = { motivo: 'tombamento', velocidadeMs: 15, rolagemRad: 0.15, lado: 1 };
  let anterior = -1;
  for (let t = 0; t <= QUEDA.duracaoS + 1e-9; t += 0.05) { const a = anguloDoTombo(t, 0.15); assert.ok(a >= anterior, `monotônico em ${t}`); anterior = a; }
  const inicio = poseDaQueda(impacto, 0, h);
  assert.equal(inicio.rolagemRad, 0.15, 'parte da rolagem que a suspensão já tinha');
  assert.ok(Math.abs(inicio.alturaM - (w * Math.sin(0.15) + h * Math.cos(0.15))) < 1e-9);
  const deitado = poseDaQueda(impacto, 6, h);
  assert.ok(Math.abs(deitado.rolagemRad - QUEDA.anguloFinalRad) < 0.01, `deitado a ${deitado.rolagemRad}`);
  assert.ok(deitado.alturaM > w * 0.95 && deitado.alturaM < h, 'pivô perto de meia largura do chão');
  assert.ok(deitado.lateralM > w, 'deslocou para o lado de fora');
  assert.equal(deitado.velocidadeMs, 0); assert.ok(deitado.parado);
  assert.ok(Math.abs(deitado.avancoM - 15 * 15 / (2 * QUEDA.desaceleracao.tombamento)) < 1e-6, 'deslizou v²/2a');
  const esquerda = poseDaQueda({ ...impacto, lado: -1 }, 6, h);
  assert.ok(esquerda.rolagemRad < 0 && esquerda.lateralM < 0);
  const batida = poseDaQueda({ motivo: 'colisao', velocidadeMs: 10, rolagemRad: 0.1, lado: 1 }, 3, h);
  assert.equal(batida.alturaM, h); assert.equal(batida.lateralM, 0);
  assert.ok(Math.abs(batida.rolagemRad) < 0.001 && batida.velocidadeMs === 0 && batida.parado);
  const chegada = poseDaQueda({ motivo: 'chegada', velocidadeMs: 22, rolagemRad: 0, lado: 1 }, 30, h);
  assert.ok(chegada.avancoM <= QUEDA.deslizeMaxM);
});
