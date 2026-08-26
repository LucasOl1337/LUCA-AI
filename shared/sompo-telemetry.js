export const SOMPO_TELEMETRY_PATH = '/trator/001/sensores';
export const SOMPO_MISSION_DOSSIER_DELIMITER = '--- DOSSIÊ TÉCNICO ---';

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
    connection: {
      state: 'connecting',
      connectedAt: null,
      lastEventAt: null,
      retryAttempt: 0,
    },
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
      kind: 'firebase',
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

function connectionLabel(value) {
  if (value === 'live') return 'conectado em tempo real';
  if (value === 'reconnecting') return 'reconectando; snapshot preservado';
  if (value === 'stopped') return 'interrompido; snapshot preservado';
  return 'conectando';
}

function magnitudeOf(x, y, z) {
  if (![x, y, z].every((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))) {
    return null;
  }
  return Math.sqrt((Number(x) ** 2) + (Number(y) ** 2) + (Number(z) ** 2));
}

function formatStat(name, stat) {
  if (!stat || stat.min === null || stat.min === undefined) return `${name}=não informado`;
  return `${name} min=${reading(stat.min)} max=${reading(stat.max)} avg=${reading(stat.avg)}`;
}

function compactKeySample(sample, originMs) {
  const offsetSec = Math.max(0, Math.round((Number(sample.observedMs) - originMs) / 1000));
  const acc = magnitudeOf(sample.accX, sample.accY, sample.accZ);
  const accText = acc === null ? 'não informado' : String(Math.round(acc * 100) / 100);
  return `t+${offsetSec}s dist=${reading(sample.distancia)} pitch=${reading(sample.pitch)} acc=${accText}`;
}

const EMPTY_TIMELINE = 'Linha do tempo: sem histórico persistido nesta janela — análise baseada em frame único.';
const ASK_LINE = 'Avaliem a condição operacional, priorizem risco e recomendem próximas ações de campo.';

function formatPtNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const rounded = Math.round(number * 100) / 100;
  const sign = rounded < 0 ? '-' : '';
  const [integer, fraction] = String(Math.abs(rounded)).split('.');
  return fraction ? `${sign}${integer},${fraction}` : `${sign}${integer}`;
}

function humanRiskLine(risks = {}) {
  const collision = Boolean(risks.collision);
  const inclination = Boolean(risks.inclination);
  if (collision && inclination) return 'ALERTA: risco de colisão e inclinação detectados';
  if (collision) return 'ALERTA: risco de colisão detectado';
  if (inclination) return 'ALERTA: risco de inclinação detectado';
  return 'Sem flags de risco ativas';
}

function humanWhatLine(snapshot, simulation) {
  const tractorId = snapshot.tractorId || '001';
  if (simulation) {
    const scenario = snapshot.source?.scenarioLabel ? `, cenário ${snapshot.source.scenarioLabel}` : '';
    return `[Ensaio no simulador] Análise de telemetria do trator ${tractorId} — simulador 3D${scenario}`;
  }
  return `Análise de telemetria do trator ${tractorId} — equipamento físico via Firebase`;
}

function humanReadingsLine(readings = {}) {
  const distance = formatPtNumber(readings.distance);
  const pitch = formatPtNumber(readings.pitch);
  const roll = formatPtNumber(readings.roll);
  const temperature = formatPtNumber(readings.temperature);
  const distanceText = distance === null ? 'não informada' : `${distance} cm`;
  let inclinationText = 'não informada';
  if (pitch !== null && roll !== null) inclinationText = `${pitch}°/${roll}°`;
  else if (pitch !== null) inclinationText = `${pitch}°`;
  else if (roll !== null) inclinationText = `${roll}°`;
  const parts = [`Distância frontal ${distanceText}`, `inclinação ${inclinationText}`];
  if (temperature !== null) parts.push(`temperatura ${temperature} °C`);
  return parts.join(', ');
}

function humanHistoryLine(history) {
  if (!history || typeof history !== 'object') return 'Sem histórico nesta janela';
  const samples = Array.isArray(history.samples) ? history.samples : [];
  const summary = history.summary && typeof history.summary === 'object' ? history.summary : null;
  const count = Number(summary?.count);
  if (samples.length === 0 && (!Number.isFinite(count) || count <= 0)) return 'Sem histórico nesta janela';

  const sampleCount = Number.isFinite(count) && count > 0 ? count : samples.length;
  const spanMs = Number(summary?.spanMs) || 0;
  const windowMin = Number.isFinite(Number(history.windowMin))
    ? Number(history.windowMin)
    : Math.max(1, Math.round(spanMs / 60_000) || 1);
  const bits = [`Janela de ${windowMin} min com ${sampleCount} amostra${sampleCount === 1 ? '' : 's'}`];

  const firstDistance = summary?.first?.distancia ?? samples[0]?.distancia;
  const lastDistance = summary?.last?.distancia ?? samples.at(-1)?.distancia;
  const firstText = formatPtNumber(firstDistance);
  const lastText = formatPtNumber(lastDistance);
  if (firstText !== null && lastText !== null) {
    const first = Number(firstDistance);
    const last = Number(lastDistance);
    if (last < first) bits.push(`distância caiu de ${firstText} pra ${lastText}`);
    else if (last > first) bits.push(`distância subiu de ${firstText} pra ${lastText}`);
    else bits.push(`distância estável em ${firstText}`);
  }

  const transitions = Array.isArray(summary?.flagTransitions) ? summary.flagTransitions : [];
  if (transitions.length === 1) bits.push('1 transição de flag');
  else if (transitions.length > 1) bits.push(`${transitions.length} transições de flag`);
  else bits.push('nenhuma transição de flag');

  return bits.join('; ');
}

function buildHumanMissionSummary(snapshot, history) {
  const simulation = snapshot.source?.kind === 'simulation';
  return [
    humanWhatLine(snapshot, simulation),
    humanRiskLine(snapshot.risks),
    humanReadingsLine(snapshot.readings),
    humanHistoryLine(history),
    ASK_LINE,
  ].join('\n');
}

function buildTimelineLines(history) {
  if (!history || typeof history !== 'object') return [EMPTY_TIMELINE];
  const samples = Array.isArray(history.samples) ? history.samples : [];
  const summary = history.summary && typeof history.summary === 'object' ? history.summary : null;
  const count = Number(summary?.count);
  if (samples.length === 0 && (!Number.isFinite(count) || count <= 0)) return [EMPTY_TIMELINE];

  const sampleCount = Number.isFinite(count) && count > 0 ? count : samples.length;
  const spanMs = Number(summary?.spanMs) || 0;
  const windowMin = Number.isFinite(Number(history.windowMin))
    ? Number(history.windowMin)
    : Math.max(1, Math.round(spanMs / 60_000) || 1);
  const stats = summary?.stats || {};
  const lines = [
    `Linha do tempo (janela de ${windowMin} min, ${sampleCount} amostras)`,
    `Agregados: ${formatStat('dist', stats.distancia)} | ${formatStat('temp', stats.temperatura)} | ${formatStat('umid', stats.umidade)} | ${formatStat('pitch', stats.pitch)} | ${formatStat('roll', stats.roll)} | ${formatStat('acc', stats.accMagnitude)} | ${formatStat('rot', stats.rotMagnitude)}`,
  ];
  const transitions = Array.isArray(summary?.flagTransitions) ? summary.flagTransitions : [];
  if (transitions.length === 0) {
    lines.push('Transições de flag: nenhuma nesta janela.');
  } else {
    lines.push('Transições de flag:');
    for (const item of transitions) {
      lines.push(`- ${item.at} ${item.flag} ${Boolean(item.from)} → ${Boolean(item.to)}`);
    }
  }
  const keySamples = Array.isArray(summary?.keySamples) ? summary.keySamples : [];
  if (keySamples.length > 0) {
    const originMs = Number(keySamples[0].observedMs ?? Date.parse(keySamples[0].observedAt));
    lines.push('Amostras-chave:');
    for (const sample of keySamples) {
      lines.push(compactKeySample(sample, originMs));
    }
  }
  return lines;
}

export function buildSompoTelemetryMission(snapshot, teamLabel, history) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('sompo_telemetry_snapshot_required');
  }
  const { readings = {}, risks = {}, source = {} } = snapshot;
  const acceleration = readings.acceleration || {};
  const rotation = readings.rotation || {};
  const simulation = source.kind === 'simulation';
  const originLine = simulation
    ? `Origem: ${source.provider || 'Simulador 3D local'} ${source.path || 'simulation://sompo'} (dados sintéticos; não enviados ao Firebase)`
    : `Origem: ${source.provider || 'Firebase Realtime Database'} ${source.path || SOMPO_TELEMETRY_PATH}`;
  const timestampLine = simulation
    ? `Relógio da simulação: ${reading(snapshot.deviceTimestamp)} ms.`
    : `Timestamp bruto do dispositivo: ${reading(snapshot.deviceTimestamp)} (contador enviado pelo ESP32; não interpretar como data/hora).`;
  const alertHeading = simulation
    ? 'Flags sintéticas selecionadas no cenário (não são limiares do firmware):'
    : 'Alertas determinísticos enviados pelo dispositivo:';
  const connectionLine = simulation
    ? 'Estado do gerador local: ativo no navegador'
    : `Canal do runtime: ${connectionLabel(snapshot.connection?.state)}`;
  const lastEventLine = simulation
    ? `Última amostra sintética: ${snapshot.connection?.lastEventAt || snapshot.observedAt || 'não informado'}`
    : `Último evento recebido pelo canal: ${snapshot.connection?.lastEventAt || 'não informado'}`;
  const freshnessLine = simulation
    ? 'Atualização do cenário: amostra sintética atual'
    : `Frescor do fluxo: ${freshnessLabel(snapshot.freshness)}`;
  const observedLine = simulation
    ? `Amostra disponível no LUCA em: ${snapshot.observedAt || 'não informado'}`
    : `Leitura recebida pelo LUCA em: ${snapshot.observedAt || 'não informado'}`;
  const changedLine = simulation
    ? `Última atualização sintética: ${snapshot.changedAt || 'não informado'}`
    : `Última mudança observada pelo runtime: ${snapshot.changedAt || 'não informado'}`;
  const objective = simulation
    ? 'Objetivo: exercitar a triagem operacional e securitária em um cenário virtual, avaliar a coerência das respostas e recomendar quais verificações devem ser repetidas no equipamento físico antes de qualquer decisão real.'
    : 'Objetivo: avaliar a condição operacional e securitária do equipamento, priorizar risco imediato, explicar correlações defensáveis entre os sinais e recomendar próximas ações de campo para operador, manutenção e gestão de risco.';
  const rules = simulation
    ? 'Regras: este é um ensaio sintético local. Trate leituras e flags como hipóteses de teste, nunca como evidência do equipamento físico, do firmware ou de um sinistro real. Separe fatos do cenário, inferências e lacunas; valide qualquer conclusão em telemetria real antes de uma decisão operacional.'
    : 'Regras: trate as flags de colisão e inclinação como fatos do firmware. Separe fatos, hipóteses e lacunas. Não invente limiares, calibração, localização, apólice ou impacto financeiro. As unidades não vieram no JSON; valide-as contra o firmware antes de sustentar uma decisão técnica ou de sinistro.';

  const briefing = [
    `${simulation ? '[SIMULAÇÃO] ' : ''}Telemetria SOMPO — trator ${snapshot.tractorId || '001'}`,
    `Equipe selecionada para avaliar: ${teamLabel || 'equipe de risco agro'}`,
    originLine,
    ...(simulation && source.scenarioLabel ? [`Cenário virtual: ${source.scenarioLabel}`] : []),
    observedLine,
    changedLine,
    connectionLine,
    lastEventLine,
    freshnessLine,
    timestampLine,
    '',
    alertHeading,
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
    ...buildTimelineLines(history),
    '',
    objective,
    '',
    rules,
  ].join('\n');

  return `${buildHumanMissionSummary(snapshot, history)}\n\n${SOMPO_MISSION_DOSSIER_DELIMITER}\n${briefing}`;
}
