import test from 'node:test';
import assert from 'node:assert/strict';
import { cabecalhosDeSeguranca } from './cabecalhos-seguranca.js';

const diretivas = (caminho) => Object.fromEntries(cabecalhosDeSeguranca(caminho)['Content-Security-Policy']
  .split('; ').map((d) => { const [nome, ...valores] = d.split(' '); return [nome, valores]; }));

test('Google Fonts fica restrito a CSS e fonte, sem liberar scripts externos ou beacon', () => {
  const csp = diretivas('/stand');
  assert.deepEqual(csp['style-src'], ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']);
  assert.deepEqual(csp['font-src'], ["'self'", 'https://fonts.gstatic.com']);
  assert.deepEqual(csp['script-src'], ["'self'"]);
  assert.ok(!csp['connect-src'].some((v) => v.includes('cloudflareinsights')));
});

test('SOMPO aceita iframe da própria origem e stand/admin continuam sem moldura', () => {
  assert.deepEqual(diretivas('/sompo')['frame-ancestors'], ["'self'"]);
  assert.equal(cabecalhosDeSeguranca('/sompo')['X-Frame-Options'], 'SAMEORIGIN');
  assert.deepEqual(diretivas('/stand')['frame-ancestors'], ["'none'"]);
  assert.deepEqual(diretivas('/admin')['frame-ancestors'], ["'none'"]);
  assert.equal(cabecalhosDeSeguranca('/admin')['X-Frame-Options'], 'DENY');
});
