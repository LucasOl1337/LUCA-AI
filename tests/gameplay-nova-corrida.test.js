import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { INICIO_CIRCUITO } = await loadFrontendModule('../../src/components/gameplay/circuito.ts');
const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { relevoRampaLateral } = await loadFrontendModule('../../src/components/gameplay/rampaLateral.ts');
const { criarSessaoCircuito, largarCircuito, contextoDoCircuito } = await loadFrontendModule('../../src/components/gameplay/sessaoCircuito.ts');

// Mesma ordem do laço do GameplayKiosk: física → sessão → amostra → fim.
function correr(motor, sessao, comando, quadros = 3600) {
  for (let i = 0; i < quadros && !sessao.registro.resultado; i++) {
    const e = motor.quadro(1 / 60, comando, relevoRampaLateral);
    sessao.quadro(e, 1000 / 60, '2026-10-24T07:00:00.000Z', false);
    sessao.registrar(e);
    if (sessao.registro.resultado) motor.encerrar(sessao.registro.resultado.motivo);
  }
  return sessao.registro;
}
const RETO = { acelerador: 1, freio: 0, esterco: 0 };
const CURVA = { acelerador: 1, freio: 0, esterco: 0.6 };

test('Nova corrida no motor que segue vivo larga igual a um motor novo, sem nada da anterior', () => {
  const vivo = criarMotorGameplay();
  largarCircuito(vivo, criarSessaoCircuito('r1'));
  // Corrida 1 suja tudo: anda, esterça, toma aviso, inclina e bate.
  const s1 = criarSessaoCircuito('r1'); largarCircuito(vivo, s1);
  correr(vivo, s1, CURVA, 60); correr(vivo, s1, RETO);
  assert.ok(s1.registro.resultado, 'corrida 1 termina');
  assert.ok(s1.registro.episodios.length > 0, 'corrida 1 teve avisos');
  assert.equal(vivo.ler().fase, 'fim');

  const s2 = criarSessaoCircuito('r2'); largarCircuito(vivo, s2);
  const novo = criarMotorGameplay(); largarCircuito(novo, criarSessaoCircuito('ref'));
  const e = vivo.ler();
  assert.deepEqual(e, novo.ler(), 'retrato da largada igual ao de um motor recém-criado');
  assert.equal(e.fase, 'pronto'); assert.equal(e.tempoMs, 0);
  assert.equal(e.maquina.x, INICIO_CIRCUITO.x); assert.equal(e.maquina.z, INICIO_CIRCUITO.z);
  assert.equal(e.maquina.rumoGraus, INICIO_CIRCUITO.rumoGraus); assert.equal(e.maquina.velocidadeKph, 0);
  assert.equal(e.contato, false); assert.equal(e.sensor.alerta, false);
  assert.deepEqual(e.comandos, { esterco: 0, acelerador: 0, freio: 0 });
  assert.deepEqual(e.atitude, { rolagemGraus: 0, arfagemGraus: 0 });
  assert.deepEqual(vivo.trator(), novo.trator(), 'rumo, guinada, percurso e velocidade internos zerados');
  assert.deepEqual(vivo.comando(), novo.comando());
  assert.equal(vivo.obstaculos(), vivo.obstaculos());

  // Relógio, avisos e sensores da sessão nova.
  assert.equal(s2.registro.elapsedMs, 0); assert.equal(s2.registro.resultado, null);
  assert.deepEqual(s2.registro.episodios, []); assert.deepEqual(s2.registro.pausas, []);
  assert.equal(s2.registro.proximoMarco, 1); assert.equal(s2.registro.progresso, 0);
  assert.equal(s2.registro.runId, 'r2');

  // Coruja: contexto só da corrida nova (parada, sem fim nem obstáculo da batida anterior).
  const ctx = contextoDoCircuito(vivo, s2, false);
  assert.deepEqual(ctx, contextoDoCircuito(novo, criarSessaoCircuito('ref2'), false));
  assert.equal(ctx.fase, 'dirigindo'); assert.equal(ctx.velocidadeKph, 0);
  assert.equal(contextoDoCircuito(vivo, s1, false).fase, 'fim', 'a sessão velha continua sendo a que terminou');

  // Relatório da corrida 2 nasce com uma amostra só, na largada.
  const rel = s2.relatorio();
  assert.equal(rel.registro.runId, 'r2');
  assert.equal(rel.caso.rawCsv.trim().split('\n').length, 2, rel.caso.rawCsv);
});

test('a corrida seguinte no motor vivo dá o mesmo resultado que a primeira com os mesmos comandos', () => {
  const vivo = criarMotorGameplay();
  const resultados = [];
  for (let n = 0; n < 4; n++) {
    const s = criarSessaoCircuito(`r${n}`); largarCircuito(vivo, s);
    correr(vivo, s, CURVA, 60); const r = correr(vivo, s, RETO);
    resultados.push(JSON.stringify({ resultado: r.resultado, episodios: r.episodios, marco: r.proximoMarco, fim: vivo.ler() }));
  }
  const novo = criarMotorGameplay(); const s = criarSessaoCircuito('ref'); largarCircuito(novo, s);
  correr(novo, s, CURVA, 60); const r = correr(novo, s, RETO);
  const referencia = JSON.stringify({ resultado: r.resultado, episodios: r.episodios, marco: r.proximoMarco, fim: novo.ler() });
  for (const atual of resultados) assert.equal(atual, referencia);
});

test('palco vivo: a troca de sessão zera os amortecedores de câmera (externa e cabeça da cabine)', async () => {
  const fs = await import('node:fs');
  const fonte = fs.readFileSync(new URL('../src/components/gameplay/GameplayKiosk.tsx', import.meta.url), 'utf8');
  const linha = fonte.split('\n').find((l) => l.includes('sessaoDoFim !== sessao'));
  assert.ok(linha, 'laço do palco detecta corrida nova');
  assert.match(linha, /externa\.reiniciar\(\)/); assert.match(linha, /cabeca\.reiniciar\(\)/);
  const { criarCabecaCabine } = await loadFrontendModule('../../src/components/gameplay/vistaTrator.ts');
  const cabeca = criarCabecaCabine();
  for (let i = 0; i < 30; i++) cabeca.passo(0.8, 3, 1 / 30);
  cabeca.reiniciar();
  assert.deepEqual(cabeca.passo(0, 0, 0), { rolagemGraus: 0, olharGraus: 0 });
});
