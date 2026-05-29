import test from 'node:test';
import assert from 'node:assert/strict';

import * as kamui from './kamui-client.js';

// Mock de fetch que registra cada chamada e devolve um envelope KamuiCallResult.
function installFetchMock(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const { status = 200, body = {} } = handler(String(url), init) || {};
    return {
      ok: status >= 200 && status < 300,
      status,
      async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
    };
  };
  return calls;
}

function envelope(data, extra = {}) {
  return { body: { ok: true, tether: 'yume', endpoint: '/api/...', status: 200, data, elapsed_ms: 3, ...extra } };
}

test('kamui-client expoe APENAS helpers de leitura (read-only sobre o Yume)', () => {
  const fnNames = Object.keys(kamui).filter((k) => typeof kamui[k] === 'function' && k !== 'KamuiError');
  const expected = ['listYumePersonas', 'fetchYumePersona', 'fetchYumePersonaSystemPrompt', 'getYumePersonaVersion', 'isKamuiReachable'];
  assert.deepEqual(fnNames.sort(), expected.sort());
  // Nenhum helper sugere escrita no Yume.
  for (const name of fnNames) {
    assert.ok(!/create|update|delete|put|post|write|save/i.test(name), `helper ${name} nao deve implicar escrita`);
  }
});

test('listYumePersonas faz GET via Kamui e desembrulha data.personas', async () => {
  const calls = installFetchMock(() => envelope({ personas: [{ slug: 'maestro', name: 'Maestro' }] }));
  const personas = await kamui.listYumePersonas();
  assert.equal(personas.length, 1);
  assert.equal(personas[0].slug, 'maestro');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/kamui\/yume\/personas$/);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['X-Kamui-Caller'], 'luca');
});

test('fetchYumePersonaSystemPrompt retorna o system_prompt do envelope', async () => {
  const calls = installFetchMock(() => envelope({ slug: 'maestro', name: 'Maestro', model: 'cx/gpt-5.5', system_prompt: 'Voce e o Maestro.' }));
  const data = await kamui.fetchYumePersonaSystemPrompt('maestro');
  assert.equal(data.system_prompt, 'Voce e o Maestro.');
  assert.match(calls[0].url, /\/kamui\/yume\/personas\/maestro\/system-prompt$/);
  assert.equal(calls[0].init.method, 'GET');
});

test('getYumePersonaVersion retorna version/updated_at', async () => {
  installFetchMock(() => envelope({ slug: 'maestro', version: 7, updated_at: '2026-05-29' }));
  const v = await kamui.getYumePersonaVersion('maestro');
  assert.equal(v.version, 7);
});

test('todas as chamadas Yume usam GET (nunca escrevem)', async () => {
  const calls = installFetchMock(() => envelope({ personas: [], slug: 'x', version: 1, system_prompt: '' }));
  await kamui.listYumePersonas();
  await kamui.fetchYumePersona('x');
  await kamui.fetchYumePersonaSystemPrompt('x');
  await kamui.getYumePersonaVersion('x');
  assert.ok(calls.length >= 4);
  for (const c of calls) {
    assert.equal(c.init.method, 'GET', `chamada para ${c.url} deveria ser GET`);
    assert.match(c.url, /\/kamui\/yume\//);
  }
});

test('envelope ok:false vira KamuiError', async () => {
  installFetchMock(() => ({ status: 200, body: { ok: false, error: 'persona nao encontrada', status: 404 } }));
  await assert.rejects(() => kamui.fetchYumePersona('inexistente'), (e) => {
    assert.ok(e instanceof kamui.KamuiError);
    assert.match(e.message, /persona nao encontrada/);
    return true;
  });
});

test('HTTP != 2xx vira KamuiError com status', async () => {
  installFetchMock(() => ({ status: 502, body: { ok: false } }));
  await assert.rejects(() => kamui.listYumePersonas(), (e) => {
    assert.ok(e instanceof kamui.KamuiError);
    assert.equal(e.status, 502);
    return true;
  });
});

test('isKamuiReachable nao lanca em falha', async () => {
  installFetchMock(() => { throw new Error('connrefused'); });
  const reachable = await kamui.isKamuiReachable(200);
  assert.equal(reachable, false);
});
