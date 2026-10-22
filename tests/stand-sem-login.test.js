import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// ADR 0001: /stand sem sessão (401) mostra a Coruja sem voz e a Vitrine local, não a tela de login.
const require = createRequire(import.meta.url);
const raiz = new URL('..', import.meta.url).pathname;
const ler = (p) => readFile(raiz + p, 'utf8');
const { ITENS_SEM_LOGIN, MODOS_SEM_LOGIN, AVISO_SEM_LOGIN, entradaSemLogin } = await loadFrontendModule('../../src/components/stand/StandSemLogin.tsx');

test('sem login a Vitrine só tem os vídeos públicos do manifesto', async () => {
  const manifesto = JSON.parse(await ler('shared/stand/videos.json'));
  assert.equal(ITENS_SEM_LOGIN.length, manifesto.length);
  for (const item of ITENS_SEM_LOGIN) {
    assert.equal(item.tipo, 'video');
    assert.match(item.video.arquivo, /^\/stand\/videos\/[^/]+\.mp4$/);
  }
  assert.deepEqual([...MODOS_SEM_LOGIN], ['coruja', 'vitrine']);
});

test('pad sem login: ✕ na Coruja abre a Vitrine e Simulação/Site não entram', () => {
  assert.deepEqual(entradaSemLogin({ tipo: 'conversar' }, 'coruja'), { tipo: 'ir', modo: 'vitrine' });
  assert.deepEqual(entradaSemLogin({ tipo: 'conversar' }, 'vitrine'), { tipo: 'atividade' });
  assert.deepEqual(entradaSemLogin({ tipo: 'ir', modo: 'simulacao' }, 'coruja'), { tipo: 'atividade' });
  assert.deepEqual(entradaSemLogin({ tipo: 'ir', modo: 'site' }, 'coruja'), { tipo: 'atividade' });
  assert.deepEqual(entradaSemLogin({ tipo: 'ir', modo: 'coruja' }, 'vitrine'), { tipo: 'ir', modo: 'coruja' });
  assert.deepEqual(entradaSemLogin({ tipo: 'pausar' }, 'vitrine'), { tipo: 'pausar' });
});

test('o fallback não chama a API nem importa voz, escuta ou Telas do app', async () => {
  const fonte = await ler('src/components/stand/StandSemLogin.tsx');
  assert.doesNotMatch(fonte, /fetch\(|\/api\//);
  assert.doesNotMatch(fonte, /stand-voz|TelasDoApp|SimulacaoStand|SiteStand|canalReal/);
  assert.match(AVISO_SEM_LOGIN, /sem login/);
  assert.match(AVISO_SEM_LOGIN, /Shift\+Q/);
});

test('main.tsx: só /stand sem usuário cai no fallback; o resto segue no login', async () => {
  const main = await ler('src/main.tsx');
  assert.match(main, /if \(!user && location\.kind === 'app' && location\.page === 'stand'\) \{\s*return <Suspense[^]*<StandSemLogin \/>/);
  assert.ok(main.indexOf('<StandSemLogin />') < main.indexOf('if (!user) return <AuthPage />;'));
});

test('a Coruja sem login renderiza a chamada sem voz e o aviso da equipe', async () => {
  const { createElement } = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { AppLocationProvider, StandSemLogin } = await loadFrontendModule('./stand-sem-login-entry.tsx');
  const antes = globalThis.window;
  globalThis.window = { location: { pathname: '/stand', search: '', hash: '' }, history: { replaceState() {}, pushState() {} }, addEventListener() {}, removeEventListener() {} };
  try {
    const html = renderToStaticMarkup(createElement(AppLocationProvider, null, createElement(StandSemLogin)));
    assert.match(html, /data-sem-login/);
    assert.match(html, /data-modo="coruja"/);
    assert.match(html, /data-motivo="sem_login"/);
    assert.match(html, /Toca aqui pra ver o LUCA/);
    assert.match(html, /sem login · equipe: Shift\+Q/);
    assert.doesNotMatch(html, /Simulação|>Site</);
    assert.doesNotMatch(html, /type="password"/);
  } finally {
    globalThis.window = antes;
  }
});

test('com o stand aberto, um 401 no status refaz a sessão (e o main.tsx cai no fallback)', async () => {
  const pagina = await ler('src/pages/StandPage.tsx');
  assert.match(pagina, /if \(r\.status === 401\) perdeu\.current\(\);/);
  assert.match(pagina, /useStatusStand\(!modoStub, voz\.fim, refreshSession\)/);
});
