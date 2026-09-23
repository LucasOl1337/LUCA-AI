import * as THREE from 'three';

/**
 * Texturas procedurais do laboratório. Tudo nasce em canvas no cliente: nenhum
 * download, nada fora da CSP e o mesmo resultado a cada carga (PRNG com semente).
 */

export const DISPLAY_FONT = '"Sensor Outfit", "Inter", system-ui, sans-serif';
export const MONO_FONT = '"Sensor Mono", ui-monospace, "Cascadia Mono", monospace';

/** As texturas desenham texto em canvas: espera as fontes (com teto) antes. */
export function loadLabFonts(timeoutMs = 1800) {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  const fonts = Promise.all([
    document.fonts.load('700 40px "Sensor Outfit"'),
    document.fonts.load('500 20px "Sensor Mono"'),
  ]).then(() => undefined, () => undefined);
  return Promise.race([fonts, new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs))]);
}

export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  return { canvas, ctx };
}

interface TextureOptions {
  srgb?: boolean;
  repeat?: [number, number];
  anisotropy?: number;
}

export function toTexture(canvas: HTMLCanvasElement, { srgb = true, repeat, anisotropy = 8 }: TextureOptions = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  texture.needsUpdate = true;
  return texture;
}

/** Ruído de valor suave, útil para manchas de polimento e sujeira. */
function speckle(ctx: CanvasRenderingContext2D, width: number, height: number, random: () => number, count: number, color: string, maxSize: number, alpha: number) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * random();
    const size = 0.5 + random() * maxSize;
    ctx.fillRect(random() * width, random() * height, size, size);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ ASIC

/** Face do ASIC: anel de pads, trilhos de células, SRAM, bloco analógico e barramentos. */
export function asicTextures() {
  const size = 2048;
  const { canvas, ctx } = makeCanvas(size, size);
  const rough = makeCanvas(size, size);
  const random = seeded(71);
  ctx.fillStyle = '#2b3240';
  ctx.fillRect(0, 0, size, size);
  rough.ctx.fillStyle = '#5a5a5a';
  rough.ctx.fillRect(0, 0, size, size);

  const margin = 150;
  // Anel de vedação e pads de alumínio.
  ctx.strokeStyle = '#8e97a6';
  ctx.lineWidth = 10;
  ctx.strokeRect(34, 34, size - 68, size - 68);
  const padCount = 22;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < padCount; i++) {
      const along = margin + ((size - margin * 2) * (i + 0.5)) / padCount;
      const [x, y] = side === 0 ? [along, 62] : side === 1 ? [size - 62, along] : side === 2 ? [along, size - 62] : [62, along];
      ctx.fillStyle = '#c3c9d2';
      ctx.fillRect(x - 26, y - 26, 52, 52);
      ctx.fillStyle = '#9aa2af';
      ctx.fillRect(x - 18, y - 18, 36, 36);
      rough.ctx.fillStyle = '#303030';
      rough.ctx.fillRect(x - 26, y - 26, 52, 52);
      // Trilha do pad para dentro.
      ctx.strokeStyle = 'rgba(160,170,186,.55)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      if (side === 0) { ctx.moveTo(x, y + 26); ctx.lineTo(x, margin - 10); }
      if (side === 1) { ctx.moveTo(x - 26, y); ctx.lineTo(size - margin + 10, y); }
      if (side === 2) { ctx.moveTo(x, y - 26); ctx.lineTo(x, size - margin + 10); }
      if (side === 3) { ctx.moveTo(x + 26, y); ctx.lineTo(margin - 10, y); }
      ctx.stroke();
    }
  }

  const core = { x: margin, y: margin, w: size - margin * 2, h: size - margin * 2 };
  // Mar de células padrão: linhas de 7 px, larguras variadas, trilhos de alimentação.
  const rowHeight = 7;
  for (let y = core.y; y < core.y + core.h; y += rowHeight) {
    let x = core.x;
    while (x < core.x + core.w) {
      const width = 4 + Math.floor(random() * 22);
      const tone = 58 + Math.floor(random() * 26);
      ctx.fillStyle = `rgb(${tone - 8},${tone},${tone + 16})`;
      ctx.fillRect(x, y + 1, width - 1, rowHeight - 2);
      x += width;
    }
    ctx.fillStyle = 'rgba(150,160,178,.35)';
    ctx.fillRect(core.x, y, core.w, 1);
  }

  const block = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(190,198,212,.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    rough.ctx.fillStyle = '#464646';
    rough.ctx.fillRect(x, y, w, h);
  };

  // Dois macros de SRAM: grade regular de bitcells.
  for (const [x, y, w, h] of [[260, 260, 560, 420], [260, 740, 560, 420]] as const) {
    block(x, y, w, h, '#343d4f');
    ctx.fillStyle = 'rgba(120,134,160,.55)';
    for (let yy = y + 14; yy < y + h - 10; yy += 6) for (let xx = x + 14; xx < x + w - 10; xx += 6) ctx.fillRect(xx, yy, 3, 3);
    ctx.fillStyle = '#586379';
    ctx.fillRect(x, y + h / 2 - 8, w, 16);
    ctx.fillRect(x + w / 2 - 8, y, 16, h);
  }

  // Bloco analógico: capacitores interdigitados e resistores em serpentina (o front-end de carga).
  block(1180, 260, 600, 560, '#2f3746');
  ctx.strokeStyle = 'rgba(200,170,110,.8)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const bx = 1220 + (i % 2) * 280, by = 300 + Math.floor(i / 2) * 250;
    for (let f = 0; f < 18; f++) {
      ctx.beginPath();
      const fx = bx + f * 13;
      ctx.moveTo(fx, f % 2 ? by : by + 30);
      ctx.lineTo(fx, f % 2 ? by + 190 : by + 220);
      ctx.stroke();
    }
    ctx.strokeRect(bx - 6, by - 6, 240, 232);
  }
  ctx.strokeStyle = 'rgba(170,190,215,.7)';
  for (let r = 0; r < 3; r++) {
    ctx.beginPath();
    let x = 1200, y = 880 + r * 90;
    ctx.moveTo(x, y);
    for (let s = 0; s < 18; s++) {
      x += 30;
      ctx.lineTo(x, y + (s % 2 ? 0 : 60));
      ctx.lineTo(x, y + (s % 2 ? 60 : 0));
    }
    ctx.stroke();
  }
  block(1180, 1180, 600, 260, '#394355');
  // ADC sigma-delta e PLL: estruturas concêntricas.
  ctx.strokeStyle = 'rgba(210,216,228,.6)';
  for (let r = 20; r < 110; r += 12) { ctx.beginPath(); ctx.arc(1330, 1310, r, 0, Math.PI * 2); ctx.stroke(); }
  for (let r = 16; r < 100; r += 10) ctx.strokeRect(1560 - r, 1310 - r, r * 2, r * 2);

  // Barramentos grossos de metal de topo.
  ctx.fillStyle = 'rgba(176,186,202,.75)';
  for (const y of [720, 1170, 1500]) ctx.fillRect(core.x, y, core.w, 14);
  for (const x of [900, 1130]) ctx.fillRect(x, core.y, 14, core.h);
  rough.ctx.fillStyle = '#262626';
  for (const y of [720, 1170, 1500]) rough.ctx.fillRect(core.x, y, core.w, 14);
  for (const x of [900, 1130]) rough.ctx.fillRect(x, core.y, 14, core.h);

  ctx.fillStyle = 'rgba(220,226,236,.85)';
  ctx.font = `600 38px ${MONO_FONT}`;
  ctx.fillText('LUCA-IMU  ASIC R2', 260, 1760);
  ctx.font = `500 26px ${MONO_FONT}`;
  ctx.fillText('ΣΔ 16b · C/V FRONT-END · I²C/SPI', 260, 1800);
  speckle(ctx, size, size, random, 5000, '#ffffff', 2, 0.08);

  return { map: toTexture(canvas), roughness: toTexture(rough.canvas, { srgb: false }) };
}

// ------------------------------------------------------------- MEMS die

/** Campo do die MEMS fora das estruturas: preenchimento, marcas de alinhamento e gravação. */
export function dieFieldTexture() {
  const size = 1024;
  const { canvas, ctx } = makeCanvas(size, size);
  const random = seeded(19);
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#9aa1ad');
  gradient.addColorStop(1, '#838b98');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(70,78,92,.35)';
  for (let y = 8; y < size; y += 16) for (let x = 8; x < size; x += 16) if (random() > 0.3) ctx.fillRect(x, y, 6, 6);
  const cross = (x: number, y: number) => {
    ctx.fillStyle = 'rgba(40,46,58,.8)';
    ctx.fillRect(x - 22, y - 3, 44, 6);
    ctx.fillRect(x - 3, y - 22, 6, 44);
    ctx.strokeStyle = 'rgba(40,46,58,.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 30, y - 30, 60, 60);
  };
  cross(60, 60); cross(size - 60, 60); cross(60, size - 60); cross(size - 60, size - 60);
  ctx.fillStyle = 'rgba(30,36,46,.75)';
  ctx.font = `600 22px ${MONO_FONT}`;
  ctx.fillText('LUCA-IMU MEMS R2', 110, size - 52);
  ctx.font = `500 16px ${MONO_FONT}`;
  ctx.fillText('ACC XYZ · GYR Z · 2026', 110, size - 30);
  return toTexture(canvas);
}

// ------------------------------------------------------------ package

/** Tampa de epóxi com marcação a laser (mais clara e fosca que o molde). */
export function moldMarkingTexture() {
  const size = 1024;
  const { canvas, ctx } = makeCanvas(size, size);
  const random = seeded(5);
  ctx.fillStyle = '#1a1c20';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, random, 26000, '#ffffff', 1.6, 0.05);
  ctx.fillStyle = 'rgba(178,184,194,.78)';
  ctx.textAlign = 'center';
  ctx.font = `700 150px ${DISPLAY_FONT}`;
  ctx.fillText('LUCA', size / 2, 470);
  ctx.font = `500 66px ${MONO_FONT}`;
  ctx.fillText('IMU-6  ACC+GYR', size / 2, 590);
  ctx.font = `500 54px ${MONO_FONT}`;
  ctx.fillText('2638 · BR · R2', size / 2, 680);
  ctx.beginPath();
  ctx.arc(150, 150, 44, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,9,11,.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,126,136,.5)';
  ctx.lineWidth = 4;
  ctx.stroke();
  return toTexture(canvas);
}

// --------------------------------------------------------------- bench

/** Régua gravada na borda da bancada: milímetros e centímetros. */
export function rulerTexture() {
  const width = 4096, height = 128;
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = '#15181d';
  ctx.fillRect(0, 0, width, height);
  const cm = width / 30;
  ctx.fillStyle = '#c8ced8';
  ctx.font = `500 30px ${MONO_FONT}`;
  ctx.textAlign = 'center';
  for (let i = 0; i <= 300; i++) {
    const x = (i * cm) / 10;
    const major = i % 10 === 0, half = i % 5 === 0;
    ctx.globalAlpha = major ? 0.95 : half ? 0.75 : 0.5;
    ctx.fillRect(x - (major ? 2 : 1), 0, major ? 4 : 2, major ? 56 : half ? 40 : 24);
    if (major && i > 0 && i < 300) ctx.fillText(String(i / 10), x, 96);
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, { anisotropy: 16 });
}

/** Asfalto da plataforma: agregado, faixa amarela tracejada e bordas brancas. */
export function asphaltTexture() {
  const width = 1024, height = 512;
  const { canvas, ctx } = makeCanvas(width, height);
  const random = seeded(88);
  ctx.fillStyle = '#34373c';
  ctx.fillRect(0, 0, width, height);
  speckle(ctx, width, height, random, 60000, '#0d0e10', 2.2, 0.55);
  speckle(ctx, width, height, random, 26000, '#9a9ea6', 1.6, 0.4);
  ctx.fillStyle = 'rgba(28,30,33,.55)';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(random() * width, random() * height, 40 + random() * 120, 16 + random() * 40, random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e7e3d6';
  ctx.fillRect(0, 26, width, 12);
  ctx.fillRect(0, height - 38, width, 12);
  ctx.fillStyle = '#e8b53c';
  for (let x = 0; x < width; x += 256) ctx.fillRect(x + 20, height / 2 - 6, 150, 12);
  speckle(ctx, width, height, random, 9000, '#1a1b1e', 2, 0.5);
  return toTexture(canvas, { repeat: [1, 1] });
}

/** Piso polido em placas grandes com rejunte discreto. */
export function floorTextures() {
  const size = 2048;
  const { canvas, ctx } = makeCanvas(size, size);
  const rough = makeCanvas(size, size);
  const random = seeded(3);
  const tile = size / 4;
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const tone = 104 + Math.floor(random() * 14);
      ctx.fillStyle = `rgb(${tone + 6},${tone + 2},${tone - 4})`;
      ctx.fillRect(tx * tile, ty * tile, tile, tile);
      const r = 70 + Math.floor(random() * 30);
      rough.ctx.fillStyle = `rgb(${r},${r},${r})`;
      rough.ctx.fillRect(tx * tile, ty * tile, tile, tile);
    }
  }
  for (let i = 0; i < 90; i++) {
    const x = random() * size, y = random() * size, radius = 40 + random() * 220;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const light = random() > 0.5;
    glow.addColorStop(0, light ? 'rgba(255,250,240,.06)' : 'rgba(40,34,28,.07)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  speckle(ctx, size, size, random, 40000, '#ffffff', 1.4, 0.05);
  ctx.fillStyle = '#4b4843';
  rough.ctx.fillStyle = '#d0d0d0';
  for (let i = 0; i <= 4; i++) {
    ctx.fillRect(i * tile - 3, 0, 6, size);
    ctx.fillRect(0, i * tile - 3, size, 6);
    rough.ctx.fillRect(i * tile - 4, 0, 8, size);
    rough.ctx.fillRect(0, i * tile - 4, size, 8);
  }
  return { map: toTexture(canvas, { repeat: [7, 5] }), roughness: toTexture(rough.canvas, { srgb: false, repeat: [7, 5] }) };
}

/** Wafer de 200 mm com centenas de dies: difração que muda de cor com o ângulo. */
export function waferTexture() {
  const size = 2048;
  const { canvas, ctx } = makeCanvas(size, size);
  const center = size / 2, radius = size / 2 - 8;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#6d7482';
  ctx.fillRect(0, 0, size, size);
  const die = 58;
  for (let y = center - radius; y < center + radius; y += die) {
    for (let x = center - radius; x < center + radius; x += die) {
      const dx = x + die / 2 - center, dy = y + die / 2 - center;
      if (Math.hypot(dx, dy) > radius - 50) continue;
      const hue = (Math.atan2(dy, dx) * 180) / Math.PI + Math.hypot(dx, dy) * 0.18;
      ctx.fillStyle = `hsl(${(hue + 360) % 360}, 34%, ${46 + ((x + y) % 7)}%)`;
      ctx.fillRect(x + 3, y + 3, die - 6, die - 6);
      ctx.fillStyle = 'rgba(210,216,226,.45)';
      ctx.fillRect(x + 10, y + 10, die * 0.42, die * 0.42);
      ctx.fillStyle = 'rgba(30,34,44,.4)';
      ctx.fillRect(x + die * 0.58, y + 10, die * 0.3, die - 20);
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(200,206,216,.9)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(center, center, radius - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#10141c';
  ctx.beginPath();
  ctx.arc(center, size - 10, 22, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas);
}

/** Quadro branco com a conta da massa de prova, em traço de pincel. */
export function whiteboardTexture() {
  const width = 2048, height = 1024;
  const { canvas, ctx } = makeCanvas(width, height);
  const random = seeded(12);
  ctx.fillStyle = '#e9ebe8';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(120,130,140,${0.02 + random() * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(random() * width, random() * height, 60 + random() * 260, 20 + random() * 60, random(), 0, Math.PI * 2);
    ctx.fill();
  }
  const hand = (text: string, x: number, y: number, size: number, color: string, weight = 500) => {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${DISPLAY_FONT}`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.012);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  hand('F = m · a', 110, 170, 84, '#1f3f86', 600);
  hand('x = a / ω₀²', 110, 290, 84, '#1f3f86', 600);
  hand('≈ 8 nm por g', 560, 290, 60, '#b23a3a', 600);
  hand('C = ε · A / d', 110, 420, 76, '#1f3f86', 600);
  hand('ΔC ≈ 3 fF por g', 620, 420, 56, '#b23a3a', 600);
  hand('tomba quando a seta sai das rodas', 110, 590, 54, '#2b2f36');
  hand('a_lat / g > 0,40', 110, 680, 70, '#1d6b52', 600);
  hand('LUCA avisa em 0,8 × limite', 110, 790, 56, '#1d6b52');
  // Esboço: massa, mola e parede.
  ctx.strokeStyle = '#2b2f36';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1400, 160); ctx.lineTo(1400, 470);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(1400, 180 + i * 42); ctx.lineTo(1370, 210 + i * 42);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(1400, 315);
  let x = 1400;
  for (let i = 0; i < 9; i++) { x += 30; ctx.lineTo(x, i % 2 ? 285 : 345); }
  ctx.lineTo(x + 30, 315);
  ctx.stroke();
  ctx.strokeRect(x + 30, 245, 170, 140);
  hand('m', x + 95, 335, 64, '#2b2f36', 600);
  ctx.strokeStyle = '#b23a3a';
  ctx.beginPath();
  ctx.moveTo(x + 230, 315); ctx.lineTo(x + 330, 315);
  ctx.lineTo(x + 300, 295); ctx.moveTo(x + 330, 315); ctx.lineTo(x + 300, 335);
  ctx.stroke();
  hand('a', x + 280, 280, 54, '#b23a3a', 600);
  // Caminhão em corte e a seta de carga.
  ctx.strokeStyle = '#2b2f36';
  ctx.lineWidth = 6;
  ctx.strokeRect(1360, 560, 300, 230);
  ctx.beginPath(); ctx.arc(1410, 820, 30, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(1610, 820, 30, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1300, 850); ctx.lineTo(1740, 850); ctx.stroke();
  ctx.strokeStyle = '#d0801e';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(1510, 660); ctx.lineTo(1640, 846); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1640, 846); ctx.lineTo(1636, 806); ctx.moveTo(1640, 846); ctx.lineTo(1606, 826); ctx.stroke();
  ctx.fillStyle = '#2b2f36';
  ctx.beginPath(); ctx.arc(1510, 660, 12, 0, Math.PI * 2); ctx.fill();
  return toTexture(canvas);
}

/** Gradiente vertical para os feixes de luz da janela. */
export function beamTexture() {
  const { canvas, ctx } = makeCanvas(64, 256);
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,.9)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 256);
  const side = ctx.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.25, 'rgba(0,0,0,0)');
  side.addColorStop(0.75, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, 64, 256);
  return toTexture(canvas);
}

/** Lavoura vista de longe: talhões com fileiras, estradas de terra e manchas. */
export function farmlandTexture() {
  const size = 2048;
  const { canvas, ctx } = makeCanvas(size, size);
  const random = seeded(41);
  ctx.fillStyle = '#6b7a3a';
  ctx.fillRect(0, 0, size, size);
  const palette = ['#8a8f3c', '#a8923e', '#6f8a38', '#c0a24a', '#5f7a34', '#94803a'];
  const cells = 6;
  const cell = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const color = palette[Math.floor(random() * palette.length)];
      ctx.fillStyle = color;
      ctx.fillRect(x * cell, y * cell, cell, cell);
      ctx.strokeStyle = 'rgba(40,46,20,.35)';
      ctx.lineWidth = 3;
      const vertical = random() > 0.5;
      for (let i = 0; i < cell; i += 9) {
        ctx.beginPath();
        if (vertical) { ctx.moveTo(x * cell + i, y * cell); ctx.lineTo(x * cell + i, (y + 1) * cell); }
        else { ctx.moveTo(x * cell, y * cell + i); ctx.lineTo((x + 1) * cell, y * cell + i); }
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = '#b98a5a';
  for (let i = 1; i < cells; i++) {
    ctx.fillRect(i * cell - 7, 0, 14, size);
    ctx.fillRect(0, i * cell - 7, size, 14);
  }
  speckle(ctx, size, size, random, 30000, '#1e2410', 3, 0.18);
  return toTexture(canvas, { repeat: [6, 6] });
}

/** Plaqueta gravada na frente da bancada. */
export function plateTexture(title: string, subtitle: string) {
  const width = 1024, height = 256;
  const { canvas, ctx } = makeCanvas(width, height);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#2a2e35');
  gradient.addColorStop(1, '#16191e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(220,226,236,.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, width - 20, height - 20);
  ctx.fillStyle = '#d8dde6';
  ctx.textAlign = 'center';
  ctx.font = `700 92px ${DISPLAY_FONT}`;
  ctx.fillText(title, width / 2, 136);
  ctx.fillStyle = 'rgba(190,198,210,.8)';
  ctx.font = `500 34px ${MONO_FONT}`;
  ctx.fillText(subtitle, width / 2, 196);
  return toTexture(canvas);
}
