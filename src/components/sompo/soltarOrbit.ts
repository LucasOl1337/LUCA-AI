import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type OrbitInterno = { _interceptControlDown?: EventListener; _interceptControlUp?: EventListener };

/**
 * three r185: `OrbitControls` pendura um `keydown` (captura) em
 * `domElement.getRootNode()` ao conectar e tira do mesmo `getRootNode()` no
 * `dispose()`. Ao conectar o canvas está no documento; no `dispose()` vindo da
 * limpeza de um `useEffect` o React já tirou a árvore do documento, e
 * `getRootNode()` devolve a raiz solta: a remoção erra o alvo e o `document`
 * fica com o ouvinte, que prende controles, câmera e canvas.
 * Soak do item 5 (21/10): +1 `document:keydown` a cada Iniciar/Encerrar do /gameplay.
 *
 * Chamar no lugar de `orbit.dispose()`: descarta e tira os ouvintes do
 * `ownerDocument`, que é o documento mesmo com o canvas fora dele.
 */
export function soltarOrbit(orbit: OrbitControls) {
  const canvas = orbit.domElement as HTMLElement | null;
  orbit.dispose();
  if (!canvas) return;
  const { _interceptControlDown: desce, _interceptControlUp: sobe } = orbit as unknown as OrbitInterno;
  const documento = canvas.ownerDocument;
  if (desce) documento.removeEventListener('keydown', desce, { capture: true });
  if (sobe) documento.removeEventListener('keyup', sobe, { capture: true });
}
