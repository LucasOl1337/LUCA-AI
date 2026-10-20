import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarTelaPainel, vistaTela, desenharVista, CORES_TELA, TELA_LARGURA, TELA_ALTURA } =
  await loadFrontendModule('../../src/components/gameplay/telaPainel.ts');
const { alertaCabine } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');

const estado = ({ cm = 400, kph = 6, rolagem = 0, arfagem = 0, re = false, fase = 'dirigindo' } = {}) => ({
  versao: 1, fase, tempoMs: 1000,
  maquina: { x: 0, z: 0, rumoGraus: 0, velocidadeKph: kph, re },
  comandos: { esterco: 0, acelerador: 1, freio: 0 },
  sensor: { distanciaCm: cm, eco: cm < 400, alerta: cm < 400 && cm <= 150 },
  atitude: { rolagemGraus: rolagem, arfagemGraus: arfagem },
  contato: false, tetoKph: 6,
});

/** Registra comandos Canvas2D, sem navegador, GPU ou prova de rasterização. */
function contextoFalso() {
  const textos = [];
  const retangulos = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect(x, y, w, h) { retangulos.push({ x, y, w, h, cor: ctx.fillStyle }); },
    strokeRect(x, y, w, h) { retangulos.push({ x, y, w, h, contorno: ctx.strokeStyle }); },
    fillText(texto, x, y) { textos.push({ texto, x, y, cor: ctx.fillStyle, font: ctx.font }); },
  };
  return { ctx, textos, retangulos };
}
const canvasFalso = () => {
  const falso = contextoFalso();
  return { falso, canvas: { width: TELA_LARGURA, height: TELA_ALTURA, getContext: () => falso.ctx } };
};
const desenhar = (e) => {
  const desenho = contextoFalso();
  desenharVista(desenho.ctx, vistaTela(e));
  return desenho;
};

test('tela mantém 512x320 e só quatro textos: estado, número, velocidade e selo', () => {
  assert.equal(TELA_LARGURA, 512);
  assert.equal(TELA_ALTURA, 320);
  const { textos, retangulos } = desenhar(estado());
  assert.deepEqual(textos.map(t => t.texto), ['LIVRE', '+4 m', '6 km/h', 'SIMULADO']);
  assert.deepEqual(textos.map(t => Number(t.font.match(/ (\d+)px/)[1])), [40, 112, 56, 44]);
  assert.deepEqual(textos.map(t => [t.x, t.y]), [[256, 41], [256, 152], [256, 222], [256, 286]]);
  assert.ok(retangulos.some(r => r.cor === CORES_TELA.selo && r.w === 300 && r.h === 52));
  assert.ok(retangulos.some(r => r.contorno === CORES_TELA.livre));
  assert.ok(!retangulos.some(r => r.cor === CORES_TELA.alerta));
});

test('atenção a 180 cm mantém distância e cor da fonte única, sem frase longa', () => {
  const { textos, retangulos } = desenhar(estado({ cm: 180 }));
  assert.deepEqual(textos.map(t => t.texto), ['ATENÇÃO', '1,8 m', '6 km/h', 'SIMULADO']);
  assert.equal(textos[1].cor, CORES_TELA.atencao);
  assert.ok(!retangulos.some(r => r.cor === CORES_TELA.alerta));
});

test('alerta de obstáculo mantém número112px e FREIE branco em faixa vermelha', () => {
  const e = estado({ cm: 140 });
  const { textos, retangulos } = desenhar(e);
  assert.deepEqual(textos.map(t => t.texto), ['FREIE', '1,4 m', '6 km/h', 'SIMULADO']);
  assert.equal(textos[0].cor, '#ffffff');
  assert.equal(textos[1].cor, CORES_TELA.perigo);
  assert.match(textos[1].font, / 112px /);
  assert.ok(retangulos.some(r => r.cor === CORES_TELA.alerta));
  // A simplificação é só da textura. A fonte do HTML continua detalhada.
  assert.equal(alertaCabine(e).rotuloAlerta, 'Obstáculo a 1,5 m · freie');
  assert.equal(alertaCabine(e).rotulo, 'Alerta de colisão');
});

test('rolagem negativa em risco torna o ângulo arredondado dominante, não +4m', () => {
  const { textos, retangulos } = desenhar(estado({ rolagem: -22.4 }));
  assert.deepEqual(textos.map(t => t.texto), ['FREIE', '22°', '6 km/h', 'SIMULADO']);
  assert.equal(textos[1].cor, CORES_TELA.perigo);
  assert.ok(retangulos.some(r => r.cor === CORES_TELA.alerta));
});

test('limiar de inclinação vem de alertaCabine:19,9° não troca medida,20° troca', () => {
  assert.equal(vistaTela(estado({ rolagem: 19.9 })).valorTexto, '+4 m');
  const noLimiar = vistaTela(estado({ arfagem: 20 }));
  assert.equal(noLimiar.valorTexto, '20°');
  assert.equal(noLimiar.estadoTexto, 'FREIE');
  assert.equal(noLimiar.alerta, true);
});

test('obstáculo e inclinação simultâneos preservam a prioridade do obstáculo', () => {
  const e = estado({ cm: 140, rolagem: 22.4 });
  assert.equal(alertaCabine(e).rotuloAlerta, 'Obstáculo a 1,5 m · freie');
  assert.equal(vistaTela(e).valorTexto, '1,4 m');
  assert.deepEqual(desenhar(e).textos.map(t => t.texto), ['FREIE', '1,4 m', '6 km/h', 'SIMULADO']);
});

test('velocidade arredondada, ré e arredondamento de distância ficam preservados', () => {
  const vista = vistaTela(estado({ cm: 184, kph: 5.6, re: true }));
  assert.equal(vista.valorTexto, '1,8 m');
  assert.equal(vista.velocidadeTexto, '6 km/h · ré');
});

test('uma textura, redesenho só por diferença visível e descarte do recurso', () => {
  const { falso, canvas } = canvasFalso();
  const tela = criarTelaPainel({ canvas });
  const textura = tela.textura;
  assert.equal(textura.image, canvas);
  const versao0 = textura.version;
  assert.equal(tela.desenhar(estado({ cm: 300 })), true);
  assert.equal(textura.version, versao0 + 1);
  const pintados = falso.textos.length;
  assert.equal(tela.desenhar({ ...estado({ cm: 302 }), tempoMs: 1500 }), false);
  assert.equal(falso.textos.length, pintados);
  assert.equal(tela.desenhar(estado({ cm: 140 })), true);
  assert.equal(tela.desenhar(estado({ cm: 140, rolagem: 22 })), false, 'ângulo oculto pelo obstáculo não suja a textura');
  assert.equal(tela.desenhar(estado({ rolagem: 22 })), true, 'troca de medida dominante redesenha');
  assert.equal(tela.textura, textura);
  let descartes = 0;
  textura.addEventListener('dispose', () => descartes++);
  tela.descartar();
  assert.equal(descartes, 1);
  assert.equal(tela.desenhar(estado({ rolagem: 22 })), true, 'descarte limpa cache da vista');
});

test('sem contexto2d falha alto para a cabine continuar sem tela', () => {
  assert.throws(() => criarTelaPainel({ canvas: { width: 1, height: 1, getContext: () => null } }), /contexto 2d/);
});
