/**
 * Cenário estático da serra: luz, céu (HDRI CC0 do palco SOMPO), névoa, pista,
 * faixas, guard-rail, encostas, cascalho da área de escape, árvores e placas.
 */
import * as THREE from 'three';
import { createSompoEnvironmentAssets } from '../sompo/createSompoEnvironmentAssets';
import { geometriaFaixas, geometriasDaPista, guardRail } from './geometriaSerra';
import { GUARD_RAIL_M, pontoLateral, SERRA, type PistaSerra } from './pistaSerra';

function placa(texto: string[], fundo: string, cor: string, losango = false) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const g = canvas.getContext('2d')!;
  g.fillStyle = fundo;
  if (losango) { g.beginPath(); g.moveTo(128, 6); g.lineTo(250, 128); g.lineTo(128, 250); g.lineTo(6, 128); g.closePath(); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 8; g.stroke(); }
  else { g.fillRect(0, 40, 256, 176); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 48, 240, 160); }
  g.fillStyle = cor; g.textAlign = 'center'; g.textBaseline = 'middle';
  texto.forEach((t, i) => { g.font = `bold ${t.length > 9 ? 30 : 40}px system-ui, sans-serif`; g.fillText(t, 128, 128 + (i - (texto.length - 1) / 2) * 44); });
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export function montarCenarioSerra(scene: THREE.Scene, renderer: THREE.WebGLRenderer, pista: PistaSerra) {
  const descartaveis: { dispose(): void }[] = [];
  const guarda = <T extends { dispose(): void }>(x: T) => { descartaveis.push(x); return x; };
  scene.fog = new THREE.Fog(0xb9c7c9, 90, 520);
  scene.background = new THREE.Color(0xa9c3d3);
  const hemi = new THREE.HemisphereLight(0xdbe8f2, 0x4b5a3a, 1.1); scene.add(hemi);
  const sol = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03;
  scene.add(sol, sol.target);
  const ambiente = createSompoEnvironmentAssets(scene, renderer, { intensity: 0.7 });

  const g = geometriasDaPista(pista);
  const mat = (cor: number, rugosidade = 0.95) => guarda(new THREE.MeshStandardMaterial({ color: cor, roughness: rugosidade }));
  const asfalto = mat(0x5a5c5e, 0.9), terra = mat(0x8a7a5e), mato = mat(0x56693e), vale = mat(0x4f6538), cascalho = mat(0xa39a87);
  ambiente.surface(asfalto, 'asphalt', 1, 1);
  ambiente.surface(terra, 'dirt', 1, 1);
  ambiente.surface(mato, 'grass', 6, 1); ambiente.surface(vale, 'grass', 8, 1);
  ambiente.surface(cascalho, 'dirt', 2, 1, { normalScale: 1.6 });
  for (const [geo, m, nome] of [[g.acostamento, terra, 'acostamento'], [g.asfalto, asfalto, 'asfalto'], [g.barranco, mato, 'barranco'], [g.vale, vale, 'vale'], [g.cascalho, cascalho, 'area-escape']] as const) {
    const mesh = new THREE.Mesh(guarda(geo), m); mesh.name = `serra-${nome}`; mesh.receiveShadow = true; scene.add(mesh);
  }
  const f = geometriaFaixas(pista);
  const branca = guarda(new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.6 })), amarela = guarda(new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.6 }));
  for (const geo of f.brancas) scene.add(new THREE.Mesh(guarda(geo), branca));
  for (const geo of f.amarelas) scene.add(new THREE.Mesh(guarda(geo), amarela));
  scene.add(guardRail(pista, guarda(new THREE.MeshStandardMaterial({ color: 0xc9ced2, metalness: 0.7, roughness: 0.35 })), guarda(new THREE.MeshStandardMaterial({ color: 0x6d7175, roughness: 0.7 }))));

  // Árvores: dois planos cruzados por instância, uma malha por textura CC0 (tree-0..4).
  const cruzado = (() => {
    const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), b = a.clone().rotateY(Math.PI / 2);
    const geo = new THREE.BufferGeometry();
    const pos = [...a.attributes.position.array, ...b.attributes.position.array], uv = [...a.attributes.uv.array, ...b.attributes.uv.array];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]); geo.computeVertexNormals();
    return guarda(geo);
  })();
  const loader = new THREE.TextureLoader();
  let semente = 7; const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let k = 0; k < 5; k += 1) {
    const map = guarda(loader.load(`/environments/sompo/tree-${k}.png`)); map.colorSpace = THREE.SRGBColorSpace;
    const arvores = new THREE.InstancedMesh(cruzado, guarda(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 })), 70);
    for (let i = 0; i < 70; i += 1) {
      const s = rnd() * pista.comprimentoM, esquerda = rnd() < 0.55;
      let lateral = esquerda ? -(GUARD_RAIL_M + 4 + rnd() * 50) : GUARD_RAIL_M + 9 + rnd() * 80;
      if (!esquerda && s > SERRA.escape.s0 - 10 && s < SERRA.escape.s1 + 10) lateral += 14;
      const p = pontoLateral(pista, s, lateral);
      const dy = esquerda ? Math.min(8, (-lateral - GUARD_RAIL_M) * 0.45) : -Math.min(14, (lateral - GUARD_RAIL_M) * 0.3);
      const h = 7 + rnd() * 9;
      arvores.setMatrixAt(i, m4.compose(v.set(p.x, p.y + dy - 0.3, p.z), q.setFromAxisAngle(sc.set(0, 1, 0), rnd() * Math.PI), sc.set(h * 0.8, h, h * 0.8)));
    }
    arvores.castShadow = true; scene.add(arvores);
  }

  // Placas à direita da pista: animal, serra/freio-motor, área de escape e chegada.
  const placas: [number, string[], string, string, boolean][] = [
    [SERRA.animalS - 160, ['ANIMAIS', 'NA PISTA'], '#f4c21b', '#111', true],
    [SERRA.descida.s0 - 50, ['SERRA', 'USE O', 'FREIO-MOTOR'], '#1e5aa8', '#fff', false],
    [SERRA.escape.s0 - 150, ['ÁREA DE', 'ESCAPE', '150 m →'], '#1f7a3a', '#fff', false],
    [SERRA.escape.s0 - 25, ['ÁREA DE', 'ESCAPE →'], '#1f7a3a', '#fff', false],
    [SERRA.chegadaS - 5, ['PÉ DA SERRA', 'CHEGADA'], '#2b2b2b', '#fff', false],
  ];
  const poste = guarda(new THREE.CylinderGeometry(0.05, 0.05, 2.4).translate(0, 1.2, 0)), posteMat = mat(0x8a8f94, 0.5);
  for (const [s, texto, fundo, cor, losango] of placas) {
    const p = pontoLateral(pista, s, GUARD_RAIL_M + 1.1);
    const grupo = new THREE.Group(); grupo.position.set(p.x, p.y, p.z); grupo.rotation.y = p.rumo - Math.PI / 2;
    grupo.add(new THREE.Mesh(poste, posteMat));
    const chapa = new THREE.Mesh(guarda(new THREE.PlaneGeometry(1.7, 1.7)), guarda(new THREE.MeshStandardMaterial({ map: guarda(placa(texto, fundo, cor, losango)), transparent: true, alphaTest: 0.1, roughness: 0.5 })));
    chapa.position.y = 2.6; grupo.add(chapa); scene.add(grupo);
  }

  return {
    /** Sombra acompanha o caminhão (um mapa de 60 m em vez da serra inteira). */
    seguir(x: number, y: number, z: number) {
      sol.position.set(x - 40, y + 70, z + 30); sol.target.position.set(x, y, z); sol.target.updateMatrixWorld();
    },
    dispose() { ambiente.dispose(); for (const d of descartaveis) d.dispose(); },
  };
}
