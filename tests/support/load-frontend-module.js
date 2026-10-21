import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Bundle the actual TS/TSX dependency graph, keeping React shared with the renderer.
// No application hooks, components, or theme values are replaced.
export async function loadFrontendModule(path) {
  const result = await build({
    entryPoints: [new URL(path, import.meta.url).pathname],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    // Folha de estilo não muda comportamento; o Vite cuida dela no build.
    loader: { '.css': 'empty' },
    // `new Worker(new URL(..., import.meta.url))` é do Vite; no teste o worker é injetado.
    logOverride: { 'empty-import-meta': 'silent' },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
  );
  return module.exports;
}
