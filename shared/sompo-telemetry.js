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

const EPISODE_KIND_LABELS = Object.freeze({
  colisao: 'colisão',
});

const EPISODE_ASK_LINE = 'Avaliem o evento completo: severidade, causa provável, resposta recomendada e o que verificar no equipamento físico.';

function episodeKindLabel(kind) {
  return EPISODE_KIND_LABELS[kind] || String(kind || 'evento');
}

function formatOffsetSeconds(offsetMs) {
  const text = formatPtNumber(Number(offsetMs) / 1_000);
  return text === null ? 'não informado' : `t+${text}s`;
}

function episodeDurationSeconds(episode, summary) {
  const duration = Number.isFinite(Number(episode?.durationMs))
    ? Number(episode.durationMs)
    : Number(summary?.spanMs);
  return Number.isFinite(duration) ? formatPtNumber(duration / 1_000) : null;
}

function episodeImpactLine(summary) {
  const impact = summary?.impact;
  if (!impact || !Number.isFinite(Number(impact.offsetMs))) {
    return 'Sem pico de aceleração identificado nas amostras';
  }
  const peak = formatPtNumber(impact.accMagnitude);
  return `Impacto em ${formatOffsetSeconds(impact.offsetMs)} com pico de ${peak === null ? 'não informado' : `${peak} m/s²`}`;
}

function episodeDistanceLine(summary) {
  const first = formatPtNumber(summary?.first?.distancia);
  const last = formatPtNumber(summary?.last?.distancia);
  if (first === null || last === null) return 'distância não informada';
  const firstNumber = Number(summary.first.distancia);
  const lastNumber = Number(summary.last.distancia);
  if (lastNumber < firstNumber) return `distância caiu de ${first} cm para ${last} cm`;
  if (lastNumber > firstNumber) return `distância subiu de ${first} cm para ${last} cm`;
  return `distância estável em ${first} cm`;
}

function episodeFlagLine(summary) {
  const transitions = Array.isArray(summary?.flagTransitions) ? summary.flagTransitions : [];
  const turnedOn = transitions.some((item) => item.flag === 'riscoColisao' && item.to === true);
  if (summary?.last?.riscoColisao && turnedOn) return 'risco de colisão ativo desde o impacto';
  if (summary?.last?.riscoColisao) return 'risco de colisão ativo no episódio inteiro';
  return 'sem flag de colisão ativa no fim do episódio';
}

function buildEpisodeHumanSummary(episode, summary, frames = []) {
  const kindLabel = episodeKindLabel(episode.kind);
  const duration = episodeDurationSeconds(episode, summary);
  const count = Number(summary?.count) || 0;
  const statusSuffix = episode.status === 'complete' ? '' : ` (status ${episode.status}: gravação incompleta)`;
  const attachedFrames = (Array.isArray(frames) ? frames : []).filter((frame) => frame.attached !== false).length;
  const framesSuffix = attachedFrames > 0
    ? ` ${attachedFrames} frame${attachedFrames === 1 ? '' : 's'} do simulador anexado${attachedFrames === 1 ? '' : 's'} como evidência visual.`
    : '';
  const headline = `[Ensaio no simulador] Episódio de ${kindLabel} registrado — ${duration === null ? 'duração não informada' : `${duration}s`}, ${count} amostra${count === 1 ? '' : 's'}.${statusSuffix}${framesSuffix}`;
  const eventLine = `${episodeImpactLine(summary)}; ${episodeDistanceLine(summary)}; ${episodeFlagLine(summary)}.`;
  return [headline, eventLine, EPISODE_ASK_LINE].join('\n');
}

function episodePhaseLines(summary) {
  const phases = Array.isArray(summary?.phases) ? summary.phases : [];
  if (phases.length === 0) return ['Fases: não identificadas (sem série de aceleração utilizável).'];
  const lines = ['Fases detectadas (heurística determinística; impacto = amostra de pico de |aceleração|):'];
  for (const phase of phases) {
    lines.push(
      `- ${phase.label}: ${formatOffsetSeconds(phase.startOffsetMs)} → ${formatOffsetSeconds(phase.endOffsetMs)} · ${phase.sampleCount} amostra${phase.sampleCount === 1 ? '' : 's'} · ${formatStat('dist', phase.stats?.distancia)} | ${formatStat('acc', phase.stats?.accMagnitude)} | ${formatStat('pitch', phase.stats?.pitch)} | ${formatStat('roll', phase.stats?.roll)} · riscoColisao=${Boolean(phase.riscoColisao)}`,
    );
  }
  const impact = summary?.impact;
  if (impact) {
    lines.push(`Pico de impacto: ${formatOffsetSeconds(impact.offsetMs)} · |aceleração| ${reading(impact.accMagnitude)} m/s²`);
  }
  return lines;
}

const EPISODE_NO_FRAMES_LINE = 'Sem evidência visual: nenhum frame do simulador foi registrado neste episódio; a análise segue apenas com os dados de telemetria.';

/**
 * Seção "Evidência visual": lista numerada dos frames ANEXADOS (a numeração dos
 * "Anexo N" segue a ordem dos anexos da missão) + frames registrados mas fora do
 * orçamento de anexos, declarados explicitamente — nunca descartados em silêncio.
 */
function episodeVisualEvidenceLines(frames) {
  const list = Array.isArray(frames) ? frames : [];
  if (list.length === 0) return [EPISODE_NO_FRAMES_LINE];
  const attached = list.filter((frame) => frame.attached !== false);
  const skipped = list.filter((frame) => frame.attached === false);
  const describe = (frame) => {
    const label = String(frame.label || 'Frame do simulador').trim() || 'Frame do simulador';
    const fase = frame.fase ? `fase ${frame.fase}` : 'fase não informada';
    const offset = Number.isFinite(Number(frame.offsetMs)) ? formatOffsetSeconds(frame.offsetMs) : 'instante não informado';
    return `${label} (${fase}, ${offset})`;
  };
  const lines = ['Evidência visual (frames do canvas Three.js capturados durante o roteiro e anexados a esta missão como imagens):'];
  attached.forEach((frame, index) => {
    lines.push(`- Anexo ${index + 1} — ${describe(frame)}`);
  });
  if (attached.length === 0) {
    lines.push('- Nenhum frame pôde ser anexado nesta missão; os registros abaixo existem apenas no episódio.');
  }
  for (const frame of skipped) {
    lines.push(`- Registrado no episódio mas NÃO anexado (orçamento de anexos da bancada): ${describe(frame)}`);
  }
  lines.push('Instrução: cruzem cada imagem com a telemetria do mesmo instante e digam explicitamente se batem ou divergem (ex.: "a distância registrada no dado confere com a posição do caminhão no Anexo 3?"). Citem os frames pelo número do anexo ao usar um exemplo visual na resposta. Concluam com a severidade do evento para a seguradora e a ação de prevenção no momento exato em que ela deveria ocorrer.');
  return lines;
}

/** Marcador do bloco de máquina com a série do episódio para a peça visual. */
export const SOMPO_EPISODE_VISUAL_DATA_MARKER = '[SERIE-DO-EPISODIO-PARA-A-PECA-VISUAL]';

function sampleAccMagnitude(sample) {
  const values = [sample?.accX, sample?.accY, sample?.accZ].map(Number);
  if (!values.every((value) => Number.isFinite(value))) return null;
  return Math.round(Math.sqrt((values[0] ** 2) + (values[1] ** 2) + (values[2] ** 2)) * 100) / 100;
}

/** Offset (ms) do primeiro disparo false→true de riscoColisao, ou null. */
function episodeFlagOffsetMs(summary) {
  const originMs = Number(summary?.first?.observedMs);
  if (!Number.isFinite(originMs)) return null;
  const transitions = Array.isArray(summary?.flagTransitions) ? summary.flagTransitions : [];
  const firstOn = transitions.find((item) => item.flag === 'riscoColisao' && item.to === true);
  if (!firstOn) return null;
  const offset = Date.parse(firstOn.at) - originMs;
  return Number.isFinite(offset) ? offset : null;
}

function formatSecondsOneDecimal(ms) {
  return String(Math.round(Number(ms) / 100) / 10).replace('.', ',');
}

/**
 * O achado que vira manchete: o alerta avisou a tempo? Comparação direta entre
 * o pico de impacto e o instante em que a flag riscoColisao disparou.
 */
function episodeAlertFindingLine(summary) {
  const impact = summary?.impact;
  if (!impact || !Number.isFinite(Number(impact.offsetMs))) return null;
  if (summary?.first?.riscoColisao) {
    return 'Achado do alerta: a flag riscoColisao já estava ativa desde o início da gravação — não há instante de disparo para comparar com o impacto.';
  }
  const flagMs = episodeFlagOffsetMs(summary);
  if (flagMs === null) {
    return `Achado do alerta: a flag riscoColisao NUNCA disparou neste episódio, mesmo com o pico de impacto em ${formatOffsetSeconds(impact.offsetMs)}.`;
  }
  const deltaMs = flagMs - Number(impact.offsetMs);
  if (deltaMs > 100) {
    return `Achado do alerta: a flag riscoColisao disparou ${formatSecondsOneDecimal(deltaMs)} s DEPOIS do pico de impacto (impacto em ${formatOffsetSeconds(impact.offsetMs)}, alerta em ${formatOffsetSeconds(flagMs)}) — o equipamento avisou tarde.`;
  }
  if (deltaMs < -100) {
    return `Achado do alerta: a flag riscoColisao disparou ${formatSecondsOneDecimal(-deltaMs)} s ANTES do pico de impacto (alerta em ${formatOffsetSeconds(flagMs)}, impacto em ${formatOffsetSeconds(impact.offsetMs)}) — o equipamento avisou a tempo.`;
  }
  return `Achado do alerta: a flag riscoColisao disparou no mesmo instante do pico de impacto (${formatOffsetSeconds(impact.offsetMs)}).`;
}

/**
 * Série compacta para a peça visual: usa as amostras-chave já decimadas
 * (≤30, densas ao redor do pico). Cada ponto é [tMs, distanciaCm, accMs2].
 */
export function buildSompoEpisodeVisualData(summary) {
  const keySamples = Array.isArray(summary?.keySamples) ? summary.keySamples : [];
  if (keySamples.length < 2) return null;
  const originMs = Number(keySamples[0].observedMs);
  if (!Number.isFinite(originMs)) return null;
  const serie = keySamples.map((sample) => [
    Math.max(0, Math.round(Number(sample.observedMs) - originMs)),
    Number.isFinite(Number(sample.distancia)) ? Math.round(Number(sample.distancia) * 10) / 10 : null,
    sampleAccMagnitude(sample),
  ]);
  const impact = summary?.impact;
  const flagMs = episodeFlagOffsetMs(summary);
  return {
    tipo: 'sompo-episodio-colisao',
    duracaoMs: Math.max(0, Math.round(Number(summary?.spanMs) || 0)),
    impactoMs: impact && Number.isFinite(Number(impact.offsetMs)) ? Math.round(Number(impact.offsetMs)) : null,
    picoAccMs2: impact && Number.isFinite(Number(impact.accMagnitude)) ? Number(impact.accMagnitude) : null,
    flagMs: flagMs === null ? null : Math.round(flagMs),
    flagDesdeInicio: Boolean(summary?.first?.riscoColisao),
    serie,
  };
}

/** Recupera o bloco de máquina embutido na missão; null se não for missão de episódio. */
export function parseSompoEpisodeVisualData(missionText) {
  const text = String(missionText || '');
  const at = text.indexOf(SOMPO_EPISODE_VISUAL_DATA_MARKER);
  if (at < 0) return null;
  const jsonLine = text
    .slice(at + SOMPO_EPISODE_VISUAL_DATA_MARKER.length)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{'));
  if (!jsonLine) return null;
  try {
    const parsed = JSON.parse(jsonLine);
    if (parsed?.tipo !== 'sompo-episodio-colisao') return null;
    if (!Array.isArray(parsed.serie) || parsed.serie.length < 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Contrato da peça visual do episódio: UMA linha do tempo (desenhada pelo
 * runtime com os dados reais), manchete = achado, sem barras de média por fase
 * e sem repetir números entre peças. É a instrução que a frente 6 corrige.
 */
function episodeVisualContractLines(visualData) {
  if (!visualData) return [];
  return [
    '',
    'Contrato da peça visual (etapa de artefatos da bancada):',
    '- Peça principal ÚNICA: a linha do tempo do episódio — série temporal desenhada pelo runtime com os dados reais do bloco de máquina no fim desta missão (distância frontal em cm e aceleração em g ao longo dos segundos), com marcadores nomeados no início da aproximação, no IMPACTO e no instante em que a flag de risco disparou.',
    '- PROIBIDO: gráfico de barras com média por fase; repetir a mesma série ou os mesmos números em mais de uma peça; jargão sem tradução — escreva em português comum, nada de "Δv", "piso/saturação do sensor" ou "pulso único de contato".',
    '- A manchete da peça é o ACHADO acionável (ex.: "O alerta chegou 2,3 s depois da batida"), nunca uma descrição como "Leitura operacional do ensaio".',
    '- Segunda peça (opcional, no máximo UMA): cartão de decisão curto — veredito, severidade para a seguradora e o que fazer agora, em frases, SEM repetir números que já estão na linha do tempo.',
    '- Unidades humanas: impacto em g (m/s² no máximo uma vez, entre parênteses), distância em cm, tempo em segundos com uma casa decimal.',
    '- Se faltar dado para a severidade física (ex.: velocidade real), diga que está pendente em UMA linha.',
    '',
    `${SOMPO_EPISODE_VISUAL_DATA_MARKER} (bloco de máquina para a etapa visual; não recitar no chat)`,
    JSON.stringify(visualData),
  ];
}

export function buildSompoEpisodeMission(episode, samples, summary, teamLabel, frames = []) {
  if (!episode || typeof episode !== 'object') {
    throw new Error('sompo_telemetry_episode_required');
  }
  if (!Array.isArray(samples)) {
    throw new Error('sompo_telemetry_samples_required');
  }
  if (!summary || typeof summary !== 'object') {
    throw new Error('sompo_telemetry_summary_required');
  }

  const kindLabel = episodeKindLabel(episode.kind);
  const duration = episodeDurationSeconds(episode, summary);
  const stats = summary.stats || {};
  const transitions = Array.isArray(summary.flagTransitions) ? summary.flagTransitions : [];
  const keySamples = Array.isArray(summary.keySamples) ? summary.keySamples : [];
  const alertFinding = episodeAlertFindingLine(summary);
  const visualData = buildSompoEpisodeVisualData(summary);

  const briefing = [
    `[SIMULAÇÃO] Episódio SOMPO — ${kindLabel} — caminhão ${episode.tractorId || 'SIM-001'}`,
    `Equipe selecionada para avaliar: ${teamLabel || 'equipe de risco agro'}`,
    `Identificador do episódio: ${episode.publicId}`,
    `Status: ${episode.status}`,
    'Origem: Simulador 3D local (roteiro determinístico; dados sintéticos; não enviados ao Firebase)',
    ...(episode.scenarioLabel ? [`Cenário: ${episode.scenarioLabel}`] : []),
    `Início: ${episode.startedAt || 'não informado'} | Fim: ${episode.endedAt || 'não informado'} | Duração: ${duration === null ? 'não informada' : `${duration}s`}`,
    `Amostras gravadas: ${Number(summary.count) || 0} (episódio completo, ordem cronológica)`,
    '',
    ...episodePhaseLines(summary),
    '',
    `Agregados do episódio: ${formatStat('dist', stats.distancia)} | ${formatStat('temp', stats.temperatura)} | ${formatStat('umid', stats.umidade)} | ${formatStat('pitch', stats.pitch)} | ${formatStat('roll', stats.roll)} | ${formatStat('acc', stats.accMagnitude)} | ${formatStat('rot', stats.rotMagnitude)}`,
    ...(transitions.length === 0
      ? ['Transições de flag: nenhuma no episódio.']
      : [
        'Transições de flag:',
        ...transitions.map((item) => `- ${item.at} ${item.flag} ${Boolean(item.from)} → ${Boolean(item.to)}`),
      ]),
    ...(alertFinding ? [alertFinding] : []),
    ...(keySamples.length === 0
      ? []
      : [
        'Amostras-chave (decimação adaptativa — mais densas ao redor do pico; primeira, última e transições sempre presentes):',
        ...(() => {
          const originMs = Number(keySamples[0].observedMs ?? Date.parse(keySamples[0].observedAt));
          return keySamples.map((sample) => compactKeySample(sample, originMs));
        })(),
      ]),
    '',
    ...episodeVisualEvidenceLines(frames),
    '',
    'Objetivo: avaliar o EVENTO em sua totalidade — dinâmica, sequência causal e severidade do episódio inteiro, não leituras isoladas — e recomendar a resposta operacional adequada.',
    '',
    'Regras: este é um ensaio sintético do roteiro de colisão no simulador. Analisem o evento completo (aproximação, impacto e pós-impacto) como sequência causal; não tratem amostras isoladas nem flags como evidência do equipamento físico, do firmware ou de sinistro real. Separem fatos do cenário, inferências e lacunas; validem qualquer conclusão em telemetria real antes de uma decisão operacional.',
    ...episodeVisualContractLines(visualData),
  ].join('\n');

  return `${buildEpisodeHumanSummary(episode, summary, frames)}\n\n${SOMPO_MISSION_DOSSIER_DELIMITER}\n${briefing}`;
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
