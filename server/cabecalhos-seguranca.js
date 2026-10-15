// Cabeçalhos de segurança por caminho. Exceções ficam restritas à página que
// precisa: /sonolencia usa a câmera; /stand usa o microfone e conversa com a
// voz ao vivo da xAI (Grok Voice) por WebSocket.
const STAND = /^\/stand\/?$/;
const SONOLENCIA = /^\/sonolencia\/?$/;
const WORKER_VISAO = /^\/assets\/drowsiness-worker-[\w-]+\.js$/;

export function cabecalhosDeSeguranca(caminho) {
  const script = WORKER_VISAO.test(caminho) ? "'self' 'wasm-unsafe-eval'" : "'self'";
  const conexoes = STAND.test(caminho) ? "'self' ws: wss: https://api.x.ai wss://api.x.ai" : "'self' ws: wss:";
  const permissoes = SONOLENCIA.test(caminho)
    ? 'camera=(self), microphone=(), geolocation=()'
    : STAND.test(caminho)
      ? 'camera=(), microphone=(self), geolocation=()'
      : 'camera=(), microphone=(), geolocation=()';
  return {
    'Content-Security-Policy': `default-src 'self'; base-uri 'self'; connect-src ${conexoes}; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; object-src 'none'; script-src ${script}; style-src 'self' 'unsafe-inline'`,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': permissoes,
  };
}
