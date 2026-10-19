import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { montarItens, disponiveis, descreverPulos, tratorAoVivo, TITULO_TELA, LAB_TETO_MS, LAB_VELOCIDADE } = await loadFrontendModule('../../src/components/stand/vitrineStand.ts');
const { reduzirModo, modoInicial, proximoItem, REPOUSO_MS } = await loadFrontendModule('../../src/components/stand/modoStand.ts');
const { carregarCasoLab, lerTrator, CASO_LAB } = await loadFrontendModule('../../src/components/stand/dadosTelasDoApp.ts');

const VIDEOS = ['A', 'B', 'C'].map((t) => ({ titulo: t, arquivo: `/${t}.mp4` }));
const raiz = new URL('../public', import.meta.url).pathname;

/** fetch de mentira que serve `public/` e registra método e URL de cada chamada. */
function servirPublic({ telemetria, atraso } = {}) {
  const chamadas = [];
  globalThis.fetch = async (url, init = {}) => {
    chamadas.push({ url: String(url), method: (init.method || 'GET').toUpperCase() });
    if (atraso) await new Promise((ok, falha) => {
      const t = setTimeout(ok, atraso);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); falha(new DOMException('abortado', 'AbortError')); });
    });
    if (String(url) === '/api/sompo/telemetry') {
      const { status = 200, corpo } = telemetria ?? {};
      return new Response(JSON.stringify(corpo ?? {}), { status, headers: { 'content-type': 'application/json' } });
    }
    try {
      const corpo = await readFile(raiz + url);
      return new Response(corpo, { status: 200, headers: { 'content-type': String(url).endsWith('.csv') ? 'text/csv' : 'application/json' } });
    } catch {
      // Igual à produção: caminho ausente cai no fallback da SPA, HTML com 200.
      return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
  };
  return chamadas;
}

test('ordem aprovada: vídeo, Lab, vídeo, Trator agora, vídeo', () => {
  const itens = montarItens(VIDEOS);
  assert.deepEqual(itens.map((i) => i.tipo === 'video' ? i.titulo : i.tipo), ['A', 'lab', 'B', 'trator', 'C']);
  assert.equal(itens[1].titulo, 'Laboratório · replay de um tombamento (dados de demonstração)');
  assert.equal(itens[3].titulo, 'Agora · o trator do stand pelo sensor');
  assert.equal(TITULO_TELA.lab.includes('ao vivo'), false);
  assert.equal(LAB_VELOCIDADE * LAB_TETO_MS / 1000, 180);
});

test('Tela do app fora do ar sai da volta sem buraco; a volta ainda devolve à Coruja', () => {
  const itens = montarItens(VIDEOS);
  const prontos = disponiveis(itens, { lab: 'sem_webgl', trator: 'sem_sinal' });
  assert.deepEqual(prontos, [true, false, true, false, true]);
  assert.equal(descreverPulos({ lab: 'sem_webgl', trator: 'sem_sinal' }), 'lab:sem_webgl trator:sem_sinal');
  assert.equal(descreverPulos({ lab: true, trator: true }), undefined);

  let e = reduzirModo(modoInicial(0), { tipo: 'ir', modo: 'vitrine' }, 0, prontos);
  const vistos = [e.video];
  for (let t = 1; t <= 2; t += 1) { e = reduzirModo(e, { tipo: 'video_terminou' }, t, prontos); vistos.push(e.video); }
  assert.deepEqual(vistos, [0, 2, 4], 'só vídeos');
  // Fim da volta com gente por perto recomeça; sem ninguém, Coruja.
  assert.equal(reduzirModo(e, { tipo: 'video_terminou' }, 3, prontos).video, 0);
  const sozinho = reduzirModo(e, { tipo: 'video_terminou' }, REPOUSO_MS + 10, prontos);
  assert.equal(sozinho.modo, 'coruja');
});

test('setas pulam Tela do app indisponível nos dois sentidos', () => {
  const prontos = [true, false, true, false, true];
  assert.deepEqual(proximoItem(0, 1, prontos), { indice: 2, deuVolta: false });
  assert.deepEqual(proximoItem(2, -1, prontos), { indice: 0, deuVolta: false });
  assert.equal(proximoItem(0, -1, prontos).indice, 4);
  assert.deepEqual(proximoItem(4, 1, prontos), { indice: 0, deuVolta: true });
  // Tudo pronto: passa pelo Lab e pelo trator.
  assert.equal(proximoItem(0, 1, [true, true, true, true, true]).indice, 1);
  // Contador continua aceito (chamadas antigas).
  assert.equal(reduzirModo({ ...modoInicial(0), modo: 'vitrine' }, { tipo: 'video_terminou' }, 1, 3).video, 1);
});

test('"Ao vivo" só com sinal fresco, conexão viva e sensor real', () => {
  const vivo = { freshness: 'fresh', connection: { state: 'live' }, source: { kind: 'firebase' } };
  assert.equal(tratorAoVivo(vivo), true);
  assert.equal(tratorAoVivo({ ...vivo, freshness: 'stale' }), false);
  assert.equal(tratorAoVivo({ ...vivo, freshness: 'checking' }), false);
  assert.equal(tratorAoVivo({ ...vivo, connection: { state: 'reconnecting' } }), false);
  assert.equal(tratorAoVivo({ ...vivo, source: { kind: 'simulation' } }), false);
  assert.equal(tratorAoVivo(null), false);
});

test('Lab: carrega o caso de Piracicaba só com GET de arquivo público', async () => {
  const chamadas = servirPublic();
  const r = await carregarCasoLab();
  assert.equal(r.ok, true);
  assert.equal(r.valor.durationMs, 240_000);
  assert.ok(r.valor.samples.length > 100);
  assert.ok(r.valor.events.some((ev) => ev.type === 'device_inclination_warning'));
  assert.deepEqual(chamadas.map((c) => c.method), ['GET', 'GET', 'GET']);
  assert.deepEqual(chamadas.map((c) => c.url).sort(), [CASO_LAB.csv, CASO_LAB.manifest, CASO_LAB.map].sort());
});

test('Lab: arquivo ausente (fallback HTML da SPA) e prazo de 6 s pulam o item', async () => {
  const original = CASO_LAB.csv;
  servirPublic();
  globalThis.fetch = ((anterior) => async (url, init) => anterior(String(url) === original ? '/datasets/nao-existe.csv' : url, init))(globalThis.fetch);
  assert.deepEqual(await carregarCasoLab(), { ok: false, motivo: 'dados_indisponiveis' });
  servirPublic({ atraso: 500 });
  assert.deepEqual(await carregarCasoLab(50), { ok: false, motivo: 'prazo' });
});

test('Trator agora: só GET; 401, 502 e prazo viram motivo de pulo', async () => {
  const fresco = { telemetry: { freshness: 'fresh', connection: { state: 'live' }, source: { kind: 'firebase' }, readings: { roll: 3 } } };
  let chamadas = servirPublic({ telemetria: { corpo: fresco } });
  const ok = await lerTrator();
  assert.equal(ok.ok, true);
  assert.equal(ok.valor.readings.roll, 3);
  assert.deepEqual(chamadas, [{ url: '/api/sompo/telemetry', method: 'GET' }]);
  servirPublic({ telemetria: { status: 401 } });
  assert.deepEqual(await lerTrator(), { ok: false, motivo: 'http_401' });
  servirPublic({ telemetria: { status: 502 } });
  assert.deepEqual(await lerTrator(), { ok: false, motivo: 'http_502' });
  servirPublic({ telemetria: { corpo: fresco }, atraso: 500 });
  assert.deepEqual(await lerTrator(50), { ok: false, motivo: 'prazo' });
});

test('Telas do app não importam caminho que grava, sobe arquivo ou mexe na bancada', async () => {
  for (const arquivo of ['src/components/stand/TelasDoApp.tsx', 'src/components/stand/dadosTelasDoApp.ts', 'src/components/stand/vitrineStand.ts']) {
    const fonte = await readFile(new URL(`../${arquivo}`, import.meta.url), 'utf8');
    for (const proibido of ['lab-client', 'labRequest', 'saveCase', 'apiPost', 'apiPatch', 'apiDelete', 'bench', "method: 'POST'", 'upload']) {
      assert.equal(fonte.includes(proibido), false, `${arquivo} cita ${proibido}`);
    }
  }
});
