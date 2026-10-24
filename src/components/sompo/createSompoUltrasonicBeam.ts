import * as THREE from 'three';

/** Abertura nominal do HC-SR04 (cone de ~30°), usada quando o palco não mede corredor. */
const CONE_MEIO_ANGULO = THREE.MathUtils.degToRad(15);

/**
 * Feixe do HC-SR04 sobre a máquina; verde em operação, vermelho em alerta, âmbar com leitura incerta.
 *
 * `meiaLarguraM > 0` desenha o que o simulador de gameplay mede de verdade (`distanciaSensorM` com
 * meia bitola): uma faixa da largura do trator, com as bordas marcadas, do emissor até a leitura.
 * Sem largura, mantém o cone de 30° do sensor físico (palcos de vitrine e telemetria real).
 */
export function createUltrasonicBeam(origin: readonly [number, number, number], meiaLarguraM = 0) {
  const corredor = meiaLarguraM > 0;
  const group = new THREE.Group(); group.name = 'agri-max-ultrasonic-range';
  group.position.fromArray(origin);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: .78 });
  for (const z of [-.12, .12]) {
    const borda = corredor ? Math.sign(z) * meiaLarguraM : z;
    const fim = corredor ? borda : z + Math.sign(z) * .26;
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, borda), new THREE.Vector3(1, 0, fim)]), lineMaterial);
    ray.name = `ultrasonic-ray-${z > 0 ? 'left' : 'right'}`; group.add(ray);
  }
  const coneMaterial = new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false });
  let areaGeometry: THREE.BufferGeometry;
  if (corredor) {
    // Faixa horizontal na altura do emissor, 1 m de comprido (escala x = alcance lido).
    areaGeometry = new THREE.PlaneGeometry(1, meiaLarguraM * 2);
    areaGeometry.rotateX(-Math.PI / 2); areaGeometry.translate(.5, 0, 0);
  } else {
    areaGeometry = new THREE.ConeGeometry(Math.tan(CONE_MEIO_ANGULO), 1, 28, 1, true);
    areaGeometry.translate(0, -.5, 0); areaGeometry.rotateZ(Math.PI / 2);
  }
  const area = new THREE.Mesh(areaGeometry, coneMaterial); area.name = corredor ? 'ultrasonic-corridor' : 'ultrasonic-cone'; group.add(area);
  // Pulso: anel que abre no cone; no corredor, uma barra que corre de borda a borda.
  const pulseGeometry = corredor ? new THREE.BoxGeometry(.03, .012, meiaLarguraM * 2) : new THREE.TorusGeometry(1, .012, 6, 36);
  const pulse = new THREE.Mesh(pulseGeometry, new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: .5, depthWrite: false }));
  if (!corredor) pulse.rotation.y = Math.PI / 2;
  pulse.name = 'ultrasonic-pulse'; group.add(pulse);
  return {
    group,
    corredor,
    update(distanceCm: number, alert: boolean, elapsedMs: number, uncertain = false) {
      // 400 cm é "sem eco": feixe no alcance máximo e mais apagado.
      const echo = distanceCm < 395;
      const length = Math.max(.02, Math.min(4, distanceCm / 100));
      // O corredor só cresce no comprimento; o cone abre junto.
      for (const child of group.children) if (child !== pulse) child.scale.set(length, 1, 1);
      if (!corredor) area.scale.set(length, length, length);
      // Leitura física velha ou desconhecida: âmbar, como o feixe do caminhão.
      const color = uncertain ? 0xc9ad74 : alert ? 0xff5d52 : 0x7dff9a;
      lineMaterial.color.set(color); coneMaterial.color.set(color); (pulse.material as THREE.MeshBasicMaterial).color.set(color);
      lineMaterial.opacity = echo ? (alert ? 1 : .78) : .4;
      coneMaterial.opacity = echo ? (alert ? .26 : .16) : .07;
      const phase = (elapsedMs / 600) % 1;
      pulse.position.x = phase * length;
      if (!corredor) {
        const ring = Math.max(.04, Math.tan(CONE_MEIO_ANGULO) * phase * length);
        pulse.scale.set(ring, ring, ring);
      }
      (pulse.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * (echo ? .55 : .25);
    },
  };
}
