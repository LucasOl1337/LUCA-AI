import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarTelaPainel, vistaTela, desenharVista, CORES_TELA, TELA_LARGURA, TELA_ALTURA } =
  await loadFrontendModule('../../src/components/gameplay/telaPainel.ts');

const estado = ({ cm = 400, kph = 6, rolagem = 0, fase = 'dirigindo' } = {}) => ({
  versao: 1, fase, tempoMs: 1000,
  maquina: { x: 0, z: 0, rumoGraus: 0, velocidadeKph: kph, re: false },
  comandos: { esterco: 0, acelerador: 1, freio: 0 },
  sensor: { distanciaCm: cm, eco: cm < 400, alerta: cm < 400 && cm <= 150 },
  atitude: { rolagemGraus: rolagem, arfagemGraus: 0 },
  contato: false, tetoKph: 6,
});

/** Contexto 2D falso: guarda cada texto com a cor em que foi pintado e cada retângulo. */
function contextoFalso() {
  const textos = [];
  const retangulos = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect(x, y, w, h) { retangulos.push({ x, y, w, h, cor: ctx.fillStyle }); },
    strokeRect(x, y, w, h) { retangulos.push({ x, y, w, h, contorno: ctx.strokeStyle }); },
    fillText(texto) { textos.push({ texto, cor: ctx.fillStyle }); },
  };
  return { ctx, textos, retangulos };
}
const canvasFalso = () => {
  const falso = contextoFalso();
  return { falso, canvas: { width: TELA_LARGURA, height: TELA_ALTURA, getContext: () => falso.ctx } };
};

test('tela 512x320 (16:10) com selo SIMULADO, marca e distância na cor da faixa', () => {
  assert.equal(TELA_LARGURA / TELA_ALTURA, 1.6);
  const { ctx, textos, retangulos } = contextoFalso();
  desenharVista(ctx, vistaTela(estado({ cm: 180 })));
  const t = Object.fromEntries(textos.map(({ texto, cor }) => [texto, cor]));
  assert.ok('SIMULADO' in t);
  assert.ok('LUCA-AI' in t);
  assert.equal(t['1,8 m'], CORES_TELA.atencao);
  assert.ok('Obstáculo à frente' in t);
  assert.ok('6 km/h' in t);
  assert.ok(!retangulos.some((r) => r.cor === CORES_TELA.alerta), 'sem faixa vermelha fora do alerta');
  assert.ok(retangulos.some((r) => r.contorno === CORES_TELA.atencao));
});

test('alerta de 150 cm pinta a faixa vermelha com o mesmo texto do painel HTML', () => {
  const { ctx, textos, retangulos } = contextoFalso();
  desenharVista(ctx, vistaTela(estado({ cm: 140 })));
  assert.ok(retangulos.some((r) => r.cor === CORES_TELA.alerta));
  assert.ok(textos.some((x) => x.texto === 'Obstáculo a 1,5 m · freie'));
  assert.ok(textos.some((x) => x.texto === '1,4 m' && x.cor === CORES_TELA.perigo));
});

test('inclinação a partir de 20° aparece em vermelho com a faixa de tombamento', () => {
  const { ctx, textos } = contextoFalso();
  desenharVista(ctx, vistaTela(estado({ rolagem: -22.4 })));
  assert.ok(textos.some((x) => x.texto === 'Inclinação de 22° · freie'));
  assert.ok(textos.some((x) => x.texto === '22°' && x.cor === CORES_TELA.perigo));
  const calmo = contextoFalso();
  desenharVista(calmo.ctx, vistaTela(estado({ rolagem: -10 })));
  assert.ok(!calmo.textos.some((x) => x.texto === 'INCLINAÇÃO'));
});

test('criarTelaPainel só redesenha quando o que aparece muda e marca a textura', () => {
  const { falso, canvas } = canvasFalso();
  const tela = criarTelaPainel({ canvas });
  assert.equal(tela.textura.image, canvas);
  const versao0 = tela.textura.version;
  assert.equal(tela.desenhar(estado({ cm: 300 })), true);
  assert.ok(tela.textura.version > versao0);
  const pintados = falso.textos.length;
  // Mesmo texto (3,0 m a 6 km/h) com tempo e posição diferentes: nada a redesenhar.
  assert.equal(tela.desenhar({ ...estado({ cm: 302 }), tempoMs: 1500 }), false);
  assert.equal(falso.textos.length, pintados);
  assert.equal(tela.desenhar(estado({ cm: 140 })), true);
  tela.descartar();
  assert.equal(tela.desenhar(estado({ cm: 140 })), true, 'depois de descartar, desenha do zero se a Visual remontar');
});

test('sem contexto 2d falha alto, para a cabine da Visual seguir sem a tela', () => {
  assert.throws(() => criarTelaPainel({ canvas: { width: 1, height: 1, getContext: () => null } }), /contexto 2d/);
});
