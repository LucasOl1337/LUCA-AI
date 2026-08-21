export const SOMPO_TELEMETRY_PATH = '/trator/001/sensores';

const READING_KEYS = [
  'distancia',
  'temperatura',
  'umidade',
  'pitch',
  'roll',
  'aceleracaoX',
  'aceleracaoY',
  'aceleracaoZ',
  'rotacaoX',
  'rotacaoY',
  'rotacaoZ',
];

function finiteNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function sensorFlag(value) {
  return value === true || value === 1 || String(value).toLowerCase() === 'true';
}

function vector(x, y, z) {
  const values = [x, y, z];
  const magnitude = values.every((value) => value !== null)
    ? Math.sqrt(values.reduce((sum, value) => sum + (value ** 2), 0))
    : null;
  return { x, y, z, magnitude };
}

function assertTelemetryPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('sompo_telemetry_invalid_payload');
  }
  const hasReading = READING_KEYS.some((key) => finiteNumber(raw[key]) !== null);
  const hasRiskFlag = Object.hasOwn(raw, 'riscoColisao') || Object.hasOwn(raw, 'riscoInclinacao');
  if (!hasReading && !hasRiskFlag) {
    throw new Error('sompo_telemetry_empty_payload');
  }
}

export function normalizeSompoTelemetry(raw, { observedAt = new Date().toISOString() } = {}) {
  assertTelemetryPayload(raw);

  const acceleration = vector(
    finiteNumber(raw.aceleracaoX),
    finiteNumber(raw.aceleracaoY),
    finiteNumber(raw.aceleracaoZ),
  );
  const rotation = vector(
    finiteNumber(raw.rotacaoX),
    finiteNumber(raw.rotacaoY),
    finiteNumber(raw.rotacaoZ),
  );
  const collision = sensorFlag(raw.riscoColisao);
  const inclination = sensorFlag(raw.riscoInclinacao);

  return {
    tractorId: String(raw.trator || '001').trim() || '001',
    observedAt,
    changedAt: observedAt,
    unchangedForMs: 0,
    freshness: 'checking',
    deviceTimestamp: finiteNumber(raw.timestamp),
    status: collision || inclination ? 'alert' : 'normal',
    risks: {
      collision,
      inclination,
    },
    readings: {
      distance: finiteNumber(raw.distancia),
      temperature: finiteNumber(raw.temperatura),
      humidity: finiteNumber(raw.umidade),
      pitch: finiteNumber(raw.pitch),
      roll: finiteNumber(raw.roll),
      acceleration,
      rotation,
    },
    source: {
      provider: 'Firebase Realtime Database',
      path: SOMPO_TELEMETRY_PATH,
    },
  };
}

function reading(value) {
  return value === null || value === undefined ? 'não informado' : String(value);
}

function freshnessLabel(value) {
  if (value === 'fresh') return 'fluxo confirmado por mudança recente no timestamp/dados';
  if (value === 'stale') return 'snapshot sem mudança recente; pode estar defasado';
  return 'snapshot recebido; fluxo do dispositivo ainda em validação';
}

export function buildSompoTelemetryMission(snapshot, teamLabel) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('sompo_telemetry_snapshot_required');
  }
  const { readings = {}, risks = {}, source = {} } = snapshot;
  const acceleration = readings.acceleration || {};
  const rotation = readings.rotation || {};

  return [
    `Telemetria SOMPO — trator ${snapshot.tractorId || '001'}`,
    `Equipe selecionada para avaliar: ${teamLabel || 'equipe de risco agro'}`,
    `Origem: ${source.provider || 'Firebase Realtime Database'} ${source.path || SOMPO_TELEMETRY_PATH}`,
    `Leitura recebida pelo LUCA em: ${snapshot.observedAt || 'não informado'}`,
    `Última mudança observada pelo runtime: ${snapshot.changedAt || 'não informado'}`,
    `Frescor do fluxo: ${freshnessLabel(snapshot.freshness)}`,
    `Timestamp bruto do dispositivo: ${reading(snapshot.deviceTimestamp)} (contador enviado pelo ESP32; não interpretar como data/hora).`,
    '',
    'Alertas determinísticos enviados pelo dispositivo:',
    `- riscoColisao=${Boolean(risks.collision)}`,
    `- riscoInclinacao=${Boolean(risks.inclination)}`,
    '',
    'Leituras do snapshot:',
    `- distancia=${reading(readings.distance)}`,
    `- temperatura=${reading(readings.temperature)}`,
    `- umidade=${reading(readings.humidity)}`,
    `- pitch=${reading(readings.pitch)} | roll=${reading(readings.roll)}`,
    `- aceleracao: x=${reading(acceleration.x)}, y=${reading(acceleration.y)}, z=${reading(acceleration.z)}, magnitude=${reading(acceleration.magnitude)}`,
    `- rotacao: x=${reading(rotation.x)}, y=${reading(rotation.y)}, z=${reading(rotation.z)}, magnitude=${reading(rotation.magnitude)}`,
    '',
    'Objetivo: avaliar a condição operacional e securitária do equipamento, priorizar risco imediato, explicar correlações defensáveis entre os sinais e recomendar próximas ações de campo para operador, manutenção e gestão de risco.',
    '',
    'Regras: trate as flags de colisão e inclinação como fatos do firmware. Separe fatos, hipóteses e lacunas. Não invente limiares, calibração, localização, apólice ou impacto financeiro. As unidades não vieram no JSON; valide-as contra o firmware antes de sustentar uma decisão técnica ou de sinistro.',
  ].join('\n');
}
