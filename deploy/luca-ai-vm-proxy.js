/**
 * Edge proxy for luca-ai.com.br.
 *
 * Public browser traffic hits this Worker; Express lives only on the VM
 * (127.0.0.1:4242) behind Cloudflare Tunnel. Reachability is via Workers VPC
 * (Connectivity Directory service bound to the luca-ai-production tunnel) —
 * no third-party domain hostname is involved.
 */
const CANONICAL_HOST = 'luca-ai.com.br';
const HSTS_HEADER = 'max-age=31536000';

export default {
  async fetch(request, env) {
    return proxyToLucaVm(request, env);
  },
};

async function proxyToLucaVm(request, env) {
  const incoming = new URL(request.url);
  if (incoming.protocol !== 'https:' || incoming.hostname !== CANONICAL_HOST) {
    incoming.protocol = 'https:';
    incoming.hostname = CANONICAL_HOST;
    incoming.port = '';
    return new Response(null, {
      status: 308,
      headers: {
        Location: incoming.toString(),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  if (!env?.LUCA_EXPRESS || typeof env.LUCA_EXPRESS.fetch !== 'function') {
    return new Response('LUCA_EXPRESS VPC binding missing', { status: 500 });
  }

  const publicHost = incoming.host;
  // Host/path only: VPC Service pins tunnel + 127.0.0.1:4242.
  const originUrl = new URL(request.url);
  originUrl.protocol = 'http:';
  originUrl.hostname = 'luca-ai.internal';
  originUrl.port = '';

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-Forwarded-Host', publicHost);
  requestHeaders.set('X-Forwarded-Proto', 'https');
  requestHeaders.set('Host', publicHost);

  const response = await env.LUCA_EXPRESS.fetch(
    new Request(originUrl.toString(), {
      method: request.method,
      headers: requestHeaders,
      body: request.body,
      redirect: request.redirect,
    }),
  );
  if (response.status === 101) return response;

  const headers = new Headers(response.headers);
  headers.set('X-Luca-Origin', 'vm');
  headers.set('Strict-Transport-Security', HSTS_HEADER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
