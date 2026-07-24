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

test('allowlist de admin impede que outra primeira conta capture o papel', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-auth-'));
  const store = new AuthStore(path.join(directory, 'auth.json'), { adminEmails: ['owner@example.com'] });
  const visitor = store.register({ email: 'visitor@example.com', password: 'senha-forte-123' });
  const owner = store.register({ email: 'owner@example.com', password: 'senha-forte-456' });
  assert.equal(visitor.user.role, 'user');
  assert.equal(owner.user.role, 'admin');
});

test('rejeita senha inválida, duplicidade e credenciais incorretas', () => {
  const { store } = temporaryStore();
  assert.throws(() => store.register({ email: 'x@example.com', password: 'curta' }), AuthError);
  store.register({ email: 'x@example.com', password: 'senha-forte-123' });
  assert.throws(() => store.register({ email: 'X@example.com', password: 'outra-senha-123' }), /email_already_registered/);
  assert.throws(() => store.login({ email: 'x@example.com', password: 'senha-incorreta' }), /invalid_credentials/);
});
