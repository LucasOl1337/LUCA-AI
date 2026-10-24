import fs from 'node:fs';
import path from 'node:path';

/** Extensões com irmão `.br` (scripts/precompress-models.mjs) e o tipo do original. */
export const TIPOS_PRECOMPRIMIDOS = Object.freeze({ '.glb': 'model/gltf-binary', '.hdr': 'image/vnd.radiance' });

/**
 * Serve `model.glb.br` for `model.glb` (e `ceu.hdr.br` para `ceu.hdr`) when the client accepts Brotli.
 * GLB vertex data is uncompressed floats (the jacaranda LOD drops from 12.4 MB
 * to 5.4 MB); neither Express nor the edge compresses model/gltf-binary.
 * The .br siblings are written by scripts/precompress-models.mjs after the build.
 */
export function precompressedModels(root) {
  const base = path.resolve(root);
  return (req, res, next) => {
    const tipo = TIPOS_PRECOMPRIMIDOS[path.extname(req.path)];
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !tipo) return next();
    res.vary('Accept-Encoding');
    if (!/(^|[\s,])br(\s*;|\s*,|\s*$)/.test(String(req.headers['accept-encoding'] || ''))) return next();
    let file;
    try { file = path.resolve(base, `.${decodeURIComponent(req.path)}`); } catch { return next(); }
    if (!file.startsWith(base + path.sep) || !fs.existsSync(`${file}.br`)) return next();
    res.setHeader('Content-Encoding', 'br');
    res.setHeader('Content-Type', tipo);
    // `root` limita a regra de dotfile do `send` ao trecho servido: sem ele, um dist
    // dentro de pasta com ponto (~/.algo/...) dava 404 aqui. Na falha, o original
    // segue sem o cabeçalho br; antes ele saía cru rotulado como Brotli.
    res.sendFile(`${path.relative(base, file)}.br`, { root: base }, (error) => {
      if (!error || res.headersSent) return;
      res.removeHeader('Content-Encoding');
      res.removeHeader('Content-Type');
      next();
    });
  };
}
