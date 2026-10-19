import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const {
  reduzirModo, modoInicial, avisoDeSaida, barraVisivel, REPOUSO_MS, SIMULACAO_PARADA_MS, BARRA_MS,
} = await loadFrontendModule('../../src/components/stand/modoStand.ts');
const { lerNavegacao } = await loadFrontendModule('../../src/components/stand/navegacaoPad.ts');
const { chamadaSemVoz, vozDoStand } = await loadFrontendModule('../../src/components/stand/avisos.ts');

const VIDEOS = 3;
const passo = (estado, entrada, agora) => reduzirModo(estado, entrada, agora, VIDEOS);

test('L1/R1 giram Coruja → Vitrine → Simulação e voltam', () => {
  let e = modoInicial(0);
  assert.equal(e.modo, 'coruja');
  e = passo(e, { tipo: 'passo', direcao: 1 }, 1);
  assert.equal(e.modo, 'vitrine');
  e = passo(e, { tipo: 'passo', direcao: 1 }, 2);
  assert.equal(e.modo, 'simulacao');
  e = passo(e, { tipo: 'passo', direcao: 1 }, 3);
  assert.equal(e.modo, 'coruja');
  e = passo(e, { tipo: 'passo', direcao: -1 }, 4);
  assert.equal(e.modo, 'simulacao');
  assert.equal(passo(e, { tipo: 'ir', modo: 'coruja' }, 5).modo, 'coruja');
});

test('repouso: Coruja parada 60 s vira Vitrine; conversa em andamento segura a Coruja', () => {
  const e = modoInicial(0);
  assert.equal(passo(e, { tipo: 'relogio' }, REPOUSO_MS - 1).modo, 'coruja');
  assert.equal(passo(e, { tipo: 'relogio', corujaOcupada: true }, REPOUSO_MS * 5).modo, 'coruja');
  const vitrine = passo(e, { tipo: 'relogio' }, REPOUSO_MS);
  assert.equal(vitrine.modo, 'vitrine');
  assert.equal(vitrine.video, 0);
  const tocou = passo(e, { tipo: 'atividade', toque: true }, REPOUSO_MS - 10);
  assert.equal(passo(tocou, { tipo: 'relogio' }, REPOUSO_MS + 10).modo, 'coruja');
});

test('Vitrine em loop: ao fim da volta sem ninguém, volta pra Coruja; com gente, segue girando', () => {
  let e = passo(modoInicial(0), { tipo: 'relogio' }, REPOUSO_MS);
  const inicio = REPOUSO_MS;
  e = passo(e, { tipo: 'video_terminou' }, inicio + 93_000);
  assert.deepEqual([e.modo, e.video], ['vitrine', 1]);
  e = passo(e, { tipo: 'video_terminou' }, inicio + 142_000);
  assert.deepEqual([e.modo, e.video], ['vitrine', 2]);
  const fim = passo(e, { tipo: 'video_terminou' }, inicio + 184_000);
  assert.equal(fim.modo, 'coruja');

  let gente = passo(modoInicial(0), { tipo: 'ir', modo: 'vitrine' }, 0);
  gente = passo(gente, { tipo: 'trocar_video', direcao: -1 }, 1);
  assert.equal(gente.video, 2, 'D-pad ← no primeiro vai pro último');
  gente = passo(gente, { tipo: 'video_terminou' }, 30_000);
  assert.deepEqual([gente.modo, gente.video], ['vitrine', 0], 'volta completa com gente perto continua na Vitrine');
});

test('Simulação nunca entra sozinha e, parada 90 s, volta pra Coruja com 10 s de aviso', () => {
  let e = modoInicial(0);
  for (let t = 0; t < 600_000; t += 500) {
    e = passo(e, { tipo: 'relogio' }, t);
    if (e.modo === 'vitrine') e = passo(e, { tipo: 'video_terminou' }, t);
    assert.notEqual(e.modo, 'simulacao');
  }
  let sim = passo(modoInicial(0), { tipo: 'ir', modo: 'simulacao' }, 1000);
  assert.equal(avisoDeSaida(sim, 1000 + SIMULACAO_PARADA_MS - 10_001), null);
  assert.equal(avisoDeSaida(sim, 1000 + SIMULACAO_PARADA_MS - 10_000), 10);
  assert.equal(avisoDeSaida(sim, 1000 + SIMULACAO_PARADA_MS - 400), 1);
  const mexeu = passo(sim, { tipo: 'atividade' }, 1000 + SIMULACAO_PARADA_MS - 2000);
  assert.equal(avisoDeSaida(mexeu, 1000 + SIMULACAO_PARADA_MS - 1000), null, 'mexer no controle cancela o aviso');
  sim = passo(sim, { tipo: 'relogio' }, 1000 + SIMULACAO_PARADA_MS);
  assert.equal(sim.modo, 'coruja');
});

test('pausa só vale na Vitrine e se desfaz quando a pessoa vai embora', () => {
  let e = passo(modoInicial(0), { tipo: 'ir', modo: 'vitrine' }, 0);
  e = passo(e, { tipo: 'pausar' }, 10);
  assert.equal(e.pausado, true);
  assert.equal(passo(e, { tipo: 'relogio' }, 10 + REPOUSO_MS).pausado, false);
  assert.equal(passo(modoInicial(0), { tipo: 'pausar' }, 0).pausado, false);
});

test('barra de modos some 5 s depois do último toque; controle não acende a barra', () => {
  const e = modoInicial(0);
  assert.equal(barraVisivel(e, 0), false, 'abre sem barra');
  const tocado = passo(e, { tipo: 'atividade', toque: true }, 1000);
  assert.equal(barraVisivel(tocado, 1000 + BARRA_MS - 1), true);
  assert.equal(barraVisivel(tocado, 1000 + BARRA_MS), false);
  assert.equal(barraVisivel(passo(e, { tipo: 'atividade' }, 9000), 9001), false);
  assert.equal(barraVisivel(passo(e, { tipo: 'atividade', toque: true }, 9000), 9001), true);
});

function pad(botoes = [], eixos = [0, 0, 0, 0], mapping = 'standard') {
  return { mapping, axes: eixos, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: botoes.includes(i), value: botoes.includes(i) ? 1 : 0 })) };
}

test('controle: L1/R1/PS navegam em qualquer modo, por borda', () => {
  const r1 = lerNavegacao(pad([5]), { pressed: [] }, 'simulacao');
  assert.deepEqual(r1.acoes, [{ tipo: 'passo', direcao: 1 }]);
  assert.deepEqual(lerNavegacao(pad([5]), r1.next, 'simulacao').acoes, [], 'segurar não repete');
  assert.deepEqual(lerNavegacao(pad([4]), { pressed: [] }, 'coruja').acoes, [{ tipo: 'passo', direcao: -1 }]);
  assert.deepEqual(lerNavegacao(pad([16]), { pressed: [] }, 'vitrine').acoes, [{ tipo: 'ir', modo: 'coruja' }]);
});

test('controle: ✕ e D-pad mudam de sentido conforme o modo; na Simulação ficam com o simulador', () => {
  assert.deepEqual(lerNavegacao(pad([0]), { pressed: [] }, 'vitrine').acoes, [{ tipo: 'pausar' }]);
  assert.deepEqual(lerNavegacao(pad([15]), { pressed: [] }, 'vitrine').acoes, [{ tipo: 'trocar_video', direcao: 1 }]);
  assert.deepEqual(lerNavegacao(pad([0]), { pressed: [] }, 'coruja').acoes, [{ tipo: 'conversar' }]);
  const sim = lerNavegacao(pad([0, 1, 2, 3, 9, 14]), { pressed: [] }, 'simulacao');
  assert.deepEqual(sim.acoes, []);
  assert.equal(sim.ativo, true, 'botão do simulador ainda conta como gente por perto');
});

test('controle: analógico conta como atividade; parado ou sem mapping standard, não', () => {
  assert.equal(lerNavegacao(pad([], [0, 0.6, 0, 0]), { pressed: [] }, 'simulacao').ativo, true);
  assert.equal(lerNavegacao(pad([], [0.05, 0, 0, 0]), { pressed: [] }, 'simulacao').ativo, false);
  const generico = lerNavegacao(pad([5], [1, 0, 0, 0], ''), { pressed: [] }, 'coruja');
  assert.deepEqual([generico.acoes, generico.ativo], [[], false]);
});

test('voz do stand segue /api/stand/status e a última sessão', () => {
  assert.equal(vozDoStand(null, null), 'carregando');
  assert.equal(vozDoStand({ ligado: true }, null), 'ligada');
  assert.equal(vozDoStand({ ligado: false, motivo: 'sem_credencial' }, null), 'desligada');
  assert.equal(vozDoStand({ ligado: false, motivo: 'teto_diario' }, null), 'desligada');
  assert.equal(vozDoStand({ ligado: true }, { motivo: 'desligado', detalhe: 'teto_diario' }), 'desligada');
  assert.equal(vozDoStand({ ligado: true }, { motivo: 'erro' }), 'ligada');
});

test('textos sem voz não prometem microfone e mudam com o controle conectado', () => {
  assert.deepEqual(chamadaSemVoz(true), { titulo: 'Pega o controle e aperta R1', sub: 'ou toca aqui' });
  assert.deepEqual(chamadaSemVoz(false), { titulo: 'Toca aqui pra ver o LUCA\u2011AI em ação', sub: '' });
  for (const texto of Object.values({ ...chamadaSemVoz(true), ...chamadaSemVoz(false) })) {
    assert.doesNotMatch(texto, /microfone|pergunt|fala/i);
  }
});
