// Writes Brotli siblings (model.glb.br) for every built GLB (models/ and the
// stand avatar); served by server/precompressed-models.js.
// Skips files that shrink less than 10% (GLBs with embedded JPEG/PNG textures).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(process.argv[2] || 'dist');
let before = 0, after = 0;
// Nome com hash em assets/ é hardlink da cópia fixa (urls-publicas-plugin): o .br
// também vira link do mesmo .br, sem comprimir de novo nem dobrar o dist.
const porInode = new Map();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!entry.name.endsWith('.glb')) continue;
    const { ino, dev } = fs.statSync(file);
    const irmao = porInode.get(`${dev}:${ino}`);
    if (irmao !== undefined) {
      fs.rmSync(`${file}.br`, { force: true });
      if (irmao) fs.linkSync(`${irmao}.br`, `${file}.br`);
      continue;
    }
    const data = fs.readFileSync(file);
    const packed = zlib.brotliCompressSync(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } });
    if (packed.length > data.length * 0.9) { fs.rmSync(`${file}.br`, { force: true }); porInode.set(`${dev}:${ino}`, null); continue; }
    fs.writeFileSync(`${file}.br`, packed);
    porInode.set(`${dev}:${ino}`, file);
    before += data.length; after += packed.length;
  }
}
walk(root);
console.log(`precompress-models: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB (br)`);
