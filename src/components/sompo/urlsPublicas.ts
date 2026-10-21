import * as THREE from 'three';

/**
 * Nome com hash dos arquivos do public/ que o palco 3D carrega (GLB, texturas,
 * HDR, manifestos). O build (scripts/urls-publicas-plugin.mjs) embute o mapa
 * `/models/gameplay/x.glb` → `/assets/x-<hash>.glb`; o servidor serve /assets/
 * com hash como imutável, então F5 no quiosque não revalida nada disso.
 *
 * O código segue usando o caminho lógico (base de texturas, `.textures.json`,
 * `.provenance.json` derivados do GLB); só a ida à rede traduz. Fora do build
 * (vite dev, testes) o mapa é vazio e o caminho fixo vale, como antes.
 */
declare const __URLS_PUBLICAS__: Record<string, string> | undefined;

const MAPA: Readonly<Record<string, string>> = typeof __URLS_PUBLICAS__ === 'undefined' ? {} : __URLS_PUBLICAS__;

export function urlPublica(url: string) {
  const fim = url.search(/[?#]/);
  const caminho = fim < 0 ? url : url.slice(0, fim);
  const comHash = MAPA[caminho];
  return comHash ? comHash + (fim < 0 ? '' : url.slice(fim)) : url;
}

// TextureLoader, HDRLoader e GLTFLoader.load passam por aqui (LoadingManager.resolveURL).
THREE.DefaultLoadingManager.setURLModifier(urlPublica);
