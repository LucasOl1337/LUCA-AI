/**
 * Física do laboratório "A massa de prova" (/sensor).
 *
 * Tudo é forma fechada do relógio: o mesmo (cenário, parâmetro, t) devolve
 * sempre a mesma leitura, então cena 3D, osciloscópio e testes concordam.
 *
 * Referencial do veículo (ISO 8855): x para a frente, y para a esquerda, z para
 * cima. Rolagem positiva = lado direito desce. Arfagem positiva = nariz desce.
 * O acelerômetro mede força específica f = a − g: parado e nivelado lê +1 g em z.
 * A massa de prova se desloca no sentido oposto a f (fica "para trás").
 */

export const G = 9.80665;

/** Acelerômetro capacitivo de IMU MEMS: ordens de grandeza de folha de dados. */
export const MEMS = Object.freeze({
  resonanceHz: 5500,
  proofMassUg: 10,
  gapUm: 1.4,
  fingerPairs: 24,
  overlapUm: 90,
  thicknessUm: 20,
  fullScaleG: 2,
  adcBits: 16,
  sampleHz: 100,
  gyroDriveKHz: 27,
});

const EPS0 = 8.8541878128e-12;
const OMEGA0 = 2 * Math.PI * MEMS.resonanceHz;

/** Quanto 1 g empurra a massa: x = a / ω0². */
export const NM_PER_G = (G / OMEGA0 ** 2) * 1e9;
/** Mola equivalente: k = m ω0². */
export const SPRING_N_PER_M = MEMS.proofMassUg * 1e-9 * OMEGA0 ** 2;
/** Capacitância de repouso de cada lado do pente (placas paralelas). */
export const C0_FF = (MEMS.fingerPairs * EPS0 * MEMS.overlapUm * 1e-6 * MEMS.thicknessUm * 1e-6 / (MEMS.gapUm * 1e-6)) * 1e15;
/** Conversor de 16 bits em ±2 g. */
export const COUNTS_PER_G = 2 ** (MEMS.adcBits - 1) / MEMS.fullScaleG;
/** Fração do vão que 1 g fecha de verdade (~0,6%) e no modo ampliado da cena. */
export const REAL_GAP_PER_G = NM_PER_G / (MEMS.gapUm * 1000);
export const VISUAL_GAP_PER_G = 0.42;
export const VISUAL_GAIN = VISUAL_GAP_PER_G / REAL_GAP_PER_G;

/** Caminhão baú carregado, ilustrativo. */
export const TRUCK = Object.freeze({
  trackM: 1.9,
  cgHeightM: 1.75,
  wheelbaseM: 5,
  // Limiar efetivo: a geometria sozinha daria T/2h = 0,54 g, mas suspensão,
  // pneus e carga deslocada comem parte da base.
  rolloverG: 0.4,
  rollGradientDegPerG: 15,
  pitchGradientDegPerG: 6,
  curveRadiusM: 65,
  cruiseKph: 50,
});

/** Frações do limiar de tombamento e limites de evento (ilustrativos). */
export const THRESHOLDS = Object.freeze({
  attention: 0.6,
  alert: 0.8,
  hardBrakeG: 0.4,
  brakeAttentionG: 0.25,
  impactG: 0.9,
  impactAttentionG: 0.5,
});

export const SLOPE_TIP_DEG = (Math.atan(TRUCK.rolloverG) * 180) / Math.PI;

export const SENSOR_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'encosta', label: 'Encosta', key: '1', param: Object.freeze({ label: 'Inclinação', unit: '°', min: 0, max: 30, step: 0.5, value: 8, digits: 1 }) }),
  Object.freeze({ id: 'curva', label: 'Curva', key: '2', param: Object.freeze({ label: 'Velocidade', unit: 'km/h', min: 20, max: 70, step: 1, value: 44, digits: 0 }) }),
  Object.freeze({ id: 'frenada', label: 'Frenada', key: '3', param: Object.freeze({ label: 'Desaceleração', unit: 'g', min: 0.15, max: 0.7, step: 0.01, value: 0.32, digits: 2 }) }),
  Object.freeze({ id: 'buraco', label: 'Buraco', key: '4', param: Object.freeze({ label: 'Profundidade', unit: 'cm', min: 2, max: 14, step: 0.5, value: 5, digits: 1 }) }),
]);

export function getSensorScenario(id) {
  return SENSOR_SCENARIOS.find((scenario) => scenario.id === id) || SENSOR_SCENARIOS[1];
}

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const smooth = (u) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };
const rad = (degrees) => (degrees * Math.PI) / 180;
const toDeg = (radians) => (radians * 180) / Math.PI;

/** Leva um vetor do referencial da pista para o do corpo: Rx(rolagem)ᵀ · Ry(arfagem)ᵀ · v. */
function toBody(v, rollRad, pitchRad) {
  const cp = Math.cos(pitchRad), sp = Math.sin(pitchRad);
  const x1 = cp * v.x - sp * v.z;
  const z1 = sp * v.x + cp * v.z;
  const cr = Math.cos(rollRad), sr = Math.sin(rollRad);
  return { x: x1, y: cr * v.y + sr * z1, z: -sr * v.y + cr * z1 };
}

/** Inverte o smoothstep em [0, 1] por bisseção (monótono). */
function invertSmooth(target) {
  if (target <= 0) return 0;
  if (target >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (smooth(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- tombamento

const TIP_FALL_S = 1.25;
const TIP_REST_S = 2.8;
const TIP_ACCEL = (2 * (Math.PI / 2)) / TIP_FALL_S ** 2;

/** Rotação rígida em torno da linha de contato das rodas de fora. */
function tipAngle(tau) {
  if (tau <= 0) return 0;
  if (tau < TIP_FALL_S) return 0.5 * TIP_ACCEL * tau * tau;
  const after = tau - TIP_FALL_S;
  return Math.PI / 2 + rad(2.5) * Math.exp(-5 * after) * Math.sin(16 * after);
}

/** Pico de impacto no eixo do corpo que ficou virado para o chão. */
function tipImpact(tau) {
  const after = tau - TIP_FALL_S;
  if (after < 0) return 0;
  return G * (4.8 * Math.exp(-after / 0.05) + 1.2 * Math.exp(-after / 0.12) * Math.sin(2 * Math.PI * 9 * after));
}

// ------------------------------------------------------------------- roteiros

const CURVE = Object.freeze({ straightIn: 1.2, entry: 2.5, hold: 3, exit: 2, straightOut: 1.3 });
const CURVE_PERIOD = CURVE.straightIn + CURVE.entry + CURVE.hold + CURVE.exit + CURVE.straightOut;
const SLOPE_STAND_S = 0.6;
const BRAKE = Object.freeze({ cruise: 1.2, onset: 0.35, hold: 2.2 });
const BUMP = Object.freeze({ cruise: 1.4, period: 5.5, gPerCm: 0.14, rearShare: 0.8 });

function curveK(t) {
  const { straightIn, entry, hold, exit } = CURVE;
  if (t < straightIn) return 0;
  if (t < straightIn + entry) return smooth((t - straightIn) / entry);
  if (t < straightIn + entry + hold) return 1;
  if (t < straightIn + entry + hold + exit) return 1 - smooth((t - straightIn - entry - hold) / exit);
  return 0;
}

function brakeTimes(decelG) {
  const v0 = TRUCK.cruiseKph / 3.6;
  const a = decelG * G;
  const stopAt = BRAKE.cruise + BRAKE.onset + Math.max(0, (v0 - (a * BRAKE.onset) / 2) / a);
  return { v0, a, stopAt, period: stopAt + BRAKE.hold };
}

function bumpTimes(depthCm) {
  const v = TRUCK.cruiseKph / 3.6;
  const front = BUMP.cruise;
  return { v, front, rear: front + TRUCK.wheelbaseM / v, amplitudeG: depthCm * BUMP.gPerCm };
}

/** Pulso vertical de uma roda no buraco: queda curta, batida na borda, balanço da carroceria. */
function bumpPulse(tau, amplitudeG) {
  if (tau < 0) return 0;
  const dip = -0.35 * Math.exp(-(((tau - 0.02) / 0.018) ** 2));
  const hitTau = tau - 0.045;
  const hit = hitTau > 0 ? (hitTau / 0.018) * Math.exp(1 - hitTau / 0.018) : 0;
  const sway = 0.3 * Math.exp(-tau / 0.55) * Math.sin(2 * Math.PI * 1.8 * tau);
  return amplitudeG * G * (dip + hit + sway);
}

const timelineCache = new Map();

/**
 * Linha do tempo de um ensaio: período do laço, instante do tombamento (se
 * houver) e dos avisos. Os avisos vêm da mesma razão lateral que derruba o
 * caminhão, então a antecedência é consequência da física, não um número colado.
 */
export function scenarioTimeline(id, param) {
  const key = `${id}:${param}`;
  const cached = timelineCache.get(key);
  if (cached) return cached;
  let result;
  if (id === 'encosta') {
    const ratio = Math.tan(rad(param)) / TRUCK.rolloverG;
    const tips = param >= SLOPE_TIP_DEG;
    result = {
      periodS: tips ? SLOPE_STAND_S + TIP_FALL_S + TIP_REST_S : Infinity,
      tipAtS: tips ? SLOPE_STAND_S : null,
      alertAtS: ratio >= THRESHOLDS.alert ? 0 : null,
      attentionAtS: ratio >= THRESHOLDS.attention ? 0 : null,
      peakRatio: ratio,
    };
  } else if (id === 'curva') {
    const v = param / 3.6;
    const fullRatio = (v * v) / TRUCK.curveRadiusM / G / TRUCK.rolloverG;
    const crossing = (fraction) => (fullRatio >= fraction ? CURVE.straightIn + CURVE.entry * invertSmooth(fraction / fullRatio) : null);
    const tipAtS = crossing(1);
    result = {
      periodS: tipAtS === null ? CURVE_PERIOD : tipAtS + TIP_FALL_S + TIP_REST_S,
      tipAtS,
      alertAtS: crossing(THRESHOLDS.alert),
      attentionAtS: crossing(THRESHOLDS.attention),
      peakRatio: fullRatio,
    };
  } else if (id === 'frenada') {
    const { period } = brakeTimes(param);
    const onsetAt = (fraction) => BRAKE.cruise + BRAKE.onset * invertSmooth(fraction);
    result = {
      periodS: period,
      tipAtS: null,
      alertAtS: param >= THRESHOLDS.hardBrakeG ? onsetAt(THRESHOLDS.hardBrakeG / param) : null,
      attentionAtS: param >= THRESHOLDS.brakeAttentionG ? onsetAt(THRESHOLDS.brakeAttentionG / param) : null,
      peakRatio: param / THRESHOLDS.hardBrakeG,
    };
  } else {
    const { front, amplitudeG } = bumpTimes(param);
    // O aviso sai do pico do próprio sinal, amostrado como o firmware faria.
    let peakG = 0, peakAt = front;
    for (let tau = 0; tau < 0.35; tau += 0.001) {
      const value = Math.abs(bumpPulse(tau, amplitudeG)) / G;
      if (value > peakG) { peakG = value; peakAt = front + tau; }
    }
    result = {
      periodS: BUMP.period,
      tipAtS: null,
      alertAtS: peakG >= THRESHOLDS.impactG ? peakAt : null,
      attentionAtS: peakG >= THRESHOLDS.impactAttentionG ? peakAt : null,
      peakRatio: peakG / THRESHOLDS.impactG,
    };
  }
  timelineCache.set(key, Object.freeze(result));
  if (timelineCache.size > 400) timelineCache.delete(timelineCache.keys().next().value);
  return timelineCache.get(key);
}

/** Estado cinemático do veículo no instante t (já dentro do laço). */
function vehicleAt(id, param, t) {
  const timeline = scenarioTimeline(id, param);
  const state = {
    phase: 'parado',
    speedKph: 0,
    roadRoll: 0,
    roadPitch: 0,
    bodyRoll: 0,
    bodyPitch: 0,
    heaveM: 0,
    tip: 0,
    tipSide: 1,
    // Aceleração cinemática no referencial da pista, sem gravidade (m/s²).
    accel: { x: 0, y: 0, z: 0 },
    // Pico de impacto já no referencial do corpo (m/s²).
    shock: { x: 0, y: 0, z: 0 },
    yawRate: 0,
    curveK: 0,
    ratio: 0,
  };

  if (id === 'encosta') {
    state.roadRoll = rad(param);
    state.ratio = timeline.peakRatio;
    state.bodyRoll = rad(TRUCK.rollGradientDegPerG * Math.tan(state.roadRoll) * 0.35);
    state.phase = param < 0.5 ? 'nivelado' : 'na encosta';
    if (timeline.tipAtS !== null && t >= timeline.tipAtS) {
      const tau = t - timeline.tipAtS;
      state.tip = tipAngle(tau);
      state.shock.y = tipImpact(tau);
      state.phase = tau < TIP_FALL_S ? 'tombando' : 'tombado';
    }
    return state;
  }

  if (id === 'curva') {
    const v = param / 3.6;
    const tipAt = timeline.tipAtS;
    const tipping = tipAt !== null && t >= tipAt;
    const k = tipping ? curveK(tipAt) : curveK(t);
    const lateral = ((v * v) / TRUCK.curveRadiusM) * k;
    state.speedKph = param;
    state.curveK = k;
    state.yawRate = (v / TRUCK.curveRadiusM) * k;
    state.accel.y = lateral;
    state.ratio = lateral / G / TRUCK.rolloverG;
    state.bodyRoll = rad(TRUCK.rollGradientDegPerG * (lateral / G));
    const { straightIn, entry, hold, exit } = CURVE;
    state.phase = t < straightIn ? 'reta' : t < straightIn + entry ? 'entrando na curva' : t < straightIn + entry + hold ? 'na curva' : t < straightIn + entry + hold + exit ? 'saindo da curva' : 'reta';
    if (tipping) {
      const tau = t - tipAt;
      const fade = 1 - smooth(tau / 1.4);
      state.tip = tipAngle(tau);
      state.accel.y = lateral * fade;
      state.yawRate *= fade;
      state.curveK = k * fade;
      state.speedKph = param * Math.max(0, 1 - smooth((tau - 0.4) / 2.4));
      state.accel.x = tau > TIP_FALL_S ? -0.45 * G * Math.exp(-(tau - TIP_FALL_S) / 0.8) : 0;
      state.shock.y = tipImpact(tau);
      state.phase = tau < TIP_FALL_S ? 'tombando' : 'tombado';
    }
    return state;
  }

  if (id === 'frenada') {
    const { v0, a, stopAt } = brakeTimes(param);
    const brakeStart = BRAKE.cruise;
    if (t < brakeStart) {
      state.speedKph = v0 * 3.6;
      state.phase = 'rodando';
      return state;
    }
    if (t < stopAt) {
      const ramp = smooth((t - brakeStart) / BRAKE.onset);
      const onsetSpent = Math.min(t - brakeStart, BRAKE.onset);
      const lost = t - brakeStart <= BRAKE.onset
        ? a * (t - brakeStart) * ramp * 0.5
        : (a * BRAKE.onset) / 2 + a * (t - brakeStart - onsetSpent);
      state.speedKph = Math.max(0, v0 - lost) * 3.6;
      state.accel.x = -a * ramp;
      state.bodyPitch = rad(TRUCK.pitchGradientDegPerG * param * ramp);
      state.phase = 'freando';
      return state;
    }
    const after = t - stopAt;
    const dive = rad(TRUCK.pitchGradientDegPerG * param);
    state.bodyPitch = dive * Math.exp(-3 * after) * Math.cos(2 * Math.PI * 1.4 * after);
    state.phase = 'parado';
    return state;
  }

  const { v, front, rear, amplitudeG } = bumpTimes(param);
  const rearAmplitude = amplitudeG * BUMP.rearShare;
  state.speedKph = v * 3.6;
  const zFront = bumpPulse(t - front, amplitudeG);
  const zRear = bumpPulse(t - rear, rearAmplitude);
  state.accel.z = zFront + zRear;
  state.accel.x = -0.12 * (Math.max(0, zFront) + Math.max(0, zRear));
  const pitchWave = (tau, amp, sign) => (tau < 0 ? 0 : sign * rad(1.4) * amp * Math.exp(-tau / 0.6) * Math.sin(2 * Math.PI * 1.5 * tau));
  state.bodyPitch = pitchWave(t - front, amplitudeG, 1) + pitchWave(t - rear, rearAmplitude, -1);
  const heave = (tau, amp) => (tau < 0 ? 0 : -0.035 * amp * Math.exp(-tau / 0.5) * Math.sin(2 * Math.PI * 1.8 * tau + 0.4));
  state.heaveM = heave(t - front, amplitudeG) + heave(t - rear, rearAmplitude);
  state.phase = t < front ? 'rodando' : t < rear + 0.25 ? 'no buraco' : 'rodando';
  return state;
}

/** Força específica no sensor, no referencial do corpo (m/s²). */
function specificForce(state) {
  // Pista: aceleração cinemática + reação à gravidade vista pelo chão inclinado.
  const gravity = toBody({ x: 0, y: 0, z: G }, state.roadRoll, state.roadPitch);
  const road = { x: state.accel.x + gravity.x, y: state.accel.y + gravity.y, z: state.accel.z + gravity.z };
  const roll = state.bodyRoll + state.tip * state.tipSide;
  const body = toBody(road, roll, state.bodyPitch);
  return { x: body.x + state.shock.x, y: body.y + state.shock.y, z: body.z + state.shock.z };
}

/** Resposta do acelerômetro: deslocamento, capacitâncias e contagens por eixo. */
export function memsResponse(force) {
  const axis = (a) => {
    const nm = (-a / OMEGA0 ** 2) * 1e9;
    const fraction = nm / (MEMS.gapUm * 1000);
    const safe = clamp(fraction, -0.95, 0.95);
    const plusFF = C0_FF / (1 - safe);
    const minusFF = C0_FF / (1 + safe);
    return {
      nm,
      gapFraction: fraction,
      plusFF,
      minusFF,
      deltaFF: plusFF - minusFF,
      counts: clamp(Math.round((a / G) * COUNTS_PER_G), -32768, 32767),
    };
  };
  return { x: axis(force.x), y: axis(force.y), z: axis(force.z) };
}

function classify(id, state, forceG, timeline, t) {
  const flags = { riscoInclinacao: false, frenagemBrusca: false, impacto: false };
  let level = 'estavel';
  if (id === 'encosta' || id === 'curva') {
    if (state.tip > 0) level = 'tombou';
    else if (state.ratio >= THRESHOLDS.alert) level = 'risco';
    else if (state.ratio >= THRESHOLDS.attention) level = 'atencao';
    flags.riscoInclinacao = level === 'risco' || level === 'tombou';
  } else if (id === 'frenada') {
    const decel = Math.max(0, -state.accel.x) / G;
    if (decel >= THRESHOLDS.hardBrakeG) level = 'risco';
    else if (decel >= THRESHOLDS.brakeAttentionG) level = 'atencao';
    flags.frenagemBrusca = level === 'risco';
  } else {
    const since = timeline.attentionAtS === null ? -1 : t - timeline.attentionAtS;
    const recent = since >= 0 && since < 0.9;
    if (recent && timeline.alertAtS !== null) level = 'risco';
    else if (recent) level = 'atencao';
    else if (Math.abs(forceG.z - 1) >= THRESHOLDS.impactAttentionG) level = 'atencao';
    flags.impacto = level === 'risco';
  }
  return { level, flags };
}

export function scenarioPeriod(id, param) {
  return scenarioTimeline(id, param).periodS;
}

/**
 * Leitura completa do laboratório. `t` é o tempo desde o início do ensaio; os
 * roteiros com período finito se repetem sozinhos.
 */
export function sampleSensorLab(id, param, t) {
  const scenario = getSensorScenario(id);
  const value = clamp(Number.isFinite(param) ? param : scenario.param.value, scenario.param.min, scenario.param.max);
  const timeline = scenarioTimeline(scenario.id, value);
  const loopT = Number.isFinite(timeline.periodS) ? ((t % timeline.periodS) + timeline.periodS) % timeline.periodS : Math.max(0, t);
  const state = vehicleAt(scenario.id, value, loopT);
  const force = specificForce(state);
  const forceG = { x: force.x / G, y: force.y / G, z: force.z / G };

  // Giroscópio: derivada numérica das atitudes + guinada analítica da curva.
  const dt = 1e-3;
  const before = vehicleAt(scenario.id, value, Math.max(0, loopT - dt));
  const after = vehicleAt(scenario.id, value, loopT + dt);
  const span = loopT - dt < 0 ? dt : 2 * dt;
  const rollOf = (s) => s.roadRoll + s.bodyRoll + s.tip * s.tipSide;
  const pitchOf = (s) => s.roadPitch + s.bodyPitch;
  const gyroDps = {
    x: toDeg((rollOf(after) - rollOf(before)) / span),
    y: toDeg((pitchOf(after) - pitchOf(before)) / span),
    z: toDeg(state.yawRate),
  };

  const { level, flags } = classify(scenario.id, state, forceG, timeline, loopT);
  const alertLeadS = timeline.tipAtS !== null && timeline.alertAtS !== null ? timeline.tipAtS - timeline.alertAtS : null;
  // Mesma razão que decide o tombamento: lateral sobre vertical, no chão.
  const lateralG = scenario.id === 'encosta' ? Math.tan(state.roadRoll) : state.accel.y / G;

  return {
    id: scenario.id,
    param: value,
    t,
    loopT,
    periodS: timeline.periodS,
    phase: state.phase,
    speedKph: state.speedKph,
    road: { rollDeg: toDeg(state.roadRoll), pitchDeg: toDeg(state.roadPitch) },
    body: { rollDeg: toDeg(state.bodyRoll), pitchDeg: toDeg(state.bodyPitch), heaveM: state.heaveM },
    tip: { deg: toDeg(state.tip), side: state.tipSide },
    curve: { k: state.curveK, radiusM: TRUCK.curveRadiusM },
    lateralG,
    ratio: state.ratio,
    force,
    forceG,
    gyroDps,
    level,
    flags,
    alertLeadS,
    timeline,
    mems: memsResponse(force),
  };
}

/** Pacote no formato do contrato do ESP32 (docs/sompo.md), em g e °/s. */
export function telemetryPacket(reading) {
  const round = (value, digits) => Number(value.toFixed(digits)) + 0;
  return {
    aceleracaoX: round(reading.forceG.x, 2),
    aceleracaoY: round(reading.forceG.y, 2),
    aceleracaoZ: round(reading.forceG.z, 2),
    rotacaoX: round(reading.gyroDps.x, 1),
    rotacaoY: round(reading.gyroDps.y, 1),
    rotacaoZ: round(reading.gyroDps.z, 1),
    riscoInclinacao: reading.flags.riscoInclinacao,
  };
}
