import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executarFerramentaStand, FERRAMENTAS_STAND, videoPublicado } from './ferramentas.js';

const manifesto = [
  { id: 'pipeline-completo', titulo: 'O caminho do dado', arquivo: '/stand/videos/pipeline-completo.mp4' },
  { id: 'painel-sompo', titulo: 'Painel da Sompo', arquivo: '/stand/videos/painel-sompo.mp4' },
];

function raizComVideo(t) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-ferramentas-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  fs.mkdirSync(path.join(raiz, 'public/stand/videos'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'public/stand/videos/pipeline-completo.mp4'), 'mp4');
  return raiz;
}

test('tools no formato Realtime: as três do cérebro mais uma por ação do site (M3)', () => {
  assert.deepEqual(FERRAMENTAS_STAND.map((f) => f.name), [
    'buscar_no_repo', 'pesquisar_web', 'tocar_video',
    'abrir_aba', 'voltar_inicio', 'abrir_caso', 'rodar_cenario', 'gravar_episodio', 'analisar_na_bancada',
  ]);
  for (const f of FERRAMENTAS_STAND) {
    assert.equal(f.type, 'function');
    assert.equal(f.parameters.type, 'object');
  }
});

test('tocar_video: id do manifesto com arquivo emite o evento', async (t) => {
  const raiz = raizComVideo(t);
  const r = await executarFerramentaStand('tocar_video', { id: 'pipeline-completo' }, { lerManifesto: () => manifesto, raiz });
  assert.deepEqual(r, { ok: true, ferramenta: 'tocar_video', id: 'pipeline-completo', titulo: 'O caminho do dado', evento: { tipo: 'tocar_video', id: 'pipeline-completo' } });
});

test('tocar_video recusa id fora do manifesto, mp4 ausente e manifesto ilegível', async (t) => {
  const raiz = raizComVideo(t);
  const deps = { lerManifesto: () => manifesto, raiz };
  assert.equal((await executarFerramentaStand('tocar_video', { id: 'inventado' }, deps)).erro, 'video_desconhecido');
  assert.equal((await executarFerramentaStand('tocar_video', { id: 'painel-sompo' }, deps)).erro, 'video_sem_arquivo');
  const semManifesto = { lerManifesto: () => { throw new Error('ENOENT'); }, raiz };
  assert.equal((await executarFerramentaStand('tocar_video', { id: 'pipeline-completo' }, semManifesto)).erro, 'video_indisponivel');
});

test('videoPublicado: só vale com id no manifesto e mp4 no disco', (t) => {
  const raiz = raizComVideo(t);
  const deps = { lerManifesto: () => manifesto, raiz };
  assert.equal(videoPublicado('pipeline-completo', deps), true);
  assert.equal(videoPublicado('painel-sompo', deps), false);
  assert.equal(videoPublicado('inventado', deps), false);
  assert.equal(videoPublicado('pipeline-completo', { lerManifesto: () => { throw new Error('ENOENT'); }, raiz }), false);
});

test('tocar_video com o manifesto real da M7 conhece pipeline-completo', async () => {
  const r = await executarFerramentaStand('tocar_video', { id: 'pipeline-completo' });
  assert.ok(r.ok || r.erro === 'video_sem_arquivo', JSON.stringify(r));
});

test('ações do site passam pelo validador da M3 e viram evento acao_site', async () => {
  const ok = await executarFerramentaStand('abrir_aba', { aba: 'telemetria' });
  assert.deepEqual(ok.evento, { tipo: 'acao_site', acao: 'abrir_aba', args: { aba: 'telemetria' } });
  const cenario = await executarFerramentaStand('rodar_cenario', { id: 'stand-inclinacao' });
  assert.deepEqual(cenario.evento, { tipo: 'acao_site', acao: 'rodar_cenario', args: { id: 'stand-inclinacao' } });
  assert.deepEqual((await executarFerramentaStand('voltar_inicio', {})).evento.args, {});
  const ruim = await executarFerramentaStand('abrir_aba', { aba: 'admin' });
  assert.equal(ruim.erro, 'acao_invalida');
  assert.match(ruim.mensagem, /Opções: telemetria/);
  assert.equal((await executarFerramentaStand('acao_site', { acao: 'abrir_aba' })).erro, 'ferramenta_desconhecida');
});

test('pesquisar_web usa web_search/fetch_url do agent-tools e propaga falha', async () => {
  const chamadas = [];
  const executarAgente = async (nome, args) => {
    chamadas.push([nome, args]);
    if (nome === 'web_search') return { ok: true, results: [{ title: 'Seguro rural', url: 'https://ex.test', snippet: 'PSR' }] };
    return { ok: false, error: 'host_privado' };
  };
  const busca = await executarFerramentaStand('pesquisar_web', { consulta: 'seguro rural Brasil' }, { executarAgente });
  assert.deepEqual(busca.resultados, [{ titulo: 'Seguro rural', url: 'https://ex.test', trecho: 'PSR' }]);
  const pagina = await executarFerramentaStand('pesquisar_web', { consulta: 'x', url: 'http://127.0.0.1' }, { executarAgente });
  assert.deepEqual(pagina, { ok: false, ferramenta: 'pesquisar_web', erro: 'host_privado' });
  assert.deepEqual(chamadas.map(([nome]) => nome), ['web_search', 'fetch_url']);
});

test('buscar_no_repo responde a pergunta do aceite; ferramenta desconhecida é recusada', async () => {
  const r = await executarFerramentaStand('buscar_no_repo', { consulta: 'fluxo do dado até os agentes' });
  assert.equal(r.ok, true);
  assert.ok(r.resultados.length > 0);
  assert.equal((await executarFerramentaStand('buscar_no_repo', { consulta: '  ' })).erro, 'consulta_vazia');
  assert.equal((await executarFerramentaStand('apagar_banco', {})).erro, 'ferramenta_desconhecida');
});
