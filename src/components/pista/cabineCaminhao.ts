/**
 * Interior da cabine do caminhão (cara-chata) para a vista em primeira pessoa da serra.
 *
 * Coordenadas do modelo SOMPO (createSompoTruckModel): +X frente, +Y cima, +Z direita,
 * chão em y=0; cabine de x 1,55 a 4,35, para-brisa de (4,20; 2,46) a (3,72; 3,38),
 * meia largura 1,05. O grupo entra na `pose` com o mesmo deslocamento do modelo
 * (y = -SOMPO_TRUCK_PIVOT_Y), então balança, inclina e tomba junto.
 *
 * Painel e volante são procedurais; o volante do Tripo (o mesmo da cabine do trator)
 * substitui o aro procedural quando carrega. Mostrador e tela do radar são canvas
 * redesenhados a ~10 Hz com o `RetratoPista`.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { carregarPropTripo, PROPS_CABINE_URL } from '../gameplay/visual/cabineMax';
import { SOMPO_TRUCK_PIVOT_Y } from '../sompo/createSompoTruckModel';
import { CAMINHAO } from './fisicaCaminhao';
import type { RetratoPista } from './corridaPista';

/** Olho do motorista (banco da esquerda) e volante, no referencial do modelo. */
export const ENCAIXE_CAMINHAO = Object.freeze({
  olho: [3.0, 2.8, -0.55] as const,
  /** Olhar parado: um pouco para baixo, para o painel e o volante entrarem na borda de baixo. */
  inclinacaoOlhar: -0.12,
  fov: 66,
  volante: { centro: [3.45, 2.3, -0.55] as const, raio: 0.25, inclinacao: 0.58 },
  /** Volante gira mais que a roda (caixa de direção): 1 de esterço pleno = ~1,4 volta. */
  giroVolante: 8.5,
  meiaLargura: 1.03,
});

const MEIA = ENCAIXE_CAMINHAO.meiaLargura;

function material(cor: number, rugosidade = 0.82, metal = 0) {
  return new THREE.MeshStandardMaterial({ color: cor, roughness: rugosidade, metalness: metal });
}

function caixa(pai: THREE.Object3D, tamanho: [number, number, number], posicao: [number, number, number], mat: THREE.Material, raio = 0) {
  const geo = raio > 0 ? new RoundedBoxGeometry(...tamanho, 2, raio) : new THREE.BoxGeometry(...tamanho);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...posicao);
  pai.add(mesh);
  return mesh;
}

/** Barra entre dois pontos (coluna A, braço do retrovisor, palheta). */
function barra(pai: THREE.Object3D, de: THREE.Vector3, ate: THREE.Vector3, largura: number, profundidade: number, mat: THREE.Material) {
  const eixo = new THREE.Vector3().subVectors(ate, de);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(largura, eixo.length(), profundidade, 2, Math.min(largura, profundidade) * 0.4), mat);
  mesh.position.copy(de).addScaledVector(eixo, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eixo.normalize());
  pai.add(mesh);
  return mesh;
}

/** Plano de canvas virado para o olho do motorista. */
function tela(pai: THREE.Object3D, largura: number, altura: number, centro: [number, number, number], px: [number, number]) {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = px;
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(largura, altura), new THREE.MeshBasicMaterial({ map: textura, toneMapped: false }));
  mesh.position.set(...centro);
  // Matrix4.lookAt põe +Z no sentido do olho (Object3D.lookAt usaria coordenadas do mundo).
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(...ENCAIXE_CAMINHAO.olho), mesh.position, new THREE.Vector3(0, 1, 0)));
  pai.add(mesh);
  return { canvas, textura, ctx: canvas.getContext('2d', { willReadFrequently: true }), mesh };
}

/** Painel visto de lado (XY), extrudado na largura da cabine. */
function geometriaPainel() {
  const perfil = new THREE.Shape();
  perfil.moveTo(4.2, 1.7);
  perfil.lineTo(4.2, 2.45);
  perfil.lineTo(3.9, 2.43);
  perfil.quadraticCurveTo(3.72, 2.42, 3.68, 2.3);
  perfil.lineTo(3.6, 1.7);
  perfil.closePath();
  const geo = new THREE.ExtrudeGeometry(perfil, { depth: MEIA * 2, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 8 });
  geo.translate(0, 0, -MEIA);
  return geo;
}

function mostrador(ctx: CanvasRenderingContext2D, cx: number, cy: number, raio: number, fracao: number, rotulo: string, valor: string, alerta: boolean) {
  const ini = Math.PI * 0.75, arco = Math.PI * 1.5;
  ctx.lineWidth = 10; ctx.strokeStyle = '#1f2d33';
  ctx.beginPath(); ctx.arc(cx, cy, raio, ini, ini + arco); ctx.stroke();
  ctx.strokeStyle = alerta ? '#ff5a4a' : '#5fd0ff';
  ctx.beginPath(); ctx.arc(cx, cy, raio, ini, ini + arco * Math.max(0, Math.min(1, fracao))); ctx.stroke();
  for (let i = 0; i <= 10; i += 1) {
    const a = ini + (arco * i) / 10;
    ctx.strokeStyle = i >= 8 ? '#ff7a5c' : '#9fb4bd'; ctx.lineWidth = i % 5 === 0 ? 4 : 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (raio - 18), cy + Math.sin(a) * (raio - 18)); ctx.lineTo(cx + Math.cos(a) * (raio - 8), cy + Math.sin(a) * (raio - 8)); ctx.stroke();
  }
  const a = ini + arco * Math.max(0, Math.min(1, fracao));
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (raio - 14), cy + Math.sin(a) * (raio - 14)); ctx.stroke();
  ctx.fillStyle = '#dff7ff'; ctx.textAlign = 'center';
  ctx.font = '700 38px system-ui, sans-serif'; ctx.fillText(valor, cx, cy + raio * 0.55);
  ctx.fillStyle = '#7d939c'; ctx.font = '600 18px system-ui, sans-serif'; ctx.fillText(rotulo, cx, cy + raio * 0.82);
}

function luz(ctx: CanvasRenderingContext2D, x: number, y: number, texto: string, acesa: boolean, cor: string) {
  ctx.fillStyle = acesa ? cor : '#1a2226';
  ctx.beginPath(); ctx.roundRect(x - 62, y - 17, 124, 34, 8); ctx.fill();
  ctx.fillStyle = acesa ? '#081014' : '#3c4a50'; ctx.font = '800 17px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y + 1); ctx.textBaseline = 'alphabetic';
}

function desenharPainel(ctx: CanvasRenderingContext2D, w: number, h: number, r: RetratoPista, piscando: boolean) {
  const c = r.caminhao, kph = c.velocidade * 3.6;
  ctx.fillStyle = '#060b0e'; ctx.fillRect(0, 0, w, h);
  mostrador(ctx, 150, 150, 110, kph / 100, 'km/h', kph.toFixed(0), kph > 75);
  mostrador(ctx, w - 150, 150, 110, c.rpm / 3000, 'rpm x1000', (c.rpm / 1000).toFixed(1), c.rpm > 2400);
  const meio = w / 2;
  ctx.fillStyle = '#dff7ff'; ctx.textAlign = 'center'; ctx.font = '800 64px system-ui, sans-serif'; ctx.fillText(`${c.marcha}ª`, meio, 108);
  ctx.fillStyle = '#7d939c'; ctx.font = '600 18px system-ui, sans-serif'; ctx.fillText('MARCHA', meio, 134);
  luz(ctx, meio, 178, 'FREIO', r.falhaFreio && piscando, '#ff5a4a');
  luz(ctx, meio, 222, 'FREIO-MOTOR', c.freioMotor, '#4fe08a');
  luz(ctx, meio - 140, 268, 'ALERTA', r.falhaFreio && piscando, '#ffb347');
  luz(ctx, meio + 140, 268, 'RADAR', r.riscos.has('animal'), '#ffb347');
}

function desenharRadar(ctx: CanvasRenderingContext2D, w: number, h: number, r: RetratoPista) {
  ctx.fillStyle = '#04121a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#5fd0ff'; ctx.textAlign = 'left'; ctx.font = '800 26px system-ui, sans-serif'; ctx.fillText('LUCA · RADAR', 24, 44);
  ctx.fillStyle = '#7d939c'; ctx.font = '600 18px system-ui, sans-serif'; ctx.fillText('SOMPO · telemetria', 24, 70);
  const animal = r.riscos.get('animal'), curva = r.riscos.get('curva');
  const dist = r.radar ? `${r.radar.distanciaM.toFixed(0)} m` : 'livre';
  ctx.fillStyle = animal === 'critico' ? '#ff5a4a' : animal ? '#ffb347' : '#dff7ff';
  ctx.font = '800 58px system-ui, sans-serif'; ctx.fillText(dist, 24, 140);
  ctx.fillStyle = '#9fb4bd'; ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillText(r.radar ? 'Animal à frente' : 'Sem obstáculo no alcance', 24, 170);
  // Faixa do freio de serviço e força lateral.
  const barraH = (y: number, rotulo: string, fracao: number, cor: string) => {
    ctx.fillStyle = '#9fb4bd'; ctx.font = '600 18px system-ui, sans-serif'; ctx.fillText(rotulo, 24, y - 8);
    ctx.fillStyle = '#16252c'; ctx.fillRect(24, y, w - 48, 14);
    ctx.fillStyle = cor; ctx.fillRect(24, y, (w - 48) * Math.max(0, Math.min(1, fracao)), 14);
  };
  barraH(214, `Freio ${Math.round(r.eficienciaFreio * 100)}%`, r.eficienciaFreio, r.falhaFreio ? '#ff5a4a' : '#4fe08a');
  barraH(262, `Lateral ${r.caminhao.aLatG.toFixed(2)} g`, r.caminhao.aLatG / CAMINHAO.latTomboG, curva === 'critico' ? '#ff5a4a' : curva ? '#ffb347' : '#5fd0ff');
}

/** Volante procedural: aro, raios à esquerda, à direita e para o motorista (-X), cubo; plano XZ com o eixo em +Y. */
function volanteProcedural(mat: THREE.Material, raio: number) {
  const g = new THREE.Group();
  const aro = new THREE.Mesh(new THREE.TorusGeometry(raio, 0.024, 12, 40), mat);
  aro.rotation.x = Math.PI / 2; g.add(aro);
  for (const a of [Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const raioMesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, raio), mat);
    raioMesh.position.set(Math.cos(a) * raio * 0.5, 0, Math.sin(a) * raio * 0.5);
    raioMesh.rotation.y = -a + Math.PI / 2; g.add(raioMesh);
  }
  const cubo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 20), mat);
  g.add(cubo);
  return g;
}

export function criarCabineCaminhao() {
  const grupo = new THREE.Group();
  grupo.name = 'cabine-caminhao-interior';
  grupo.position.y = -SOMPO_TRUCK_PIVOT_Y;
  grupo.visible = false;

  const plastico = material(0x26292d), plasticoEscuro = material(0x17191c, 0.9), porta = material(0x3a3e43, 0.78);
  const forro = material(0x8c8e8c, 0.95), metal = material(0x1c1e21, 0.4, 0.6), acento = material(0x0b6e99, 0.5, 0.2);
  const espelho = new THREE.MeshStandardMaterial({ color: 0x5d6b75, roughness: 0.22, metalness: 0.9 });
  const vidro = new THREE.MeshBasicMaterial({ color: 0x9fc4d6, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  const materiais = [plastico, plasticoEscuro, porta, forro, metal, acento, espelho, vidro];

  // Painel e capa antirreflexo; caixa dos instrumentos na frente do motorista.
  grupo.add(new THREE.Mesh(geometriaPainel(), plastico));
  caixa(grupo, [0.3, 0.035, MEIA * 2], [4.04, 2.455, 0], plasticoEscuro);
  caixa(grupo, [0.26, 0.22, 0.7], [3.86, 2.53, -0.55], plasticoEscuro, 0.04);
  caixa(grupo, [0.1, 0.02, 0.68], [3.7, 2.65, -0.55], plasticoEscuro, 0.008);
  caixa(grupo, [0.02, 0.012, MEIA * 1.6], [3.69, 2.305, 0.1], acento);
  const painel = tela(grupo, 0.58, 0.18, [3.69, 2.55, -0.55], [1024, 320]);
  // Tela do LUCA no centro do painel, com moldura.
  const radar = tela(grupo, 0.3, 0.17, [3.86, 2.56, 0.08], [512, 290]);
  const moldura = caixa(grupo, [0.33, 0.2, 0.025], [0, 0, 0], plasticoEscuro, 0.01);
  moldura.position.copy(radar.mesh.position); moldura.quaternion.copy(radar.mesh.quaternion); moldura.translateZ(-0.016);
  // Porta-luvas e saídas de ar do lado do passageiro.
  caixa(grupo, [0.03, 0.2, 0.62], [3.66, 2.1, 0.6], plasticoEscuro, 0.01);
  for (const z of [-0.95, 0.95]) caixa(grupo, [0.03, 0.07, 0.12], [3.69, 2.3, z], metal, 0.015);

  // Volante (eixo inclinado para o motorista) e coluna até o painel.
  const v = ENCAIXE_CAMINHAO.volante;
  const pivoVolante = new THREE.Group();
  pivoVolante.position.set(...v.centro);
  pivoVolante.rotation.z = v.inclinacao;
  grupo.add(pivoVolante);
  const giro = new THREE.Group(); pivoVolante.add(giro);
  const procedural = volanteProcedural(plasticoEscuro, v.raio); giro.add(procedural);
  barra(grupo, new THREE.Vector3(...v.centro), new THREE.Vector3(3.7, 2.05, -0.55), 0.07, 0.07, plasticoEscuro);

  // Colunas A, travessa do para-brisa, vidro e palhetas.
  for (const lado of [-1, 1]) {
    barra(grupo, new THREE.Vector3(4.2, 2.42, lado * MEIA), new THREE.Vector3(3.7, 3.4, lado * MEIA), 0.13, 0.1, plastico);
    barra(grupo, new THREE.Vector3(4.21, 2.5, lado * 0.15), new THREE.Vector3(4.19, 2.53, lado * 0.85), 0.018, 0.018, metal);
  }
  caixa(grupo, [0.16, 0.1, MEIA * 2], [3.66, 3.42, 0], forro);
  barra(grupo, new THREE.Vector3(4.21, 2.47, 0), new THREE.Vector3(3.73, 3.39, 0), 0.004, MEIA * 2, vidro);

  // Teto, para-sóis baixados até a borda de cima da vista, parede de trás e piso.
  caixa(grupo, [2.1, 0.05, MEIA * 2], [2.63, 3.5, 0], forro);
  for (const z of [-0.5, 0.5]) {
    const sol = caixa(grupo, [0.035, 0.22, 0.78], [3.58, 3.14, z], forro, 0.012);
    sol.rotation.z = 0.3;
    caixa(grupo, [0.03, 0.03, 0.06], [3.6, 3.27, z * 1.5], metal);
  }
  caixa(grupo, [0.05, 1.9, MEIA * 2], [1.62, 2.6, 0], porta);
  caixa(grupo, [2.6, 0.05, MEIA * 2], [2.9, 1.65, 0], plasticoEscuro);

  // Portas: forro abaixo da janela, apoio de braço, maçaneta, peitoril e coluna B.
  for (const lado of [-1, 1]) {
    const z = lado * MEIA;
    caixa(grupo, [2.2, 0.72, 0.05], [3.0, 2.0, z], porta);
    caixa(grupo, [0.9, 0.06, 0.12], [2.75, 2.12, z - lado * 0.07], plasticoEscuro, 0.02);
    caixa(grupo, [0.12, 0.04, 0.03], [3.3, 2.24, z - lado * 0.04], metal, 0.01);
    caixa(grupo, [2.2, 0.05, 0.1], [3.0, 2.37, z], plasticoEscuro, 0.015);
    caixa(grupo, [0.12, 1.1, 0.08], [2.02, 2.9, z], plastico);
    // Retrovisor externo: braço saindo da coluna A e a caixa com o espelho virado para trás.
    const ancora = new THREE.Vector3(4.02, 2.75, lado * (MEIA + 0.05));
    const caixaEsp = new THREE.Vector3(3.98, 2.82, lado * (MEIA + 0.32));
    barra(grupo, ancora, caixaEsp, 0.03, 0.03, metal);
    caixa(grupo, [0.08, 0.34, 0.19], [caixaEsp.x, caixaEsp.y, caixaEsp.z], plasticoEscuro, 0.03);
    caixa(grupo, [0.01, 0.3, 0.15], [caixaEsp.x - 0.045, caixaEsp.y, caixaEsp.z], espelho);
  }

  grupo.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });

  // Volante do Tripo no lugar do procedural (mesmo prop da cabine do trator).
  const aborta = new AbortController();
  let tripo: THREE.Object3D | null = null;
  void carregarPropTripo(PROPS_CABINE_URL.volante, aborta.signal).then((cena) => {
    if (aborta.signal.aborted) return;
    const bb = new THREE.Box3().setFromObject(cena);
    const raioModelo = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
    const centro = bb.getCenter(new THREE.Vector3());
    cena.position.sub(centro);
    // Prop: raio de baixo em -Z; aqui o lado do motorista é -X.
    const raiz = new THREE.Group(); raiz.add(cena); raiz.rotation.y = Math.PI / 2;
    raiz.scale.setScalar(((v.raio + 0.024) / raioModelo));
    raiz.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
    giro.add(raiz); procedural.visible = false; tripo = raiz;
  }).catch(() => { /* fica o procedural */ });

  let ultimoDesenho = -Infinity;
  return {
    grupo,
    quadro(r: RetratoPista, agoraMs: number) {
      giro.rotation.y = -r.comandos.esterco * CAMINHAO.estercoMaxRad * ENCAIXE_CAMINHAO.giroVolante / Math.PI;
      if (agoraMs - ultimoDesenho < 100) return;
      ultimoDesenho = agoraMs;
      const piscando = Math.floor(agoraMs / 400) % 2 === 0;
      if (painel.ctx) { desenharPainel(painel.ctx, painel.canvas.width, painel.canvas.height, r, piscando); painel.textura.needsUpdate = true; }
      if (radar.ctx) { desenharRadar(radar.ctx, radar.canvas.width, radar.canvas.height, r); radar.textura.needsUpdate = true; }
    },
    dispose() {
      aborta.abort();
      grupo.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      if (tripo) tripo.traverse((n) => {
        const m = n as THREE.Mesh; if (!m.isMesh) return;
        for (const x of Array.isArray(m.material) ? m.material : [m.material]) { for (const t of Object.values(x)) if ((t as THREE.Texture | null)?.isTexture) (t as THREE.Texture).dispose(); x.dispose(); }
      });
      painel.textura.dispose(); radar.textura.dispose();
      for (const m of [...materiais, painel.mesh.material, radar.mesh.material] as THREE.Material[]) m.dispose();
      grupo.removeFromParent();
    },
  };
}
