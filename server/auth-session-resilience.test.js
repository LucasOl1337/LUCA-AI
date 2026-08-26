import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => readFileSync(join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
const useAuth = readSource('../src/hooks/useAuth.tsx');
const config = readSource('../server/config.js');

// O painel caia na tela de login sozinho: qualquer falha do /api/auth/session
// — 429 do limitador, 5xx de reinicio, rede oscilando — passava pelo mesmo
// catch e zerava o usuario, com a sessao viva por 30 dias no servidor.
test('so 401/403 derruba a sessao; falha de transporte nao zera o usuario', () => {
  assert.match(useAuth, /export function isSessionRejection\(status: number\): boolean \{\s*return status === 401 \|\| status === 403;/);
  assert.match(useAuth, /if \(isSessionRejection\(status\)\) \{[\s\S]{0,200}?setUser\(null\);/);

  const refresh = useAuth.slice(useAuth.indexOf('const refreshSession'), useAuth.indexOf('useEffect(() => {\n    void refreshSession'));
  const clears = refresh.match(/setUser\(null\)/g) || [];
  assert.equal(clears.length, 1, 'a sessao so pode ser zerada no ramo de rejeicao do servidor');
});

test('erro de autenticacao carrega o status HTTP, inclusive quando a resposta nao chega', () => {
  assert.match(useAuth, /export class AuthRequestError extends Error/);
  assert.match(useAuth, /status: number;/);
  const throws = useAuth.match(/throw new AuthRequestError\(/g) || [];
  assert.equal(throws.length, 4, 'todos os caminhos de erro do authRequest carregam status');
  assert.match(useAuth, /'O LUCA não respondeu[\s\S]{0,120}?0,\s*\n\s*\);/, 'falha de rede vira status 0');
});

test('falha de transporte reagenda a verificacao em vez de desistir', () => {
  assert.match(useAuth, /const SESSION_RETRY_DELAYS_MS = \[1_000, 3_000, 8_000, 20_000\];/);
  assert.match(useAuth, /retryTimerRef\.current = window\.setTimeout\(/);
  assert.match(useAuth, /void refreshSession\(\);/);
  assert.match(useAuth, /window\.clearTimeout\(retryTimerRef\.current\)/);
});

test('teto de requisicoes cabe no trafego que o proprio painel gera', () => {
  const match = config.match(/API_RATE_LIMIT_MAX = Number\(process\.env\.API_RATE_LIMIT_MAX \?\? (\d+)\)/);
  assert.ok(match, 'API_RATE_LIMIT_MAX precisa ter default numerico');
  // Uma aba com missao rodando faz ~50 req/min so de polling; o simulador
  // soma ~30/min. Menos de 600 estoura com poucas abas abertas.
  assert.ok(Number(match[1]) >= 600, `teto ${match[1]} e baixo para o uso normal de varias abas`);
});
