/**
 * Atores da serra: caminhão (modelo SOMPO + GLB), Nelore (createSompoAnimal),
 * efeitos de cena (freio em brasa, fumaça, pisca-alerta) e as duas câmeras.
 * Lê só o `RetratoPista`; não decide nada de jogo.
 */
import * as THREE from 'three';
import { createSompoTruckModel, SOMPO_TRUCK_PIVOT_Y } from '../sompo/createSompoTruckModel';
import { loadSompoTruckAsset } from '../sompo/loadSompoTruckAsset';
import { createSompoAnimal } from '../sompo/createSompoAnimal';
import { createSompoScenarioEffects } from '../sompo/createSompoScenarioEffects';
import { getSompoAnimalPose, type SompoEffectCue, type SompoVisualEffect } from '../../../shared/sompo-scenario-effects.js';
import { pontoLateral, SERRA, type PistaSerra } from './pistaSerra';
import { CAMINHAO } from './fisicaCaminhao';
import { criarCabineCaminhao, ENCAIXE_CAMINHAO } from './cabineCaminhao';
import type { RetratoPista } from './corridaPista';

export type VistaPista = 'externa' | 'cabine';

export function criarAtoresSerra(scene: THREE.Scene, camera: THREE.PerspectiveCamera, pista: PistaSerra, aoModelo: (status: string) => void) {
  const pose = new THREE.Group(); pose.name = 'serra-caminhao'; pose.rotation.order = 'YZX'; scene.add(pose);
  const modelo = createSompoTruckModel({ sensorLabel: 'RADAR' });
  modelo.root.position.y = -SOMPO_TRUCK_PIVOT_Y; pose.add(modelo.root);
  const aborta = new AbortController();
  void loadSompoTruckAsset(modelo, aborta.signal).then((ok) => aoModelo(ok ? 'gltf' : 'fallback')).catch(() => aoModelo('fallback'));
  const efeitos = createSompoScenarioEffects(scene, modelo, camera);
  const cabine = criarCabineCaminhao(); pose.add(cabine.grupo);

  // Animal: grupo com +z = direita da pista no ponto do cruzamento (o bovino anda em +z).
  const pAnimal = pontoLateral(pista, SERRA.animalS, 0);
  const grupoAnimal = new THREE.Group(); grupoAnimal.position.set(pAnimal.x, pAnimal.y + 0.05, pAnimal.z); grupoAnimal.rotation.y = pAnimal.rumo; scene.add(grupoAnimal);
  const animal = createSompoAnimal(grupoAnimal);
  void animal.ready;

  const eixoRoda = new THREE.Vector3(0, 1, 0), eixoX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const qEsterco = new THREE.Quaternion(), qGiro = new THREE.Quaternion();
  const olho = new THREE.Vector3(), alvo = new THREE.Vector3(), olhoSuave = new THREE.Vector3(), alvoSuave = new THREE.Vector3();
  const OLHO_CABINE = new THREE.Vector3(ENCAIXE_CAMINHAO.olho[0], ENCAIXE_CAMINHAO.olho[1] - SOMPO_TRUCK_PIVOT_Y, ENCAIXE_CAMINHAO.olho[2]);
  const CIMA = new THREE.Vector3(0, 1, 0), direcao = new THREE.Vector3();
  let percurso = 0, inicioMs = 0, inicioFalha: number | null = null, impactoMs: number | null = null, primeira = true, relogio = 0;
  const cues = new Map<SompoVisualEffect, number>();

  const deixa = (efeito: SompoVisualEffect, intensidade: number, agoraMs: number): SompoEffectCue | null => {
    if (intensidade <= 0.01) { cues.delete(efeito); return null; }
    if (!cues.has(efeito)) cues.set(efeito, agoraMs);
    const startMs = cues.get(efeito)!;
    return { effect: efeito, startMs, endMs: null, strength: 1, attackMs: 300, ageMs: agoraMs - startMs, intensity: Math.min(1, intensidade) };
  };

  return {
    /** Um quadro de cena: pose, rodas, animal, efeitos e câmera. */
    quadro(r: RetratoPista, dt: number, vista: VistaPista, reduzido: boolean, olhar: { yaw: number; pitch: number }) {
      relogio += dt * 1000;
      const c = r.caminhao, kph = c.velocidade * 3.6;
      pose.position.set(c.x, c.y + SOMPO_TRUCK_PIVOT_Y + 0.05, c.z);
      // Inclinação da carroceria: rampa (arfagem) e rolagem pela aceleração lateral; tombando, cai de lado.
      const tombo = r.fim === 'tombamento' ? Math.min(1, (relogio - (impactoMs ?? relogio)) / 900) : 0;
      if (r.fim && impactoMs === null) impactoMs = relogio;
      pose.rotation.y = c.rumo;
      pose.rotation.z = Math.atan(c.rampa);
      pose.rotation.x = Math.sign(c.guinada) * (Math.min(0.6, c.aLatG) * 0.12 + tombo * 1.45);
      percurso += c.velocidade * dt;
      const angulo = -r.comandos.esterco * CAMINHAO.estercoMaxRad * 0.8;
      for (const roda of modelo.wheels) {
        qEsterco.setFromAxisAngle(eixoRoda, roda.position.x > 2 ? angulo : 0);
        qGiro.setFromAxisAngle(eixoRoda, reduzido ? 0 : -percurso / (roda.userData.radius ?? 0.58));
        roda.quaternion.copy(qEsterco).multiply(eixoX).multiply(qGiro);
      }

      // Animal: pose do createSompoAnimal com âncora que cancela a curva roteirizada (o jogo manda na posição).
      const a = r.animal;
      if (a.atingido && impactoMs === null) impactoMs = relogio;
      const z = a.lateral, posePadrao = getSompoAnimalPose(z);
      animal.update(a.ativo || a.atingido, z, relogio, reduzido, 7 - posePadrao.x, a.andando ? 1 : 0, a.atingido && impactoMs !== null ? relogio - impactoMs : null);

      // Efeitos: freio em brasa e fumaça depois da falha, pisca-alerta, luz de freio, fumaça de pneu na curva e cascalho.
      if (r.falhaFreio && inicioFalha === null) inicioFalha = relogio;
      if (r.fase === 'pronto') { inicioFalha = null; inicioMs = relogio; }
      const calor = inicioFalha === null ? 0 : Math.min(1, (relogio - inicioFalha) / 2500) * Math.min(1, kph / 30 + 0.25);
      const lista = [
        deixa('brake-glow', calor, relogio), deixa('brake-smoke', calor * (r.fim ? 0.4 : 1), relogio),
        deixa('hazard-lights', r.falhaFreio ? 1 : 0, relogio), deixa('brake-lights', r.comandos.freio > 0.1 ? 1 : 0, relogio),
        deixa('tire-smoke', c.aLatG > CAMINHAO.latAvisoG + 0.08 ? (c.aLatG - 0.3) * 4 : 0, relogio),
        deixa('shoulder-dust', c.noCascalho && c.velocidade > 1 ? 1 : 0, relogio),
        deixa('sensor-warning', r.riscos.has('animal') ? 1 : 0, relogio), deixa('exhaust', c.freioMotor ? 1 : 0.3, relogio),
        deixa('running-lights', 1, relogio),
      ].filter((x): x is SompoEffectCue => !!x);
      efeitos.update({ surface: c.noCascalho ? 'gravel' : 'asphalt', setting: 'road', focusX: 0, cues: lista }, relogio - inicioMs, 'serra-sem-freio', kph, reduzido, 0, '', 0, 1);

      // Câmera: externa atrás e acima (amortecida) ou no banco do motorista, presa à cabine
      // (arfagem, rolagem e tombo passam para a vista). Por dentro, a carroceria some e entra o interior.
      const dentro = vista === 'cabine';
      if (!dentro) {
        const cosR = Math.cos(c.rumo), sinR = Math.sin(c.rumo);
        olho.set(c.x - cosR * 15.5, c.y + 6.2, c.z + sinR * 15.5); alvo.set(c.x + cosR * 8, c.y + 1.6, c.z - sinR * 8);
        camera.up.copy(CIMA);
      } else {
        pose.updateMatrixWorld(true);
        const yaw = olhar.yaw * 1.1, pitch = ENCAIXE_CAMINHAO.inclinacaoOlhar + olhar.pitch * 0.3;
        direcao.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.sin(yaw) * Math.cos(pitch)).multiplyScalar(20).add(OLHO_CABINE);
        olho.copy(OLHO_CABINE); pose.localToWorld(olho);
        alvo.copy(direcao); pose.localToWorld(alvo);
        camera.up.copy(CIMA).applyQuaternion(pose.quaternion);
        cabine.quadro(r, relogio);
      }
      const k = primeira || dentro ? 1 : 1 - Math.exp(-dt * 6);
      olhoSuave.lerp(olho, k); alvoSuave.lerp(alvo, primeira || dentro ? 1 : 1 - Math.exp(-dt * 10)); primeira = false;
      camera.position.copy(olhoSuave); camera.lookAt(alvoSuave);
      camera.fov = dentro ? ENCAIXE_CAMINHAO.fov : 55; camera.near = dentro ? 0.05 : 0.3; camera.updateProjectionMatrix();
      modelo.root.visible = !dentro; cabine.grupo.visible = dentro;
    },
    reiniciar() { percurso = 0; inicioFalha = null; impactoMs = null; primeira = true; cues.clear(); },
    posicao: () => pose.position,
    dispose() { aborta.abort(); cabine.dispose(); efeitos.dispose(); animal.dispose(); scene.remove(pose, grupoAnimal); },
  };
}
