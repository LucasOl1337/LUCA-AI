import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AuthError, AuthStore } from './auth-store.js';

function temporaryStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-auth-'));
  return { store: new AuthStore(path.join(directory, 'auth.json')), directory };
}

test('primeira conta vira admin, cria sessão e persiste apenas hash da senha', () => {
  const { store, directory } = temporaryStore();
  const result = store.register({ name: 'Lucas', email: 'Lucas@Example.com', password: 'senha-forte-123' });
  assert.equal(result.user.email, 'lucas@example.com');
  assert.equal(result.user.role, 'admin');
  assert.ok(result.token);
  assert.equal(store.resolveSession(result.token)?.user.id, result.user.id);
  const raw = fs.readFileSync(path.join(directory, 'auth.json'), 'utf8');
  assert.doesNotMatch(raw, /senha-forte-123/);
});

test('contas seguintes são usuários e login incrementa tracking', () => {
  const { store } = temporaryStore();
  store.register({ email: 'admin@example.com', password: 'senha-forte-123' });
  const account = store.register({ email: 'user@example.com', password: 'senha-forte-456' });
  assert.equal(account.user.role, 'user');
  const login = store.login({ email: 'user@example.com', password: 'senha-forte-456' });
  assert.equal(login.user.loginCount, 2);
  assert.equal(store.overview().totalUsers, 2);
  assert.equal(store.listUsers()[0].email, 'user@example.com');
});

test('tracking contabiliza solicitações, ações, execuções e erros por conta', () => {
  const { store } = temporaryStore();
  const account = store.register({ email: 'user@example.com', password: 'senha-forte-456' });
  store.recordUsage(account.user.id, { method: 'GET', path: '/api/state', statusCode: 200 });
  store.recordUsage(account.user.id, { method: 'POST', path: '/api/luca-ai/persona-team/run', statusCode: 200 });
  store.recordUsage(account.user.id, { method: 'POST', path: '/api/mission/context', statusCode: 422 });
  store.recordUsage(account.user.id, { method: 'WS', path: '/ws', statusCode: 101, websocket: true });

  const tracked = store.listUsers()[0];
  assert.equal(tracked.requestCount, 4);
  assert.equal(tracked.actionCount, 2);
  assert.equal(tracked.runCount, 1);
  assert.equal(tracked.errorCount, 1);
  assert.equal(tracked.websocketCount, 1);
  assert.equal(store.overview().totalRequests, 4);
  assert.equal(store.overview().totalActions, 2);
  assert.equal(store.overview().totalRuns, 1);
});

test('allowlist de admin impede que outra primeira conta capture o papel', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-auth-'));
  const store = new AuthStore(path.join(directory, 'auth.json'), { adminEmails: ['owner@example.com'] });
  const visitor = store.register({ email: 'visitor@example.com', password: 'senha-forte-123' });
  const owner = store.register({ email: 'owner@example.com', password: 'senha-forte-456' });
  assert.equal(visitor.user.role, 'user');
  assert.equal(owner.user.role, 'admin');
});

test('allowlist promove conta existente no syncAdminRoles sem demover admins', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-auth-'));
  const pathAuth = path.join(directory, 'auth.json');
  const store = new AuthStore(pathAuth);
  const first = store.register({ email: 'first@example.com', password: 'senha-forte-123' });
  const later = store.register({ email: 'lucasplays2000@gmail.com', password: 'senha-forte-456' });
  assert.equal(first.user.role, 'admin');
  assert.equal(later.user.role, 'user');

  const promoted = new AuthStore(pathAuth, { adminEmails: ['lucasplays2000@gmail.com'] });
  const users = promoted.listUsers();
  assert.equal(users.find((user) => user.email === 'lucasplays2000@gmail.com')?.role, 'admin');
  assert.equal(users.find((user) => user.email === 'first@example.com')?.role, 'admin');
});

test('report de admin monta funil e rankings de uso', () => {
  const { store } = temporaryStore();
  const a = store.register({ email: 'a@example.com', password: 'senha-forte-123' });
  const b = store.register({ email: 'b@example.com', password: 'senha-forte-456' });
  store.recordUsage(a.user.id, { method: 'POST', path: '/api/luca-ai/persona-team/run', statusCode: 200 });
  store.recordUsage(a.user.id, { method: 'POST', path: '/api/luca-ai/persona-team/run', statusCode: 200 });
  store.recordUsage(b.user.id, { method: 'GET', path: '/api/state', statusCode: 200 });
  const report = store.report({ limit: 5 });
  assert.equal(report.funnel.registered, 2);
  assert.equal(report.funnel.withRuns, 1);
  assert.equal(report.rankings.byRuns[0].email, 'a@example.com');
  assert.equal(report.rankings.byRuns[0].rank, 1);
  assert.ok(report.overview.totalRuns >= 2);
});

test('rejeita senha inválida, duplicidade e credenciais incorretas', () => {
  const { store } = temporaryStore();
  assert.throws(() => store.register({ email: 'x@example.com', password: 'curta' }), AuthError);
  store.register({ email: 'x@example.com', password: 'senha-forte-123' });
  assert.throws(() => store.register({ email: 'X@example.com', password: 'outra-senha-123' }), /email_already_registered/);
  assert.throws(() => store.login({ email: 'x@example.com', password: 'senha-incorreta' }), /invalid_credentials/);
});
