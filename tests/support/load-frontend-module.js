import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const publico = new URL('../../public/', import.meta.url).pathname;

// `import x from './a.glb?url'`: no build o Vite troca por `/assets/a-<hash>.glb`.
// Aqui o teste recebe o caminho público do arquivo (só a URL; nada é copiado).
const urlDoVite = {
  name: 'vite-url',
  setup(b) {
    b.onResolve({ filter: /\?url$/ }, ({ path: pedido, resolveDir }) => ({
      path: path.resolve(resolveDir, pedido.slice(0, -'?url'.length)), namespace: 'vite-url',
    }));
    b.onLoad({ filter: /.*/, namespace: 'vite-url' }, ({ path: arquivo }) => {
      if (!arquivo.startsWith(publico)) throw new Error(`?url fora de public/: ${arquivo}`);
      return { contents: `export default ${JSON.stringify(`/${path.relative(publico, arquivo)}`)};`, loader: 'js' };
    });
  },
};

// Bundle the actual TS/TSX dependency graph, keeping React shared with the renderer.
// No application hooks, components, or theme values are replaced.
// `define` simula constantes que o Vite injeta no build (ex.: o mapa de URLs com hash).
export async function loadFrontendModule(path, { define } = {}) {
  const result = await build({
    entryPoints: [new URL(path, import.meta.url).pathname],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    // Folha de estilo não muda comportamento; o Vite cuida dela no build.
    loader: { '.css': 'empty' },
    plugins: [urlDoVite],
    // `new Worker(new URL(..., import.meta.url))` é do Vite; no teste o worker é injetado.
    logOverride: { 'empty-import-meta': 'silent' },
    ...(define ? { define } : {}),
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
  );
  return module.exports;
}
