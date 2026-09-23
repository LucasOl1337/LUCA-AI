import * as THREE from 'three';
import { THRESHOLDS, TRUCK, telemetryPacket, type SensorReading } from '../physics.js';
import { roundedBoxAt } from './geometry';
import { DISPLAY_FONT, MONO_FONT, makeCanvas } from './textures';

/**
 * Monitor da bancada: o que o ESP32 manda, desenhado como osciloscópio.
 * Quatro trilhas (lateral, longitudinal, vertical, guinada) com os limiares
 * do LUCA, o pacote no formato do contrato do firmware e a faixa de estado.
 */

const W = 1280, H = 780;
const WINDOW_S = 8;
const PLOT = Object.freeze({ x0: 54, x1: 880, top: 92, lane: 142, gap: 12 });

type Sample = { t: number; x: number; y: number; z: number; yaw: number };

interface Lane {
  key: 'y' | 'x' | 'z' | 'yaw';
  label: string;
  field: string;
  color: string;
  min: number;
  max: number;
  unit: string;
  lines: { value: number; color: string; dash?: boolean; label?: string }[];
}

const LANES: Lane[] = [
  {
    key: 'y', label: 'LATERAL', field: 'aceleracaoY', color: '#5eead4', min: -1.1, max: 1.1, unit: 'g',
    lines: [
      { value: TRUCK.rolloverG * THRESHOLDS.alert, color: '#ff7a6b', label: 'risco' },
      { value: TRUCK.rolloverG * THRESHOLDS.attention, color: '#ffc46b', dash: true },
      { value: -TRUCK.rolloverG * THRESHOLDS.alert, color: '#ff7a6b' },
    ],
  },
  {
    key: 'x', label: 'LONGITUDINAL', field: 'aceleracaoX', color: '#ff9f7a', min: -1.1, max: 1.1, unit: 'g',
    lines: [{ value: -THRESHOLDS.hardBrakeG, color: '#ff7a6b', label: 'frenada brusca' }],
  },
  {
    key: 'z', label: 'VERTICAL', field: 'aceleracaoZ', color: '#7cb4ff', min: -0.4, max: 2.6, unit: 'g',
    lines: [{ value: 1, color: '#8ea0b8', dash: true, label: '1 g' }, { value: 1 + THRESHOLDS.impactG, color: '#ff7a6b', label: 'impacto' }],
  },
  {
    key: 'yaw', label: 'GUINADA', field: 'rotacaoZ', color: '#ff8fd0', min: -30, max: 30, unit: '°/s',
    lines: [],
  },
];

const STATUS: Record<string, { text: string; color: string }> = {
  estavel: { text: 'ESTÁVEL', color: '#5eead4' },
  atencao: { text: 'ATENÇÃO', color: '#ffc46b' },
  risco: { text: 'RISCO DE TOMBAMENTO', color: '#ff6b6b' },
  tombou: { text: 'TOMBOU', color: '#ff4d4d' },
  frenada: { text: 'FRENADA BRUSCA', color: '#ff6b6b' },
  impacto: { text: 'IMPACTO', color: '#ff6b6b' },
};

export interface ScopeMaterials {
  anodized: THREE.MeshStandardMaterial;
  brushed: THREE.MeshStandardMaterial;
}

export interface Scope {
  group: THREE.Group;
  anchors: Record<string, THREE.Object3D>;
  push(reading: SensorReading): void;
  reset(): void;
  draw(reading: SensorReading, now: number): void;
  dispose(): void;
}

export function createScope(materials: ScopeMaterials): Scope {
  const group = new THREE.Group();
  group.name = 'scope-monitor';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };
  const anchors: Record<string, THREE.Object3D> = {};

  const { canvas, ctx } = makeCanvas(W, H);
  const texture = track(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const screenMaterial = track(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: new THREE.Color(1.12, 1.12, 1.12) }));

  const screenW = 2.9, screenH = (screenW * H) / W;
  const bezel = new THREE.Mesh(track(roundedBoxAt(screenW + 0.14, screenH + 0.14, 0.1, 0, 0, -0.05, 0.035, 3)), materials.anodized);
  bezel.castShadow = true;
  const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(screenW, screenH)), screenMaterial);
  screen.position.z = 0.002;
  const monitor = new THREE.Group();
  monitor.add(bezel, screen);
  monitor.position.y = 1.72;
  monitor.rotation.x = -0.06;
  const neck = new THREE.Mesh(track(roundedBoxAt(0.16, 1.1, 0.08, 0, 0.62, -0.16, 0.03, 2)), materials.brushed);
  const foot = new THREE.Mesh(track(roundedBoxAt(1.1, 0.05, 0.62, 0, 0.025, -0.1, 0.02, 2)), materials.brushed);
  neck.castShadow = foot.castShadow = true;
  foot.receiveShadow = true;
  group.add(monitor, neck, foot);
  const anchor = new THREE.Object3D();
  anchor.position.set(-screenW / 2 + 0.25, 1.72 + screenH / 2 + 0.02, 0.02);
  group.add(anchor);
  anchors.scope = anchor;
  const packetAnchor = new THREE.Object3D();
  packetAnchor.position.set(screenW / 2 - 0.35, 1.72 + screenH / 2 + 0.02, 0.02);
  group.add(packetAnchor);
  anchors.packet = packetAnchor;

  const samples: Sample[] = [];
  let lastPush = -1;
  let clock = 0;
  let flash: Record<string, number> = {};
  let previousPacket: Record<string, unknown> = {};

  function push(reading: SensorReading) {
    // Amostragem de 100 Hz no relógio contínuo do laboratório.
    clock = reading.t;
    if (lastPush >= 0 && reading.t - lastPush < 0.01) return;
    lastPush = reading.t;
    samples.push({ t: reading.t, x: reading.forceG.x, y: reading.forceG.y, z: reading.forceG.z, yaw: reading.gyroDps.z });
    while (samples.length && samples[0].t < reading.t - WINDOW_S - 0.5) samples.shift();
  }

  function reset() {
    samples.length = 0;
    lastPush = -1;
  }

  const laneY = (index: number) => PLOT.top + index * (PLOT.lane + PLOT.gap);
  const valueY = (lane: Lane, index: number, value: number) => {
    const top = laneY(index);
    const clamped = Math.max(lane.min, Math.min(lane.max, value));
    return top + PLOT.lane - ((clamped - lane.min) / (lane.max - lane.min)) * PLOT.lane;
  };
  const timeX = (t: number) => PLOT.x1 - ((clock - t) / WINDOW_S) * (PLOT.x1 - PLOT.x0);

  function draw(reading: SensorReading, now: number) {
    ctx.fillStyle = '#060a10';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.4, H * 0.45, 40, W * 0.4, H * 0.45, W * 0.75);
    glow.addColorStop(0, 'rgba(40,80,110,.18)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Cabeçalho.
    ctx.textBaseline = 'middle';
    ctx.font = `600 22px ${MONO_FONT}`;
    ctx.fillStyle = '#8fa3bb';
    ctx.fillText('ESP32 · IMU 6 EIXOS', PLOT.x0, 44);
    const blink = (now * 2) % 1 < 0.5;
    ctx.fillStyle = blink ? '#5eead4' : '#1e5c52';
    ctx.beginPath(); ctx.arc(PLOT.x0 + 292, 44, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8fa3bb';
    ctx.fillText('100 Hz', PLOT.x0 + 310, 44);
    ctx.textAlign = 'right';
    ctx.fillText(`t = ${reading.t.toFixed(1).replace('.', ',')} s`, PLOT.x1, 44);
    ctx.textAlign = 'left';

    // Trilhas.
    for (const [index, lane] of LANES.entries()) {
      const top = laneY(index);
      ctx.fillStyle = 'rgba(18,28,42,.72)';
      ctx.fillRect(PLOT.x0, top, PLOT.x1 - PLOT.x0, PLOT.lane);
      ctx.strokeStyle = 'rgba(80,110,140,.16)';
      ctx.lineWidth = 1;
      for (let s = 0; s <= WINDOW_S; s++) {
        const x = PLOT.x1 - (s / WINDOW_S) * (PLOT.x1 - PLOT.x0) - ((clock % 1) / WINDOW_S) * (PLOT.x1 - PLOT.x0);
        if (x < PLOT.x0) continue;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + PLOT.lane); ctx.stroke();
      }
      const zero = valueY(lane, index, 0);
      ctx.strokeStyle = 'rgba(120,150,180,.28)';
      ctx.beginPath(); ctx.moveTo(PLOT.x0, zero); ctx.lineTo(PLOT.x1, zero); ctx.stroke();
      for (const line of lane.lines) {
        const y = valueY(lane, index, line.value);
        ctx.strokeStyle = line.color;
        ctx.globalAlpha = 0.75;
        ctx.setLineDash(line.dash ? [6, 6] : [12, 6]);
        ctx.beginPath(); ctx.moveTo(PLOT.x0, y); ctx.lineTo(PLOT.x1, y); ctx.stroke();
        ctx.setLineDash([]);
        if (line.label) {
          ctx.font = `500 15px ${MONO_FONT}`;
          ctx.fillStyle = line.color;
          ctx.fillText(line.label, PLOT.x0 + 8, y - 10);
        }
        ctx.globalAlpha = 1;
      }
      // Traço com brilho.
      ctx.save();
      ctx.beginPath();
      ctx.rect(PLOT.x0, top, PLOT.x1 - PLOT.x0, PLOT.lane);
      ctx.clip();
      for (const [width, alpha] of [[9, 0.18], [3, 1]] as const) {
        ctx.strokeStyle = lane.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let started = false;
        for (const sample of samples) {
          const x = timeX(sample.t);
          if (x < PLOT.x0 - 4) continue;
          const y = valueY(lane, index, sample[lane.key]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      // Rótulo e valor atual à direita da trilha.
      const current = lane.key === 'yaw' ? reading.gyroDps.z : reading.forceG[lane.key];
      ctx.font = `600 16px ${MONO_FONT}`;
      ctx.fillStyle = '#6f829a';
      ctx.fillText(lane.label, PLOT.x1 + 18, top + 22);
      ctx.font = `500 14px ${MONO_FONT}`;
      ctx.fillText(lane.field, PLOT.x1 + 18, top + 44);
      ctx.font = `600 40px ${MONO_FONT}`;
      ctx.fillStyle = lane.color;
      const digits = lane.key === 'yaw' ? 1 : 2;
      ctx.fillText(`${current >= 0 ? ' ' : ''}${current.toFixed(digits).replace('.', ',')}`, PLOT.x1 + 12, top + 92);
      ctx.font = `500 18px ${MONO_FONT}`;
      ctx.fillStyle = '#6f829a';
      ctx.fillText(lane.unit, PLOT.x1 + 150, top + 96);
    }

    // Pacote do contrato.
    const packet = telemetryPacket(reading) as unknown as Record<string, number | boolean>;
    const px = 1080, py = 92;
    ctx.fillStyle = 'rgba(14,22,34,.9)';
    ctx.fillRect(px - 10, py, W - px - 34, 470);
    ctx.strokeStyle = 'rgba(94,234,212,.25)';
    ctx.strokeRect(px - 10, py, W - px - 34, 470);
    ctx.font = `600 15px ${MONO_FONT}`;
    ctx.fillStyle = '#6f829a';
    ctx.fillText('PUBLICA', px + 4, py + 26);
    ctx.fillStyle = '#9fb3c8';
    ctx.fillText('trator/001/sensores', px + 4, py + 50);
    ctx.font = `500 16px ${MONO_FONT}`;
    let line = py + 92;
    const shown = ['aceleracaoX', 'aceleracaoY', 'aceleracaoZ', 'rotacaoX', 'rotacaoY', 'rotacaoZ', 'riscoInclinacao'];
    for (const key of shown) {
      const value = packet[key];
      if (previousPacket[key] !== value) flash[key] = now;
      const age = now - (flash[key] ?? -10);
      ctx.fillStyle = '#7f93aa';
      ctx.fillText(key, px + 4, line);
      const text = typeof value === 'boolean' ? String(value) : (value as number).toFixed(key.startsWith('rot') ? 1 : 2);
      ctx.fillStyle = typeof value === 'boolean'
        ? (value ? '#ff6b6b' : '#5eead4')
        : age < 0.25 ? '#ffffff' : '#d6e2ee';
      ctx.textAlign = 'right';
      ctx.fillText(text, W - 56, line);
      ctx.textAlign = 'left';
      line += 50;
    }
    previousPacket = packet;
    ctx.font = `500 14px ${MONO_FONT}`;
    ctx.fillStyle = '#5f7289';
    ctx.fillText('g · °/s · amostra a cada 10 ms', px + 4, py + 450);

    // Caminho do dado até o LUCA.
    const stages = ['ESP32', 'MQTT', 'Firebase', 'LUCA'];
    const sy = 604;
    const sx0 = px, sx1 = W - 70;
    ctx.strokeStyle = 'rgba(120,150,180,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx0, sy); ctx.lineTo(sx1, sy); ctx.stroke();
    ctx.font = `600 13px ${MONO_FONT}`;
    for (const [index, name] of stages.entries()) {
      const x = sx0 + ((sx1 - sx0) * index) / (stages.length - 1);
      ctx.fillStyle = index === stages.length - 1 ? '#5eead4' : '#9fb3c8';
      ctx.beginPath(); ctx.arc(x, sy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = index === 0 ? 'left' : index === stages.length - 1 ? 'right' : 'center';
      ctx.fillText(name, x, sy + 26);
    }
    ctx.textAlign = 'left';
    const travel = (now * 0.9) % 1;
    ctx.fillStyle = '#5eead4';
    ctx.beginPath(); ctx.arc(sx0 + (sx1 - sx0) * travel, sy, 5, 0, Math.PI * 2); ctx.fill();

    // Faixa de estado.
    const key = reading.flags.frenagemBrusca ? 'frenada' : reading.flags.impacto ? 'impacto' : reading.level;
    const status = STATUS[key] ?? STATUS.estavel;
    const by = 690;
    ctx.fillStyle = 'rgba(12,18,28,.95)';
    ctx.fillRect(0, by - 20, W, H - by + 20);
    ctx.fillStyle = status.color;
    ctx.globalAlpha = key === 'estavel' ? 0.16 : 0.24 + 0.1 * Math.sin(now * 8);
    ctx.fillRect(0, by - 20, W, H - by + 20);
    ctx.globalAlpha = 1;
    ctx.fillStyle = status.color;
    ctx.fillRect(0, by - 20, 10, H - by + 20);
    ctx.font = `700 44px ${DISPLAY_FONT}`;
    ctx.fillText(status.text, 40, by + 26);
    ctx.font = `500 20px ${MONO_FONT}`;
    ctx.fillStyle = '#c7d4e2';
    ctx.textAlign = 'right';
    const detail = reading.id === 'curva' || reading.id === 'encosta'
      ? `${Math.round(Math.max(0, reading.ratio) * 100)}% do limite de tombamento`
      : reading.id === 'frenada'
        ? `${Math.abs(reading.forceG.x).toFixed(2).replace('.', ',')} g de frenada`
        : `${Math.abs(reading.forceG.z - 1).toFixed(2).replace('.', ',')} g além da gravidade`;
    ctx.fillText(detail, W - 40, by + 26);
    ctx.textAlign = 'left';
    texture.needsUpdate = true;
  }

  return {
    group,
    anchors,
    push,
    reset,
    draw,
    dispose() {
      disposables.forEach((item) => item.dispose());
      flash = {};
    },
  };
}
