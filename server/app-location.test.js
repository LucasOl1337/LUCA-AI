import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatAppUrl,
  mergeAppLocation,
  parseAppLocation,
  getSompoView,
} from '../shared/app-location.js';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../src/hooks/useAuth.tsx', import.meta.url), 'utf8');

test('barra inicial fica limpa e / de ontem continua início', () => {
  assert.equal(formatAppUrl({ kind: 'app', page: 'inicio' }), '/');
  assert.equal(parseAppLocation('/').page, 'inicio');
  assert.equal(parseAppLocation('/').kind, 'app');
  assert.equal(parseAppLocation('').page, 'inicio');
});

test('páginas viram path legível e path desconhecido não quebra', () => {
  assert.equal(formatAppUrl({ page: 'luca-ai' }), '/luca-ai');
  assert.equal(formatAppUrl({ page: 'personas' }), '/personas');
  assert.equal(formatAppUrl({ page: 'configuracao' }), '/configuracao');
  assert.equal(formatAppUrl({ page: 'sompo' }), '/sompo');
  assert.equal(formatAppUrl({ page: 'admin' }), '/admin');
  assert.equal(parseAppLocation('/personas/').page, 'personas');
  assert.equal(parseAppLocation('/sompo/?aba=casos').page, 'sompo');
  assert.equal(parseAppLocation('/sompo/?aba=casos').aba, 'casos');
  assert.equal(parseAppLocation('/inicio').page, 'inicio');
  assert.equal(parseAppLocation('/nao-existe').page, 'inicio');
});

test('valor padrão some; filtro e busca aparecem com nome de gente', () => {
  assert.equal(formatAppUrl({ page: 'personas', filtro: 'all', busca: '' }), '/personas');
  assert.equal(
    formatAppUrl({ page: 'personas', filtro: 'principais', busca: 'juiz' }),
    '/personas?busca=juiz&filtro=principais',
  );
  const parsed = parseAppLocation('/personas?busca=juiz&filtro=ativadas');
  assert.equal(parsed.busca, 'juiz');
  assert.equal(parsed.filtro, 'ativadas');
});

test('SOMPO, admin, configuração e bancada serializam só o que não é default', () => {
  assert.equal(formatAppUrl({ page: 'sompo' }), '/sompo');
  assert.equal(
    formatAppUrl({
      page: 'sompo',
      aba: 'casos',
      produto: 'penhor',
      gravidade: 'alta',
      caso: 'penhor-trator-incendio',
    }),
    '/sompo?aba=casos&produto=penhor&gravidade=alta&caso=penhor-trator-incendio',
  );
  assert.equal(formatAppUrl({ page: 'sompo', fonte: 'simulacao' }), '/sompo?fonte=simulacao');
  assert.equal(formatAppUrl({ page: 'admin', ordem: 'recente' }), '/admin');
  assert.equal(formatAppUrl({ page: 'admin', ordem: 'prompts', busca: 'ana' }), '/admin?busca=ana&ordem=prompts');
  assert.equal(formatAppUrl({ page: 'configuracao', tipo: 'team' }), '/configuracao');
  assert.equal(formatAppUrl({ page: 'configuracao', tipo: 'individual', novo: true }), '/configuracao?tipo=individual&novo=1');
  assert.equal(formatAppUrl({ page: 'luca-ai', aba: 'atividade', sessao: 'abc' }), '/luca-ai?sessao=abc&aba=atividade');
  assert.equal(formatAppUrl({ page: 'luca-ai', modo: 'individual' }), '/luca-ai?modo=individual');
});

test('toda tela alcançável redonda no parser sem perder o endereço', () => {
  const screens = [
    ['/', '/'],
    ['/cadastro', '/cadastro'],
    ['/entrar', '/'],
    ['/personas', '/personas'],
    ['/personas?filtro=principais', '/personas?filtro=principais'],
    ['/personas?busca=juiz&filtro=principais', '/personas?busca=juiz&filtro=principais'],
    ['/personas?filtro=ativadas', '/personas?filtro=ativadas'],
    ['/configuracao', '/configuracao'],
    ['/configuracao?tipo=individual', '/configuracao?tipo=individual'],
    ['/configuracao?novo=1', '/configuracao?novo=1'],
    ['/configuracao?tipo=individual&modelo=risco-agro', '/configuracao?tipo=individual&modelo=risco-agro'],
    ['/sompo', '/sompo'],
    ['/sompo?aba=telemetria', '/sompo?aba=telemetria'],
    ['/sompo?aba=telemetria&fonte=simulacao', '/sompo?aba=telemetria&fonte=simulacao'],
    ['/sompo?fonte=simulacao', '/sompo?fonte=simulacao'],
    ['/sompo?aba=casos', '/sompo?aba=casos'],
    ['/sompo?aba=casos&produto=penhor&gravidade=alta&caso=penhor-trator-incendio', '/sompo?aba=casos&produto=penhor&gravidade=alta&caso=penhor-trator-incendio'],
    ['/luca-ai', '/luca-ai'],
    ['/luca-ai?modo=individual', '/luca-ai?modo=individual'],
    ['/luca-ai?sessao=abc&aba=atividade&modo=individual', '/luca-ai?sessao=abc&aba=atividade&modo=individual'],
    ['/admin', '/admin'],
    ['/admin?busca=ana&ordem=prompts', '/admin?busca=ana&ordem=prompts'],
    ['/admin?conta=u1&sessao=s1', '/admin?conta=u1&sessao=s1'],
    ['/leitura/token-publico', '/leitura/token-publico'],
  ];
  for (const [href, expected] of screens) {
    assert.equal(formatAppUrl(parseAppLocation(href)), expected, href);
  }
});

test('entrada SOMPO distingue hero, áreas explícitas e links antigos', () => {
  assert.equal(getSompoView(parseAppLocation('/sompo')), 'welcome');
  assert.equal(getSompoView(parseAppLocation('/sompo?aba=telemetria')), 'telemetry');
  assert.equal(getSompoView(parseAppLocation('/sompo?aba=casos')), 'cases');
  assert.equal(getSompoView(parseAppLocation('/sompo?fonte=simulacao')), 'telemetry');
  assert.equal(getSompoView(parseAppLocation('/sompo?caso=penhor-trator-incendio')), 'cases');
  assert.equal(getSompoView(parseAppLocation('/sompo?produto=penhor')), 'cases');
  assert.equal(getSompoView(parseAppLocation('/sompo?aba=invalida')), 'welcome');
});

test('produto aceita id antigo e escreve o apelido curto', () => {
  const parsed = parseAppLocation('/sompo?produto=agricola-produtividade');
  assert.equal(parsed.produto, 'produtividade');
  assert.equal(formatAppUrl({ page: 'sompo', produto: parsed.produto }), '/sompo?produto=produtividade');
});

test('ordem aceita o valor antigo da API sem quebrar o link', () => {
  const parsed = parseAppLocation('/admin?ordem=activity_desc');
  assert.equal(parsed.ordem, 'recente');
  assert.equal(formatAppUrl({ page: 'admin', ordem: parsed.ordem }), '/admin');
});

test('leitura pública e cadastro continuam nos paths de ontem', () => {
  assert.equal(parseAppLocation('/leitura/token-publico').kind, 'leitura');
  assert.equal(parseAppLocation('/leitura/token-publico').leituraToken, 'token-publico');
  assert.equal(formatAppUrl({ kind: 'leitura', leituraToken: 'a/b' }), '/leitura/a%2Fb');
  assert.equal(parseAppLocation('/cadastro').kind, 'auth');
  assert.equal(parseAppLocation('/cadastro').authMode, 'register');
  assert.equal(formatAppUrl({ kind: 'auth', authMode: 'register' }), '/cadastro');
  assert.equal(formatAppUrl({ kind: 'auth', authMode: 'login' }), '/');
  assert.equal(parseAppLocation('/entrar').kind, 'auth');
});

test('trocar de página zera query da tela anterior', () => {
  const from = parseAppLocation('/personas?busca=juiz&filtro=principais');
  const next = mergeAppLocation(from, { page: 'sompo' });
  assert.equal(next.page, 'sompo');
  assert.equal(next.busca, '');
  assert.equal(next.filtro, 'all');
  assert.equal(formatAppUrl(next), '/sompo');
});

test('filtro na mesma página preserva o resto do endereço', () => {
  const from = parseAppLocation('/sompo?aba=casos&produto=penhor');
  const next = mergeAppLocation(from, { gravidade: 'alta' });
  assert.equal(formatAppUrl(next), '/sompo?aba=casos&produto=penhor&gravidade=alta');
});

test('App lê a barra em vez de luca.activePage', () => {
  assert.match(app, /useAppLocation/);
  assert.doesNotMatch(app, /usePersistentState/);
  assert.doesNotMatch(app, /luca\.activePage/);
  assert.match(main, /AppLocationProvider/);
  assert.match(auth, /location\.assign\('\/luca-ai'\)/);
  assert.match(auth, /location\.assign\('\/admin'\)/);
  assert.doesNotMatch(auth, /luca\.activePage/);
});
