addEventListener("fetch", (event) => {
  event.respondWith(proxyToLucaVm(event.request));
});

async function proxyToLucaVm(request) {
  const target = new URL(request.url);
  const publicHost = target.host;
  target.protocol = "https:";
  target.hostname = "luca-origin.bombapvp.com";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("X-Forwarded-Host", publicHost);
  requestHeaders.set("X-Forwarded-Proto", "https");
  const response = await fetch(new Request(target.toString(), {
    method: request.method,
    headers: requestHeaders,
    body: request.body,
    redirect: request.redirect,
  }));
  if (response.status === 101) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Luca-Origin", "vm");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
