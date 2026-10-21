import type * as THREE from 'three';

/**
 * three r185: a textura `DFG_LUT` dos materiais físicos (Standard/Physical) é
 * um singleton do módulo. Cada WebGLRenderer que desenha um desses materiais
 * pendura nela um ouvinte `dispose` que fecha sobre o renderer inteiro, e
 * `renderer.dispose()` não tira esse ouvinte. Resultado: todo palco ou coruja
 * desmontado fica preso para sempre, com programas, canvas e contexto
 * (soak de 20/10 no /stand: 20 renderers soltos e 16 contextos vivos em 8 min).
 *
 * Disparar o `dispose` da LUT faz cada renderer soltar o seu ouvinte. Os que
 * seguem vivos reenviam a textura 16x16 no próximo quadro e voltam a ouvir.
 *
 * Chamar no começo do `dispose` do dono, antes de liberar os materiais: a LUT
 * é achada nas propriedades que o renderer guardou para eles.
 */
let lut: THREE.Texture | null = null;

function acharLut(renderer: THREE.WebGLRenderer, raiz: THREE.Object3D): THREE.Texture | null {
  let achada: THREE.Texture | null = null;
  raiz.traverse((no) => {
    if (achada) return;
    const material = (no as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) {
      const uniforms = (renderer.properties.get(m) as { uniforms?: Record<string, { value?: unknown }> }).uniforms;
      const valor = uniforms?.dfgLUT?.value as THREE.Texture | undefined;
      if (valor?.isTexture) { achada = valor; return; }
    }
  });
  return achada;
}

export function soltarLutCompartilhada(renderer: THREE.WebGLRenderer, raiz: THREE.Object3D) {
  lut ??= acharLut(renderer, raiz);
  lut?.dispose();
}
