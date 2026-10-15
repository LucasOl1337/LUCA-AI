import assert from 'node:assert/strict';
import test from 'node:test';
import { montarLinhaDoTempo } from '../sompo/linha-do-tempo.ts';
import { cameraFixa } from '../zoom-camera.ts';
import { comPausas, CORTES, paraVideo, planosDoPipeline, rastroEmVideo } from './planos.ts';
import { PIPELINE, PLANO_B } from './roteiro.ts';

const CORTES_OK = Object.fromEntries(CORTES.map((nome, i) => [nome, 10 + i * 20]));
const ANCORAS = [[0, 0], [12.6, 12.6], [58.9, 54.8], [946, 943.56]];

test('relógio da captura → vídeo: exato nas âncoras, linear entre elas', () => {
  assert.equal(paraVideo(58.9, ANCORAS), 54.8);
  assert.ok(Math.abs(paraVideo((12.6 + 58.9) / 2, ANCORAS) - (12.6 + 54.8) / 2) < 1e-9);
  assert.throws(() => paraVideo(1, [[0, 0]]), /2 âncoras/);
});

test('rastro convertido: o clique cai no tempo do vídeo', () => {
  const r = rastroEmVideo({ viewport: { largura: 1920, altura: 1080 }, cliques: [{ t: 58.9, x: 1, y: 2 }], cursor: [], marcas: { b4: 58.9 } }, ANCORAS);
  assert.equal(r.cliques[0].t, 54.8);
  assert.equal(r.marcas.b4, 54.8);
});

test('b2 e b8 são desenhados; corte ausente falha alto', () => {
  const p = planosDoPipeline(CORTES_OK);
  assert.deepEqual(p.b2, [{ inicio: null }]);
  assert.deepEqual(p.b8, [{ inicio: null }]);
  const { entrega, ...resto } = CORTES_OK;
  assert.throws(() => planosDoPipeline(resto), /entrega/);
});

test('pausas esticam o bloco, empurram o resto e não mexem nas legendas do próprio bloco', () => {
  const p = planosDoPipeline(CORTES_OK);
  const linha = montarLinhaDoTempo(PIPELINE.map((b) => ({ id: b.id, texto: b.narracao, narracao: `${b.id}.wav`, duracaoNarracao: 10, verdade: b.verdade, detalhe: b.detalhe, planos: p[b.id] })));
  const comP = comPausas(linha, { b6: 2 });
  assert.equal(comP.total, linha.total + 2);
  const b6 = comP.blocos.find((b) => b.id === 'b6');
  const b7 = comP.blocos.find((b) => b.id === 'b7');
  assert.equal(b7.de, b6.de + b6.dur);
  const leg = (l, id) => l.trechos.filter((x) => x.inicio >= l.blocos.find((b) => b.id === id).de && x.inicio < l.blocos.find((b) => b.id === id).de + 10.5);
  assert.deepEqual(leg(comP, 'b6').map((x) => x.inicio), leg(linha, 'b6').map((x) => x.inicio));
  assert.ok(Math.abs(comP.planos.reduce((n, x) => n + x.dur, 0) - comP.total) < 1e-6);
  assert.ok(comP.planos.every((x, i, a) => i === 0 || Math.abs(a[i - 1].de + a[i - 1].dur - x.de) < 1e-6));
});

test('enquadramento fixo nunca mostra fora da captura', () => {
  const vp = { largura: 1920, altura: 1080 };
  for (const r of [{ x: 0, y: 0, largura: 960, altura: 540 }, { x: 1500, y: 900, largura: 400, altura: 225 }]) {
    const { escala, tx, ty } = cameraFixa(r, vp, 3);
    assert.ok(escala >= 1 && tx <= 1e-9 && ty <= 1e-9);
    assert.ok(tx + 1920 * escala >= 1920 - 1e-6 && ty + 1080 * escala >= 1080 - 1e-6);
  }
});

test('roteiro: fecha com "Pergunta pro LUCA", sem "operador LUCA" nem "classificação"', () => {
  const tudo = [...PIPELINE.map((b) => b.narracao), ...Object.values(PLANO_B)].join(' ');
  assert.match(PIPELINE.at(-1).narracao, /Pergunta pro LUCA\.$/);
  assert.doesNotMatch(tudo, /operador LUCA|classifica/i);
  assert.equal(PIPELINE.find((b) => b.id === 'b2').verdade, 'esquema');
});
