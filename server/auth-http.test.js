import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createAuthService } from './auth.js';

test('fluxo HTTP protege API e libera painel para a primeira conta admin', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-auth-http-'));
  const app = express();
  app.use(express.json());
  const auth = createAuthService({ dataPath: path.join(directory, 'auth.json') });
  auth.registerRoutes(app);
  app.use('/api', auth.requireUser);
  auth.registerAdminRoutes(app);
  app.get('/api/private', (req, res) => res.json({ ok: true, userId: req.auth.user.id }));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => {
    server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const unauthorized = await fetch(`${baseUrl}/api/private`);
  assert.equal(unauthorized.status, 401);

  const crossSiteRegister = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ email: 'evil@example.com', password: 'senha-segura-123' }),
  });
  assert.equal(crossSiteRegister.status, 403);

  const forwardedRegister = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://luca-ai.com.br',
      host: 'luca-ai.internal',
      'cf-ray': 'test-ray',
      'x-forwarded-host': 'luca-ai.com.br',
    },
    body: JSON.stringify({ name: 'Proxy', email: 'invalido', password: 'senha-segura-123' }),
  });
  assert.equal(forwardedRegister.status, 400);

  const registered = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'admin@luca.test', password: 'senha-segura-123' }),
  });
  assert.equal(registered.status, 201);
  assert.equal((await registered.clone().json()).user.role, 'admin');
  const cookie = registered.headers.get('set-cookie').split(';')[0];

  const privateResponse = await fetch(`${baseUrl}/api/private`, { headers: { cookie } });
  assert.equal(privateResponse.status, 200);
  const usersResponse = await fetch(`${baseUrl}/api/admin/users`, { headers: { cookie } });
  assert.equal(usersResponse.status, 200);
  const usersPayload = await usersResponse.json();
  assert.equal(usersPayload.users.length, 1);
  assert.equal(usersPayload.users.find((user) => user.email === 'admin@luca.test').requestCount, 1);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(logout.status, 200);
});
