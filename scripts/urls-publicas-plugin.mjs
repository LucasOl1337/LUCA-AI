import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Arquivos do public/ que o palco 3D (gameplay, /sompo) carrega por caminho fixo.
// O build dá a cada um um nome com hash em /assets/ (imutável no servidor) e o
// cliente traduz o caminho lógico por um mapa embutido no bundle (urlsPublicas.ts).
// A cópia de nome fixo continua no dist: URL antiga segue servida por pelo menos
// uma publicação (aba aberta de release anterior, cache de borda).
export const PASTAS_COM_HASH = Object.freeze(['models/gameplay', 'models/sompo', 'environments/sompo', 'sompo/gen']);
const EXTENSOES = /\.(?:glb|jpe?g|png|webp|hdr|json)$/i;

export function hashDoConteudo(conteudo) {
  return createHash('sha256').update(conteudo).digest('base64url').slice(0, 8);
}

/** Mapa `/pasta/arquivo.ext` → `/assets/arquivo-<hash>.ext` lido de `publico` (sem escrever nada). */
export function mapearUrlsPublicas(publico, pastas = PASTAS_COM_HASH) {
  const mapa = {};
  for (const pasta of pastas) {
    const dir = path.join(publico, pasta);
    if (!fs.existsSync(dir)) continue;
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entrada.isFile() || !EXTENSOES.test(entrada.name)) continue;
      const ext = path.extname(entrada.name);
      const hash = hashDoConteudo(fs.readFileSync(path.join(dir, entrada.name)));
      mapa[`/${pasta}/${entrada.name}`] = `/assets/${path.basename(entrada.name, ext)}-${hash}${ext}`;
    }
  }
  return mapa;
}

/** Põe no dist cada nome com hash como hardlink da cópia fixa (cópia se o link falhar). */
export function gravarNomesComHash(dist, mapa) {
  let ligados = 0;
  for (const [logico, comHash] of Object.entries(mapa)) {
    const origem = path.join(dist, logico);
    const destino = path.join(dist, comHash);
    if (!fs.existsSync(origem)) throw new Error(`urls-publicas: ${logico} está no mapa mas não no dist`);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.rmSync(destino, { force: true });
    try { fs.linkSync(origem, destino); } catch { fs.copyFileSync(origem, destino); }
    ligados += 1;
  }
  return ligados;
}

export function urlsPublicasPlugin() {
  let mapa = {};
  return {
    name: 'urls-publicas',
    apply: 'build',
    config(config) {
      mapa = mapearUrlsPublicas(path.resolve(config.root || process.cwd(), 'public'));
      return { define: { __URLS_PUBLICAS__: JSON.stringify(mapa) } };
    },
    writeBundle(options) {
      const n = gravarNomesComHash(options.dir, mapa);
      this.info?.(`urls-publicas: ${n} arquivos com hash em assets/`);
    },
  };
}
