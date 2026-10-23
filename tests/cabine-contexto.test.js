import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const b = await build({ stdin: { contents: `export * from './src/stand-voz/barramento'; export * from './src/components/gameplay/contextoCorrida'; export * from './src/stand-voz/sessaoTurnos';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const m = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].contents).toString('base64')}`);
test('tela publicada antes do PTT chega ao assinar sem repetir ações', () => {
  m.emitirEventoStand({ tipo: 'tela', texto: 'Tela atual: simulacao.' });
  m.emitirEventoStand({ tipo: 'pergunta_texto', texto: 'não repetir' });
  const eventos = [];
  const parar = m.assinarEventosPagina(e => eventos.push(e));
  assert.deepEqual(eventos, [{ tipo: 'tela', texto: 'Tela atual: simulacao.' }]);
  parar();
});
test('duas perguntas da mesma sessão conservam a tela e leem estado novo', async () => {
  const anterior = globalThis.fetch;
  const janela = globalThis.window;
  globalThis.window = { clearTimeout() {}, setTimeout() { return 0; } };
  const corpos = [];
  globalThis.fetch = async (_url, opcoes) => { corpos.push(JSON.parse(opcoes.body)); return { status: 200, ok: true, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"t":"fim","motivo":"ok"}\\n')); c.close(); } }) }; };
  const s = new m.SessaoTurnos();
  s.tela = 'Tela atual: simulacao.';
  s.mudarEstado = () => {};
  const estado = { velocidadeKph: 6, distanciaCm: 150, fase: 'dirigindo' };
  const parar = m.registrarContextoCorrida(() => estado);
  try {
    await s.perguntar({ texto: 'como eu faço pra frear' });
    estado.fase = 'pausa';
    await s.perguntar({ texto: 'e agora?' });
    assert.match(corpos[0].tela, /dirigindo/);
    assert.match(corpos[1].tela, /pausa/);
    assert.equal(s.tela, 'Tela atual: simulacao.');
  } finally { parar(); globalThis.fetch = anterior; globalThis.window = janela; }
});

test('snapshot lido só no turno mantém contexto e acompanha pausa e fim', () => {
  let leituras = 0;
  const estado = { velocidadeKph: 6, distanciaCm: 230, fase: 'dirigindo' };
  const parar = m.registrarContextoCorrida(() => { leituras++; return estado; });
  assert.equal(leituras, 0);
  const tela = 'Tela atual: simulacao.';
  assert.match(m.contextoDaCorrida(tela), /dirigindo; velocidade 6.0 km\/h; obstáculo frontal 230 cm/);
  estado.velocidadeKph = 0; estado.fase = 'pausa';
  assert.match(m.contextoDaCorrida(tela), /pausa; velocidade 0.0/);
  estado.fase = 'fim'; assert.match(m.contextoDaCorrida(tela), /Corrida: fim/);
  assert.equal(m.contextoDaCorrida('Tela atual: coruja.'), 'Tela atual: coruja.');
  assert.equal(leituras, 3);
  parar(); assert.match(m.contextoDaCorrida(tela), /preparação/);
});
