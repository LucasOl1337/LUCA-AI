addEventListener("fetch", (event) => {
  event.respondWith(proxyToLucaVm(event.request));
});

async function proxyToLucaVm(request) {
  const target = new URL(request.url);
  target.protocol = "https:";
  target.hostname = "luca-origin.bombapvp.com";

  const response = await fetch(new Request(target.toString(), request));
  if (response.status === 101) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Luca-Origin", "vm");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
