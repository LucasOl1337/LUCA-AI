import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const olhos = await loadFrontendModule('../../src/components/stand/coruja3dOlhos.ts');
const rig = await loadFrontendModule('../../src/components/stand/coruja3dRig.ts');

function rodar(m, voz, de, ate, opcoes = {}, piscar = 0) {
  let o;
  for (let t = de; t <= ate; t += 16) o = olhos.olhosCoruja3D(m, voz, piscar, t, opcoes);
  return o;
}

test('piscada da rostoCoruja3D fecha a tela dos olhos; pensando estreita de leve, sem cara de sono', () => {
  const m = olhos.novaMemoriaOlhos(0);
  assert.equal(rodar(m, 'ocioso', 0, 200, { movimentoReduzido: true }, 1).abertura, 0);
  const aberto = rodar(m, 'ocioso', 216, 1200, { movimentoReduzido: true }, 0).abertura;
  assert.ok(Math.abs(aberto - 1) < 0.01, `aberto ${aberto}`);
  const pensando = rodar(m, 'pensando', 1216, 3000, { movimentoReduzido: true }, rig.PALPEBRA_PENSANDO).abertura;
  assert.ok(pensando > 0.78 && pensando < 0.92, `pensando ${pensando}`);
});

test('ouvindo arregala e dilata a pupila; olha para quem fala', () => {
  const m = olhos.novaMemoriaOlhos(0);
  const o = rodar(m, 'ouvindo', 0, 2000, { sorteio: () => 0.5 });
  assert.ok(o.abertura > 1.05 && o.pupila > 1.1, JSON.stringify(o));
  assert.ok(Math.abs(o.x) < 0.1 && Math.abs(o.y) < 0.15, 'olhar no centro');
});

test('pensando olha para cima e para o lado', () => {
  const m = olhos.novaMemoriaOlhos(0);
  const o = rodar(m, 'pensando', 0, 2000, { sorteio: () => 0.5 });
  assert.ok(o.x > 0.2 && o.x < 0.4 && o.y > 0.3, JSON.stringify(o));
});

test('sacadas: o olhar troca de alvo de 0,9 a 3,2 s e chega rápido', () => {
  let i = 0;
  const seq = [1, 1, 0]; // alvo no canto (x=+0,24), depois intervalo mínimo
  const sorteio = () => seq[i++ % seq.length];
  const m = olhos.novaMemoriaOlhos(0);
  rodar(m, 'ocioso', 0, olhos.SACADA_MS.min - 16, { sorteio });
  assert.equal(m.x, 0, 'parado antes da primeira sacada');
  const o = rodar(m, 'ocioso', olhos.SACADA_MS.min, olhos.SACADA_MS.min + 160, { sorteio });
  assert.ok(o.x > 0.22, `chegou em ~150 ms: ${o.x}`);
  assert.ok(m.proximaSacada >= olhos.SACADA_MS.min * 2 && m.proximaSacada <= olhos.SACADA_MS.min + olhos.SACADA_MS.max);
});

test('feliz (^^) no aceno de entrada e por 1,8 s depois da fala; ouvindo corta', () => {
  const m = olhos.novaMemoriaOlhos(0);
  assert.ok(rodar(m, 'ocioso', 0, 600, { feliz: true }).feliz > 0.95, 'entrada');
  assert.ok(rodar(m, 'ocioso', 616, 1400).feliz < 0.05, 'apaga sem pedido');
  rodar(m, 'falando', 1416, 3000);
  assert.ok(rodar(m, 'ocioso', 3016, 3600).feliz > 0.95, 'sorri ao fim da fala');
  assert.ok(rodar(m, 'ocioso', 3616, 3016 + olhos.FELIZ_DEPOIS_FALA_MS + 600).feliz < 0.05, 'volta ao normal');
  rodar(m, 'falando', 5500, 6000);
  rodar(m, 'ocioso', 6016, 6100);
  assert.ok(rodar(m, 'ouvindo', 6116, 6700).feliz < 0.05, 'nova pergunta corta o sorriso');
});

test('desenha os dois olhos no canvas 512x256: aberto, fechado e feliz', () => {
  const chamadas = [];
  const gradiente = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(_, nome) {
      if (nome === 'createRadialGradient') return () => gradiente;
      return (...args) => chamadas.push([nome, ...args]);
    },
    set() { return true; },
  });
  const conta = (nome) => chamadas.filter((c) => c[0] === nome).length;
  olhos.desenharOlhos(ctx, { abertura: 1, x: 0, y: 0, feliz: 0, pupila: 1 });
  assert.deepEqual(chamadas[0], ['clearRect', 0, 0, olhos.OLHOS_CANVAS.largura, olhos.OLHOS_CANVAS.altura]);
  assert.deepEqual(chamadas.filter((c) => c[0] === 'translate').map((c) => c[1]), [128, 384], 'um olho por metade');
  const aberto = conta('ellipse');
  assert.ok(aberto >= 2 * 7, `fundo, esclera, íris, pupila, brilhos, contorno: ${aberto}`);
  chamadas.length = 0;
  olhos.desenharOlhos(ctx, { abertura: 0, x: 0, y: 0, feliz: 0, pupila: 1 });
  assert.equal(conta('quadraticCurveTo'), 2, 'fechado: só a linha da pálpebra');
  chamadas.length = 0;
  olhos.desenharOlhos(ctx, { abertura: 1, x: 0, y: 0, feliz: 1, pupila: 1 });
  assert.equal(conta('quadraticCurveTo'), 2, 'feliz: um arco por olho');
  assert.equal(conta('ellipse'), 2, 'feliz: só o fundo de vidro');
});

test('cabeça fica de frente: segue pouco o olhar e quase não inclina', () => {
  const m = rig.novaMemoriaCabeca(0, () => 0.5);
  let c;
  for (let t = 0; t <= 60; t += 16) c = rig.cabecaViva(m, { x: 1, y: 0 }, 'ocioso', t);
  assert.ok(m.guinada > 0.002 && m.guinada < 0.04, `ainda chegando: ${m.guinada}`);
  for (let t = 76; t <= 3000; t += 16) c = rig.cabecaViva(m, { x: 1, y: 1 }, 'pensando', t);
  assert.ok(Math.abs(m.guinada - rig.SEGUE_OLHAR.guinada) < 0.003 && m.arfagem < -0.03, JSON.stringify(m));
  assert.ok(m.rolagem > 0.02 && m.rolagem < 0.05, `inclinação pequena pensando: ${m.rolagem}`);
  assert.ok(Math.abs(c.guinada) < 0.08 && Math.abs(c.rolagem) < 0.05, 'nunca fica de lado por estado');
});

test('olhada de lado: curta, rara e volta ao centro', () => {
  const m = rig.novaMemoriaCabeca(0, () => 0); // primeira olhada em 9 s
  const amostras = [];
  for (let t = 0; t <= 30000; t += 16) amostras.push([t, rig.cabecaViva(m, { x: 0, y: 0 }, 'ocioso', t, () => 0.9).guinada]);
  const de = (t0, t1) => amostras.filter(([t]) => t >= t0 && t < t1).map(([, g]) => Math.abs(g));
  assert.ok(Math.max(...de(0, 8900)) < 0.02, 'antes da olhada: de frente');
  const pico = Math.max(...de(9000, 10800));
  assert.ok(pico > 0.1 && pico < 0.18, `olhada até ~9°: ${pico}`);
  assert.ok(Math.max(...de(11800, 24000)) < 0.02, 'depois volta ao centro e espera de novo');
  const frontal = amostras.filter(([, g]) => Math.abs(g) < 0.03).length / amostras.length;
  assert.ok(frontal > 0.85, `de frente na maior parte do tempo: ${frontal}`);
});

test('olhada não acontece fora do ocioso', () => {
  const m = rig.novaMemoriaCabeca(0, () => 0);
  let maior = 0;
  for (let t = 0; t <= 20000; t += 16) maior = Math.max(maior, Math.abs(rig.cabecaViva(m, { x: 0, y: 0 }, 'ouvindo', t, () => 0.9).guinada));
  assert.ok(maior < 0.02, `ouvindo de frente: ${maior}`);
});
