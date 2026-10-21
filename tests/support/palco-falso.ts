/**
 * Palco falso do gameplay para o e2e da feira (tests/feira-e2e.test.js): sem
 * three.js nem WebGL. O build do teste troca `createSompoAgriStage` por este
 * arquivo só quando quem importa é o GameplayKiosk. Mantém o que importa ao
 * teste: o rAF chama `cameraRig.drive`, que roda o motor e manda o retrato pelo /ws.
 */
import type { SompoCameraRig } from '@/components/sompo/sompoStage';

export function mountSompoAgriStage({ mount, cameraRig, obstaclesRef, onModelStatus }: {
  mount: HTMLElement;
  cameraRig?: SompoCameraRig;
  obstaclesRef?: { current: readonly { x: number; z: number; radius: number }[] };
  onModelStatus?: (status: 'loading' | 'gltf' | 'fallback', asset: string | null) => void;
  [outro: string]: unknown;
}) {
  mount.dataset.palco = 'falso';
  onModelStatus?.('fallback', null);
  let quadro = 0;
  let antes = performance.now();
  const passo = (agora: number) => {
    const dt = Math.max(0, (agora - antes) / 1000);
    antes = agora;
    // Aba oculta: o navegador para o rAF do palco de verdade; aqui o laço só deixa de dirigir.
    if (!document.hidden) cameraRig?.drive?.(dt, { from: { x: 0, z: 0, heading: 0 }, obstacles: [...(obstaclesRef?.current ?? [])] });
    quadro = requestAnimationFrame(passo);
  };
  quadro = requestAnimationFrame(passo);
  return {
    focus() {}, adjust() {}, recenterHeading() {},
    dispose() { cancelAnimationFrame(quadro); },
  };
}
