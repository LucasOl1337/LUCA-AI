import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const {
  reduzirModo, modoInicial, avisoDeSaida, barraVisivel, REPOUSO_MS, SIMULACAO_PARADA_MS, BARRA_MS,
} = await loadFrontendModule('../../src/components/stand/modoStand.ts');
const { lerNavegacao } = await loadFrontendModule('../../src/components/stand/navegacaoPad.ts');
const { avisoDeControle, chamadaSemVoz, motivoSemVoz, PAUSA_APOS_FALHA_MS, vozDoStand } = await loadFrontendModule('../../src/components/stand/avisos.ts');

const VIDEOS = 3;
const passo = (estado, entrada, agora) => reduzirModo(estado, entrada, agora, VIDEOS);

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

test('Simulação nunca entra sozinha e não expulsa a run por inatividade', () => {
  let e = modoInicial(0);
  for (let t = 0; t < 600_000; t += 500) {
    e = passo(e, { tipo: 'relogio' }, t);
    if (e.modo === 'vitrine') e = passo(e, { tipo: 'video_terminou' }, t);
    assert.notEqual(e.modo, 'simulacao');
  }
  let sim = passo(modoInicial(0), { tipo: 'ir', modo: 'simulacao' }, 1000);
  assert.equal(avisoDeSaida(sim, 1000 + SIMULACAO_PARADA_MS - 10_001), null);
  assert.equal(avisoDeSaida(sim, 1000 + SIMULACAO_PARADA_MS - 10_000), null);
  assert.equal(avisoDeSaida(sim, 1000 + SIMULACAO_PARADA_MS - 400), null);
  const mexeu = passo(sim, { tipo: 'atividade' }, 1000 + SIMULACAO_PARADA_MS - 2000);
  assert.equal(avisoDeSaida(mexeu, 1000 + SIMULACAO_PARADA_MS - 1000), null, 'mexer no controle cancela o aviso');
  sim = passo(sim, { tipo: 'relogio' }, 1000 + SIMULACAO_PARADA_MS);
  assert.equal(sim.modo, 'simulacao');
  assert.equal(passo(sim, { tipo: 'relogio' }, 900_000).modo, 'simulacao');
});

test('pausa só vale na Vitrine e se desfaz quando a pessoa vai embora', () => {
  let e = passo(modoInicial(0), { tipo: 'ir', modo: 'vitrine' }, 0);
  e = passo(e, { tipo: 'pausar' }, 10);
  assert.equal(e.pausado, true);
  assert.equal(passo(e, { tipo: 'relogio' }, 10 + REPOUSO_MS).pausado, false);
  assert.equal(passo(modoInicial(0), { tipo: 'pausar' }, 0).pausado, false);
});

test('barra de modos é permanente: visível na abertura e muito depois do último toque (grill r1, Q6)', () => {
  const e = modoInicial(0);
  assert.equal(barraVisivel(e, 0), true, 'abre com a barra');
  const tocado = passo(e, { tipo: 'atividade', toque: true }, 1000);
  assert.equal(barraVisivel(tocado, 1000 + BARRA_MS + 60_000), true);
  assert.equal(barraVisivel(passo(e, { tipo: 'atividade' }, 9000), 9001), true);
});

function pad(botoes = [], eixos = [0, 0, 0, 0], mapping = 'standard') {
  return { mapping, axes: eixos, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: botoes.includes(i), value: botoes.includes(i) ? 1 : 0 })) };
}

test('controle: L1/R1 não trocam de aba em modo nenhum (quem joga apertava sem querer, 21/10)', () => {
  for (const modo of ['coruja', 'vitrine', 'simulacao', 'site']) {
    for (const botao of [4, 5]) {
      const leitura = lerNavegacao(pad([botao]), { pressed: [] }, modo);
      assert.deepEqual(leitura.acoes, [], `${modo}: botão ${botao}`);
      assert.equal(leitura.ativo, true, 'L1/R1 ainda contam como gente por perto');
    }
  }
  const ambos = lerNavegacao(pad([4, 5, 0, 7]), { pressed: [] }, 'simulacao');
  assert.deepEqual(ambos.acoes, [], 'jogando com L1/R1 + ✕ + R2 a Simulação fica');
});

test('controle: PS volta à Coruja, por borda', () => {
  const ps = lerNavegacao(pad([16]), { pressed: [] }, 'vitrine');
  assert.deepEqual(ps.acoes, [{ tipo: 'ir', modo: 'coruja' }]);
  assert.deepEqual(lerNavegacao(pad([16]), ps.next, 'vitrine').acoes, [], 'segurar não repete');
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

test('voz que cai na abertura (prazo, worklet, WebSocket) vira modo sem voz por 1 min e volta', () => {
  const fim = { motivo: 'erro', detalhe: 'sem_conexao_provedor', em: 1000, naAbertura: true };
  assert.equal(vozDoStand({ ligado: true }, fim, 1000 + PAUSA_APOS_FALHA_MS - 1), 'desligada');
  assert.equal(motivoSemVoz({ ligado: true }, fim, 2000), 'erro:sem_conexao_provedor');
  assert.equal(vozDoStand({ ligado: true }, fim, 1000 + PAUSA_APOS_FALHA_MS), 'ligada');
  assert.equal(motivoSemVoz({ ligado: true }, fim, 1000 + PAUSA_APOS_FALHA_MS), '');
  // Erro no meio da conversa (já pronta) não tira a voz: o próximo toque tenta de novo.
  assert.equal(vozDoStand({ ligado: true }, { ...fim, naAbertura: false }, 2000), 'ligada');
  assert.equal(motivoSemVoz({ ligado: false, motivo: 'teto_diario' }, null), 'teto_diario');
  assert.equal(motivoSemVoz({ ligado: true }, { motivo: 'desligado', detalhe: 'sem_credencial' }), 'desligado:sem_credencial');
});

test('textos sem voz não prometem microfone e mudam com o controle conectado', () => {
  assert.deepEqual(chamadaSemVoz(true), { titulo: 'Toca aqui pra ver o LUCA\u2011AI em ação', sub: 'ou aperta ✕ no controle' });
  assert.doesNotMatch(JSON.stringify(chamadaSemVoz(true)), /R1|L1/);
  assert.deepEqual(chamadaSemVoz(false), { titulo: 'Toca aqui pra ver o LUCA\u2011AI em ação', sub: '' });
  for (const texto of Object.values({ ...chamadaSemVoz(true), ...chamadaSemVoz(false) })) {
    assert.doesNotMatch(texto, /microfone|pergunt|fala/i);
  }
});

test('DualSense no layout standard do Chromium (USB e Bluetooth): 18 botões, touchpad no 17 não navega', () => {
  // MapperDualSense (Linux/Windows/macOS) entrega 0 ✕ 1 ○ 2 □ 3 △ 4 L1 5 R1 6 L2 7 R2 8 Create 9 Options
  // 10 L3 11 R3 12–15 D-pad 16 PS 17 touchpad.
  const dualsense = (apertados) => ({ mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, (_, i) => ({ pressed: apertados.includes(i), value: apertados.includes(i) ? 1 : 0 })) });
  assert.deepEqual(lerNavegacao(dualsense([17]), { pressed: [] }, 'coruja').acoes, []);
  assert.equal(lerNavegacao(dualsense([17]), { pressed: [] }, 'coruja').ativo, true);
  assert.deepEqual(lerNavegacao(dualsense([16]), { pressed: [] }, 'simulacao').acoes, [{ tipo: 'ir', modo: 'coruja' }]);
});

test('controle sem mapping standard vira aviso curto pra equipe, sem o sufixo de vendor/produto', () => {
  assert.equal(avisoDeControle(null), '');
  assert.equal(
    avisoDeControle('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'),
    'controle não reconhecido (Wireless Controller) · use o DualSense no cabo USB',
  );
  assert.equal(avisoDeControle('(054c-0ce6)'), 'controle não reconhecido (controle) · use o DualSense no cabo USB');
});
