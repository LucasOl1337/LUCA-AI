import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';
const mod = await loadFrontendModule('../../src/components/gameplay/circuito.ts');
const { criarCircuito, INICIO_CIRCUITO, ROTA_CIRCUITO, metricasCircuito } = mod;
const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { relevoRampaLateral } = await loadFrontendModule('../../src/components/gameplay/rampaLateral.ts');
const { reduzirModo, modoInicial, avisoDeSaida } = await loadFrontendModule('../../src/components/stand/modoStand.ts');
const iso = '2026-10-22T22:00:00.000Z';
function piloto(motor, alvo, lento = true) {
  const e = motor.ler(), h = e.maquina.rumoGraus * Math.PI / 180;
  const desejado = -Math.atan2(alvo.z - e.maquina.z, alvo.x - e.maquina.x);
  const erro = Math.atan2(Math.sin(desejado - h), Math.cos(desejado - h));
  // Este é só o piloto do teste: usa comandos de direção, não altera pose/mundo/fim.
  return { esterco: Math.max(-1, Math.min(1, -erro * 2.4)), acelerador: lento ? .5 : 1, freio: 0 };
}
test('circuito é jogável numa run contínua sem teleportar, motor real e relevo real', () => {
  const m = criarMotorGameplay(); m.reiniciar(INICIO_CIRCUITO);
  const c = criarCircuito('teste-real-continuo', iso);
  let last = m.ler().maquina;
  for (let i = 0; i < 30000 && !c.registro.resultado; i++) {
    const alvo = ROTA_CIRCUITO[Math.min(c.registro.proximoMarco, ROTA_CIRCUITO.length - 1)];
    const e = m.quadro(1 / 60, piloto(m, alvo), relevoRampaLateral);
    assert.ok(Math.hypot(e.maquina.x - last.x, e.maquina.z - last.z) < .2, 'sem salto'); last = e.maquina;
    c.quadro(e, 1000 / 60, iso);
  }
  assert.equal(c.registro.resultado?.motivo, 'chegada', JSON.stringify({ estado: m.ler(), registro: c.registro }));
  assert.equal(c.registro.runId, 'teste-real-continuo'); assert.equal(c.registro.progresso, 1);
  assert.ok(c.registro.elapsedMs > 10000);
});
test('ignorar feno produz colisão legítima com comandos, não posição injetada', () => {
  const m = criarMotorGameplay(); m.reiniciar(INICIO_CIRCUITO); const c = criarCircuito('falha', iso);
  for (let i = 0; i < 1800 && !c.registro.resultado; i++) c.quadro(m.quadro(1 / 60, { acelerador: 1, freio: 0, esterco: 0 }, relevoRampaLateral), 1000 / 60, iso);
  assert.equal(c.registro.resultado?.motivo, 'colisao');
  assert.ok(c.registro.episodios.some((e) => e.sensor === 'feno'));
  assert.equal(metricasCircuito(c.registro).sinistrosEvitados, 0);
  assert.equal(metricasCircuito(c.registro).reacaoMediaMs, null);
});
test('não há idle/90s/240s durante observação do circuito', () => {
  const e = reduzirModo(modoInicial(0), { tipo: 'ir', modo: 'simulacao' }, 1, 2);
  assert.equal(reduzirModo(e, { tipo: 'relogio' }, 900000, 2).modo, 'simulacao');
  assert.equal(avisoDeSaida(e, 85000), null);
});
test('água e tombamento usam posição/atitude do motor e limiares declarados', () => {
  const m = criarMotorGameplay(); m.reiniciar(INICIO_CIRCUITO); const c = criarCircuito('agua', iso);
  // Contorna a placa em (0,5), agora física, antes de entrar na água.
  const alvos = [{ x: -4, z: 10 }, { x: 15, z: 15 }, { x: 30, z: 15 }]; let alvo = 0;
  for (let i = 0; i < 4000 && !c.registro.resultado; i++) {
    const p = m.ler().maquina;
    if (alvo < alvos.length - 1 && Math.hypot(p.x - alvos[alvo].x, p.z - alvos[alvo].z) < 3) alvo++;
    c.quadro(m.quadro(1 / 60, piloto(m, alvos[alvo]), relevoRampaLateral), 1000 / 60, iso);
  }
  assert.equal(c.registro.resultado?.motivo, 'atolamento');
  assert.ok(c.registro.episodios.some((e) => e.sensor === 'agua'));
  const tombo = criarCircuito('tombo', iso), t = criarMotorGameplay(); t.reiniciar(INICIO_CIRCUITO);
  // Chão plano inclinado real no motor: caso unitário da regra, não prova física de hardware.
  for (let i = 0; i < 600 && !tombo.registro.resultado; i++) tombo.quadro(t.quadro(1 / 60, { acelerador: 1, freio: 0, esterco: 0 }, (_x, z) => z * .7), 1000 / 60, iso);
  assert.equal(tombo.registro.resultado?.motivo, 'tombamento');
});
test('frear após aviso produz uma reação/episódio; antecipação não vira zero nem contagem por frame', () => {
  const m = criarMotorGameplay(); m.reiniciar(INICIO_CIRCUITO); const c = criarCircuito('resposta', iso);
  let frear = false;
  for (let i = 0; i < 900 && !c.registro.resultado; i++) {
    const e = m.quadro(1 / 60, { acelerador: frear ? 0 : 1, freio: frear ? 1 : 0, esterco: 0 }, relevoRampaLateral);
    c.quadro(e, 1000 / 60, iso); frear ||= e.sensor.eco;
  }
  assert.equal(c.registro.resultado, null);
  assert.equal(c.registro.episodios.length, 1);
  assert.ok(c.registro.episodios[0].resposta.latenciaMs > 0);
  assert.equal(metricasCircuito(c.registro).sinistrosEvitados, 1);
  const inicial = criarCircuito('antecipacao', iso);
  const e = m.ler();
  inicial.quadro({ ...e, fase: 'dirigindo', sensor: { eco:true, alerta:true, distanciaCm:100 } }, 16, iso);
  inicial.quadro({ ...e, fase: 'dirigindo', sensor: { eco:true, alerta:true, distanciaCm:100 } }, 16, iso);
  assert.equal(metricasCircuito(inicial.registro).reacaoMediaMs, null);
});
export { piloto };
test('relógio da corrida fica em 0 enquanto pronto e só anda dirigindo (caso do stand: 49 s parado)', () => {
  const m = criarMotorGameplay(); m.reiniciar(INICIO_CIRCUITO); const c = criarCircuito('relogio', iso);
  // 49 s com a cena montada e ninguém no R2: mesmo passo do kiosk (monotônico por quadro).
  for (let i = 0; i < 49 * 60; i++) c.quadro(m.quadro(1 / 60, { acelerador: 0, freio: 0, esterco: 0 }, relevoRampaLateral), 1000 / 60, iso);
  assert.equal(m.ler().fase, 'pronto');
  assert.equal(c.registro.elapsedMs, 0);
  for (let i = 0; i < 60; i++) c.quadro(m.quadro(1 / 60, { acelerador: 1, freio: 0, esterco: 0 }, relevoRampaLateral), 1000 / 60, iso);
  assert.equal(m.ler().fase, 'dirigindo');
  assert.ok(c.registro.elapsedMs > 900 && c.registro.elapsedMs <= 1000, String(c.registro.elapsedMs));
});
test('resultado da corrida em PT-BR por motivo, sem UUID, run ou N/A', () => {
  const { textoResultadoCircuito } = mod;
  const m = criarMotorGameplay(); m.reiniciar(INICIO_CIRCUITO); const c = criarCircuito('uuid-que-nao-aparece', iso);
  for (let i = 0; i < 1800 && !c.registro.resultado; i++) c.quadro(m.quadro(1 / 60, { acelerador: 1, freio: 0, esterco: 0 }, relevoRampaLateral), 1000 / 60, iso);
  const t = textoResultadoCircuito(c.registro);
  assert.equal(t.titulo, 'Colisão com obstáculo');
  const avisos = c.registro.episodios.length, sem = metricasCircuito(c.registro).semResposta;
  assert.match(t.resumo, new RegExp(`^Tempo: \\d+,\\d s · Avisos respondidos: ${avisos - sem} de ${avisos} · Reação média: sem reação medida$`));
  assert.doesNotMatch(`${t.titulo} ${t.resumo}`, /uuid|run|N\/A|\d\.\d/);
  const titulos = Object.fromEntries(['chegada', 'atolamento', 'tombamento', 'abandono'].map((motivo) => [motivo, textoResultadoCircuito({ ...c.registro, resultado: { motivo, tempoMs: 0 } }).titulo]));
  assert.deepEqual(titulos, { chegada: 'Percurso concluído', atolamento: 'Atolou na área alagada', tombamento: 'Tombou na encosta', abandono: 'Corrida abandonada' });
  const comReacao = { ...c.registro, episodios: [{ ...c.registro.episodios[0], resposta: { tempoMs: 0, latenciaMs: 770, acao: 'frenagem' } }] };
  assert.match(textoResultadoCircuito(comReacao).resumo, /Avisos respondidos: 1 de 1 · Reação média: 0,77 s$/);
});
