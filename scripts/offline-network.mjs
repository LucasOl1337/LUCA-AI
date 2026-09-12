// Local verification only: stop unmocked outbound fetches before they leave the process.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    return Promise.reject(new Error('offline_external_fetch_blocked'));
  }
  return nativeFetch(input, init);
};
