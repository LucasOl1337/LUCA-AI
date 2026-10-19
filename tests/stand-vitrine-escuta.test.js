import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { escutaNoStand } = await loadFrontendModule('../../src/components/stand/avisos.ts');
const raiz = new URL('..', import.meta.url).pathname;
const ler = (p) => readFile(raiz + p, 'utf8');

test('Escuta ligada só com voz ligada e escuta no status, nunca no stub', () => {
  assert.equal(escutaNoStand({ ligado: true, escuta: true }, 'ligada'), true);
  assert.equal(escutaNoStand({ ligado: true, escuta: false }, 'ligada'), false);
  assert.equal(escutaNoStand({ ligado: true }, 'ligada'), false);
  assert.equal(escutaNoStand({ ligado: true, escuta: true }, 'desligada'), false);
  assert.equal(escutaNoStand({ ligado: true, escuta: true }, 'carregando'), false);
  assert.equal(escutaNoStand(null, 'ligada'), false);
  assert.equal(escutaNoStand({ ligado: true, escuta: true }, 'ligada', true), false);
});

test('a página usa o mesmo sinal para a Escuta e para a Vitrine muda', async () => {
  const pagina = await ler('src/pages/StandPage.tsx');
  assert.match(pagina, /const escutaLigada = escutaNoStand\(status, vozStand, modoStub\)/);
  assert.match(pagina, /ativa: escutaLigada && MODOS_COM_ESCUTA/);
  assert.match(pagina, /<VitrineStand [^>]*semSom=\{escutaLigada\}/);
});

test('Vitrine sem som: vídeo mudo, sem aviso de autoplay e sem desmutar no toque', async () => {
  const modos = await ler('src/components/stand/Modos.tsx');
  assert.match(modos, /el\.muted = semSom;/);
  assert.match(modos, /<video [^>]*muted=\{semSom\}/);
  assert.match(modos, /if \(!mudo \|\| semSom\) return undefined;/);
  assert.match(modos, /\{mudo && !semSom && video && <p className="stand-aviso-equipe stand-aviso-mudo">/);
  assert.match(modos, /data-som=\{semSom \? 'mudo_escuta' : undefined\}/);
});

test('todo vídeo da Vitrine tem a fala em legenda (.srt ao lado, queimada no vídeo)', async () => {
  const manifesto = JSON.parse(await ler('shared/stand/videos.json'));
  assert.ok(manifesto.length > 0);
  for (const v of manifesto) assert.ok(existsSync(`${raiz}public${v.arquivo.replace(/\.mp4$/, '.srt')}`), v.arquivo);
});
