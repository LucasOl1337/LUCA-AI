import * as THREE from 'three';

/**
 * Compila em paralelo (KHR_parallel_shader_compile) os programas de um degrau de qualidade
 * antes de o regulador chegar nele. Sem isso, a troca de degrau liga ou desliga sombra e pós,
 * e o quadro da troca para 120–180 ms compilando ~20 programas. Não desenha nada.
 */
export function prepararDegrau(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, degrau: { pos: boolean; sombras: boolean }) {
  const sombra = renderer.shadowMap.enabled, alvo = renderer.getRenderTarget();
  // Com pós, a cena vai para um alvo linear sem tone mapping; sem pós, direto para a tela.
  const temp = degrau.pos ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }) : null;
  let pronto: Promise<unknown> = Promise.resolve();
  try {
    renderer.shadowMap.enabled = degrau.sombras;
    renderer.setRenderTarget(temp);
    pronto = renderer.compileAsync(scene, camera);
  } finally {
    renderer.shadowMap.enabled = sombra;
    renderer.setRenderTarget(alvo);
    temp?.dispose();
    // compile() aponta cada material para a variante; a versão nova faz o próximo quadro voltar
    // ao programa do degrau atual, que já está no cache do material.
    scene.traverse((node) => { for (const m of materiais(node)) m.needsUpdate = true; });
  }
  return pronto.then(() => undefined, () => undefined);
}

/**
 * O shadow map compila o material de profundidade de um caster só quando ele entra no frustum
 * da sombra, já com a corrida andando (silo com textura: 70–90 ms num quadro). O WebGLShadowMap
 * copia map/alphaMap/alphaTest/lado do material para o de profundidade; aqui compilamos antes
 * cada combinação presente na cena. O cache de programas do three é por chave, então o shadow
 * map reaproveita; os materiais ficam vivos até `dispose`, que é o que mantém o programa.
 */
export function criarPreparoDeSombras(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const vistos = new Set<string>(), mats: THREE.MeshDepthMaterial[] = [];
  const geo = new THREE.PlaneGeometry(1, 1);
  /** Pode ser chamado de novo quando chegam texturas; só compila as variantes ainda não vistas. */
  function atualizar() {
  const raiz = new THREE.Group();
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.castShadow) return;
    for (const m of materiais(mesh) as THREE.MeshStandardMaterial[]) {
      // Mesmo estado que o WebGLShadowMap copia do material (lado invertido, alphaTest, map).
      const side = m.shadowSide ?? (m.side === THREE.FrontSide ? THREE.BackSide : m.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
      const alphaTest = m.alphaToCoverage ? 0.5 : m.alphaTest;
      const instanciado = (mesh as THREE.InstancedMesh).isInstancedMesh === true;
      const chave = `${side}|${alphaTest > 0}|${!!m.map}|${!!m.alphaMap}|${instanciado}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const d = new THREE.MeshDepthMaterial({ map: m.map ?? null, alphaMap: m.alphaMap ?? null, alphaTest, side });
      mats.push(d); raiz.add(instanciado ? new THREE.InstancedMesh(geo, d, 1) : new THREE.Mesh(geo, d));
    }
  });
  if (!raiz.children.length) return 0;
  // Passada de sombra grava num alvo: saída linear, sem tone mapping, como aqui.
  const alvo = renderer.getRenderTarget();
  const temp = new THREE.WebGLRenderTarget(1, 1);
  try { renderer.setRenderTarget(temp); void renderer.compileAsync(raiz, camera, scene).catch(() => undefined); }
  finally { renderer.setRenderTarget(alvo); temp.dispose(); }
  return raiz.children.length;
  }
  return { atualizar, get programas() { return mats.length; }, dispose() { mats.forEach((m) => m.dispose()); mats.length = 0; geo.dispose(); } };
}

function materiais(node: THREE.Object3D): THREE.Material[] {
  const m = (node as THREE.Mesh).material;
  return m ? (Array.isArray(m) ? m : [m]) : [];
}
