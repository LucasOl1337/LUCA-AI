// Cabeçalhos de segurança por caminho. Exceções ficam restritas à página que
// precisa: /sonolencia usa a câmera; /stand usa o microfone e conversa com a
// voz ao vivo por WebSocket: Scribe Realtime da ElevenLabs ou Grok Voice da xAI.
// O /stand mostra as páginas públicas num iframe da mesma origem (Totem-Site
// Q2): só elas aceitam moldura, e só do próprio site; o resto segue DENY.
// O /stand delega a câmera ao iframe da sonolência (`allow="camera"`).
const STAND = /^\/stand\/?$/;
const SONOLENCIA = /^\/sonolencia\/?$/;
const WORKER_VISAO = /^\/assets\/drowsiness-worker-[\w-]+\.js$/;
const EMOLDURAVEL = /^\/(?:|luca-ai|sompo|laboratorio|sensor|sonolencia)\/?$/;

export function cabecalhosDeSeguranca(caminho) {
  const script = WORKER_VISAO.test(caminho) ? "'self' 'wasm-unsafe-eval'" : "'self'";
  const conexoes = STAND.test(caminho) ? "'self' ws: wss: https://api.x.ai wss://api.x.ai wss://api.elevenlabs.io" : "'self' ws: wss:";
  const permissoes = SONOLENCIA.test(caminho)
    ? 'camera=(self), microphone=(), geolocation=()'
    : STAND.test(caminho)
      ? 'camera=(self), microphone=(self), geolocation=()'
      : 'camera=(), microphone=(), geolocation=()';
  const moldura = EMOLDURAVEL.test(caminho);
  return {
    'Content-Security-Policy': `default-src 'self'; base-uri 'self'; connect-src ${conexoes}; frame-ancestors ${moldura ? "'self'" : "'none'"}; form-action 'self'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob:; object-src 'none'; script-src ${script}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': moldura ? 'SAMEORIGIN' : 'DENY',
    'Permissions-Policy': permissoes,
  };
}
