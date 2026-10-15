// Guarda de rede da captura do stand: como scripts/offline-network.mjs, mas
// libera hosts listados em LUCA_CAPTURA_PERMITIDOS (9Router e túnel do Kamui).
// Kamui só aceita GET daqui. Cada saída vira uma linha (sem corpo nem headers)
// em LUCA_CAPTURA_LOG_REDE, para provar no relatório o que o servidor chamou.

import { appendFileSync } from 'node:fs';

const nativeFetch = globalThis.fetch;
const locais = new Set(['127.0.0.1', 'localhost', '[::1]']);
const permitidos = new Set(
  String(process.env.LUCA_CAPTURA_PERMITIDOS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);
const kamui = String(process.env.KAMUI_BASE || '');
const log = process.env.LUCA_CAPTURA_LOG_REDE || '';

globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const metodo = String(init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  const alvo = `${url.protocol}//${url.host}`;
  const ehKamui = kamui && `${url.protocol}//${url.host}` === new URL(kamui).origin;
  const liberado = permitidos.has(url.host) || (locais.has(url.hostname) && !ehKamui) || (ehKamui && metodo === 'GET');
  if (log) {
    try {
      appendFileSync(log, `${JSON.stringify({ t: Date.now(), metodo, alvo: ehKamui ? 'kamui' : permitidos.has(url.host) ? '9router' : alvo, caminho: url.pathname, liberado })}\n`);
    } catch {}
  }
  if (!liberado) return Promise.reject(new Error('captura_fetch_bloqueado'));
  return nativeFetch(input, init);
};
