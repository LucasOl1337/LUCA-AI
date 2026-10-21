import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { precompressedModels } from './precompressed-models.js';

// Cache dos estáticos do build. Sem isto o `send` do Express põe
// `public, max-age=0` em tudo, e no quiosque cada F5 ou religação revalida
// todos os chunks (o proxy de borda e o Cloudflare repassam o header da origem).
// - /assets/<nome>-<hash>.<ext>: o Vite troca o nome a cada conteúdo novo, então
//   pode ficar um ano em cache, sem revalidar.
// - index.html (também o fallback SPA) e o sw.js: `no-cache`, sempre revalidam
//   (ETag → 304). É isso que garante que um deploy novo chega: o index novo
//   aponta para os chunks novos.
// - O resto (GLB, imagens, vídeos sem hash no nome) fica no padrão do Express.
//   GLB importado com `?url` (coruja 3D) sai em /assets/ com hash e entra no imutável.
export const CACHE_IMUTAVEL = 'public, max-age=31536000, immutable';
export const CACHE_REVALIDAR = 'no-cache';

const COM_HASH = /^assets\/[^/]+-[A-Za-z0-9_-]{8}\.(?:js|css|woff2?|ttf|png|jpe?g|svg|webp|avif|gif|wasm|glb)$/;
const REVALIDAR = /(?:^|\/)(?:index\.html|sw\.js)$/;

/** Cache-Control de um arquivo do dist (caminho relativo, com `/`), ou null para o padrão. */
export function cacheDoArquivo(relativo) {
  if (COM_HASH.test(relativo)) return CACHE_IMUTAVEL;
  if (REVALIDAR.test(relativo)) return CACHE_REVALIDAR;
  return null;
}

/** Serve o build em `root`: GLB com .br, estáticos com cache por classe e fallback SPA. */
export function servirDist(app, root) {
  const base = path.resolve(root);
  // O .br do GLB sai pelo sendFile do precompressedModels, antes do static: o cache
  // do nome com hash vai aqui, só se o arquivo existe (o fallback nunca fica imutável).
  app.use((req, res, next) => {
    if (req.path.startsWith('/assets/') && req.path.endsWith('.glb')) {
      const relativo = req.path.slice(1);
      if (cacheDoArquivo(relativo) === CACHE_IMUTAVEL && fs.existsSync(path.join(base, relativo))) res.setHeader('Cache-Control', CACHE_IMUTAVEL);
    }
    next();
  });
  app.use(precompressedModels(base));
  app.use(express.static(base, {
    redirect: false,
    setHeaders(res, arquivo) {
      const cache = cacheDoArquivo(path.relative(base, arquivo).split(path.sep).join('/'));
      if (cache) res.setHeader('Cache-Control', cache);
    },
  }));
  app.get('*splat', (_req, res) => {
    // /api/* já saiu com no-store no middleware de segurança; só o resto ganha no-cache.
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', CACHE_REVALIDAR);
    res.sendFile('index.html', { root: base });
  });
}
