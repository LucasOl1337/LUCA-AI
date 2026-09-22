import fs from 'node:fs';
import path from 'node:path';

/**
 * Serve `model.glb.br` for `model.glb` when the client accepts Brotli.
 * GLB vertex data is uncompressed floats (the jacaranda LOD drops from 12.4 MB
 * to 5.4 MB); neither Express nor the edge compresses model/gltf-binary.
 * The .br siblings are written by scripts/precompress-models.mjs after the build.
 */
export function precompressedModels(root) {
  const base = path.resolve(root);
  return (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !req.path.endsWith('.glb')) return next();
    res.vary('Accept-Encoding');
    if (!/(^|[\s,])br(\s*;|\s*,|\s*$)/.test(String(req.headers['accept-encoding'] || ''))) return next();
    let file;
    try { file = path.resolve(base, `.${decodeURIComponent(req.path)}`); } catch { return next(); }
    if (!file.startsWith(base + path.sep) || !fs.existsSync(`${file}.br`)) return next();
    res.setHeader('Content-Encoding', 'br');
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.sendFile(`${file}.br`, (error) => { if (error && !res.headersSent) next(); });
  };
}
