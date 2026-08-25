import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatAppUrl,
  mergeAppLocation,
  parseAppLocation,
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
    formatAppUrl({ page: 'personas', filtro: 'oficiais', busca: 'juiz' }),
    '/personas?busca=juiz&filtro=oficiais',
  );
  const parsed = parseAppLocation('/personas?busca=juiz&filtro=secundarias');
  assert.equal(parsed.busca, 'juiz');
  assert.equal(parsed.filtro, 'secundarias');
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
  const from = parseAppLocation('/personas?busca=juiz&filtro=oficiais');
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
