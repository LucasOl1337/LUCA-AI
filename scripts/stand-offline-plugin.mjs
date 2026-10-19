import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Inject the release identity and the built, public shell into the scoped worker. */
export function standOfflinePlugin() {
  return {
    name: 'stand-offline',
    apply: 'build',
    async writeBundle(options, bundle) {
      const version = process.env.DEPLOY_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const assets = Object.keys(bundle).filter((name) => /\.(js|css)$/.test(name)).map((name) => `/${name}`);
      const videos = JSON.parse(await readFile(new URL('../shared/stand/videos.json', import.meta.url), 'utf8')).map((video) => video.arquivo);
      const config = { version, shell: ['/stand/', '/icon-192.png', '/stand/avatar/coruja-a/coruja-a.webp', ...assets], videos };
      const source = await readFile(new URL('../public/stand/sw.js', import.meta.url), 'utf8');
      await writeFile(path.join(options.dir, 'stand/sw.js'), source.replace('__STAND_OFFLINE_CONFIG__', JSON.stringify(config)));
    },
  };
}
