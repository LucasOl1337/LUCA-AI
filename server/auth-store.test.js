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

test('tracking conta prompt/rodada só no envio da bancada', () => {
  const { store } = temporaryStore();
  const account = store.register({ email: 'user@example.com', password: 'senha-forte-456' });
  // Ruído: NÃO vira prompt.
  store.recordUsage(account.user.id, { method: 'GET', path: '/api/state', statusCode: 200 });
  store.recordUsage(account.user.id, { method: 'GET', path: '/api/events?limit=120', statusCode: 200 });
  store.recordUsage(account.user.id, { method: 'PATCH', path: '/api/luca-ai/chat/sessions/sess_1', statusCode: 200 });
  store.recordUsage(account.user.id, { method: 'POST', path: '/api/agent/run', statusCode: 200 });
  store.recordUsage(account.user.id, { method: 'POST', path: '/api/supervisor/start', statusCode: 200 });
  store.recordUsage(account.user.id, { method: 'WS', path: '/ws', statusCode: 101, websocket: true });
  // 2 envios reais na bancada.
  store.recordUsage(account.user.id, { method: 'POST', path: '/api/luca-ai/persona-team/run', statusCode: 202 });
  store.recordUsage(account.user.id, { method: 'POST', path: '/api/luca-ai/persona-team/run', statusCode: 202 });
  // Write com erro (não é prompt).
  store.recordUsage(account.user.id, { method: 'POST', path: '/api/mission/context', statusCode: 422 });

  const tracked = store.listUsers()[0];
  assert.equal(tracked.promptCount, 2, 'só persona-team/run conta como prompt');
  assert.equal(tracked.requestCount, 2, 'requestCount é alias de prompt');
  assert.equal(tracked.runCount, 2, '1 prompt = 1 rodada');
  assert.equal(tracked.actionCount, 4, '2 prompts + agent/run + supervisor (erro 422 não soma ação)');
  assert.equal(tracked.errorCount, 1);
  assert.equal(tracked.websocketCount, 1);
  assert.equal(store.overview().totalRequests, 2);
  assert.equal(store.overview().totalRuns, 2);
});

test('rebaseline V3 alinha contadores ao product usage (chat-library)', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-auth-'));
  const pathAuth = path.join(directory, 'auth.json');
  try {
    fs.writeFileSync(pathAuth, JSON.stringify({
      version: 1,
      users: [{
        id: 'u1',
        name: 'Power',
        email: 'power@example.com',
        role: 'user',
        status: 'active',
        createdAt: '2026-08-01T00:00:00.000Z',
        lastSeenAt: '2026-08-11T00:00:00.000Z',
        loginCount: 3,
        passwordSalt: '00',
        passwordHash: '00',
        usage: {
          requestCount: 8785,
          actionCount: 820,
          runCount: 34,
          errorCount: 30,
          websocketCount: 12,
          lastRequestAt: '2026-08-11T00:00:00.000Z',
        },
      }],
      sessions: [],
    }, null, 2));

    const store = new AuthStore(pathAuth);
    const result = store.rebaselineProductUsageV3(() => ({ promptCount: 4 }));
    assert.equal(result.already, false);
    const user = store.listUsers()[0];
    assert.equal(user.promptCount, 4);
    assert.equal(user.requestCount, 4);
    assert.equal(user.runCount, 4);
    assert.equal(user.actionCount, 0);
    // Idempotente.
    assert.equal(store.rebaselineProductUsageV3(() => ({ promptCount: 99 })).already, true);
    assert.equal(store.listUsers()[0].promptCount, 4);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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

test('admin impersona conta e volta sem senha', () => {
  const { store, directory } = temporaryStore();
  try {
    const admin = store.register({ email: 'admin@example.com', password: 'senha-forte-123', name: 'Admin' });
    const user = store.register({ email: 'user@example.com', password: 'senha-forte-456', name: 'Cliente' });
    const loginsBefore = store.listUsers().find((row) => row.id === user.user.id)?.loginCount;

    const entered = store.impersonate({
      actorAdminId: admin.user.id,
      targetUserId: user.user.id,
      ip: '127.0.0.1',
      userAgent: 'test',
    });
    assert.equal(entered.user.id, user.user.id);
    assert.equal(entered.impersonation.active, true);
    assert.equal(entered.impersonation.actorAdminId, admin.user.id);

    const resolved = store.resolveSession(entered.token);
    assert.equal(resolved.user.id, user.user.id);
    assert.equal(resolved.impersonation.actor.email, 'admin@example.com');

    // Suporte não conta como login do cliente.
    const loginsAfter = store.listUsers().find((row) => row.id === user.user.id)?.loginCount;
    assert.equal(loginsAfter, loginsBefore);

    const restored = store.stopImpersonation(entered.token, { ip: '127.0.0.1' });
    assert.equal(restored.user.id, admin.user.id);
    assert.equal(restored.impersonation, null);
    assert.equal(store.resolveSession(entered.token), null);
    assert.equal(store.resolveSession(restored.token).user.role, 'admin');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('impersonate recusa self e conta inexistente', () => {
  const { store, directory } = temporaryStore();
  try {
    const admin = store.register({ email: 'admin@example.com', password: 'senha-forte-123' });
    assert.throws(
      () => store.impersonate({ actorAdminId: admin.user.id, targetUserId: admin.user.id }),
      /cannot_impersonate_self/,
    );
    assert.throws(
      () => store.impersonate({ actorAdminId: admin.user.id, targetUserId: 'missing' }),
      /user_not_found/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('report de admin monta funil e rankings de uso', () => {
  const { store } = temporaryStore();
  const a = store.register({ email: 'a@example.com', password: 'senha-forte-123' });
  const b = store.register({ email: 'b@example.com', password: 'senha-forte-456' });
  store.recordUsage(a.user.id, { method: 'POST', path: '/api/luca-ai/persona-team/run', statusCode: 200 });
  store.recordUsage(a.user.id, { method: 'POST', path: '/api/luca-ai/persona-team/run', statusCode: 200 });
  store.recordUsage(b.user.id, { method: 'GET', path: '/api/state', statusCode: 200 });
  store.recordUsage(b.user.id, { method: 'PATCH', path: '/api/luca-ai/chat/sessions/x', statusCode: 200 });
  const report = store.report({ limit: 5 });
  assert.equal(report.funnel.registered, 2);
  assert.equal(report.funnel.withRuns, 1);
  assert.equal(report.rankings.byRuns[0].email, 'a@example.com');
  assert.equal(report.rankings.byRuns[0].rank, 1);
  assert.equal(report.rankings.byRuns[0].promptCount, 2);
  assert.ok(report.overview.totalRuns >= 2);
  // b não enviou prompt; polling/autosave não contam.
  assert.equal(report.rankings.byRequests.find((row) => row.email === 'b@example.com')?.promptCount || 0, 0);
});

test('rejeita senha inválida, duplicidade e credenciais incorretas', () => {
  const { store } = temporaryStore();
  assert.throws(() => store.register({ email: 'x@example.com', password: 'curta' }), AuthError);
  store.register({ email: 'x@example.com', password: 'senha-forte-123' });
  assert.throws(() => store.register({ email: 'X@example.com', password: 'outra-senha-123' }), /email_already_registered/);
  assert.throws(() => store.login({ email: 'x@example.com', password: 'senha-incorreta' }), /invalid_credentials/);
});
