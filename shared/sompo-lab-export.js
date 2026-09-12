import { LAB_COLUMNS, LAB_ESP32_COLUMNS, LAB_UNITS, parseLabCase } from './lab-telemetry.js';

export const SOMPO_EXPORT_MAX_SAMPLES = 10_000;
export const SOMPO_EXPORT_MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const SOURCE_KINDS = new Set(['firebase', 'simulation']);
const SIGNALS = {
  temperatura: 'ambient_temp_c', umidade: 'relative_humidity_pct',
  pitch: 'imu_pitch_raw', roll: 'imu_roll_raw',
  accX: 'acceleration_x_raw', accY: 'acceleration_y_raw', accZ: 'acceleration_z_raw',
  rotX: 'rotation_x_raw', rotY: 'rotation_y_raw', rotZ: 'rotation_z_raw',
  deviceTimestamp: 'device_timestamp',
};
const FLAGS = { riscoColisao: 'collision_warning_active', riscoInclinacao: 'inclination_warning_active' };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.code = status === 413 ? 'sompo_export_too_large' : 'sompo_export_invalid_dataset';
  throw error;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  return object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}

function number(value, field, index) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`Amostra ${index + 1}: ${field} deve ser número ou null no histórico normalizado.`);
  return value;
}

function utc(value, index) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) {
    fail(`Amostra ${index + 1}: observedAt deve ser UTC ISO 8601; o contador do dispositivo não substitui a data/hora.`);
  }
  const ms = Date.parse(value);
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction = '') => `.${fraction.padEnd(3, '0')}Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== normalized) fail(`Amostra ${index + 1}: observedAt contém data/hora inválida.`);
  return { ms, normalized };
}

function cell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Converts the normalized SOMPO history/episode JSON, never arbitrary firmware payloads. */
export function convertSompoDataset(input) {
  if (!object(input) || !Array.isArray(input.samples)) fail('Envie um dataset JSON SOMPO com samples, exportado pelo histórico ou episódio do gêmeo digital.');
  if (input.schemaVersion != null && input.schemaVersion !== 'sompo-telemetry-v1') fail('Versão de dataset SOMPO desconhecida. Esperado sompo-telemetry-v1.');
  if (input.samples.length > SOMPO_EXPORT_MAX_SAMPLES) fail(`O dataset excede ${SOMPO_EXPORT_MAX_SAMPLES} amostras. Exporte uma janela menor.`, 413);
  if (input.samples.length < 2) fail('O Laboratório precisa de pelo menos duas amostras em instantes distintos. Amplie a janela de exportação.');
  if (input.count != null && input.count !== input.samples.length) fail('A contagem declarada não corresponde ao número de amostras do dataset.');
  const columns = [...LAB_COLUMNS, ...LAB_ESP32_COLUMNS];
  let sourceKind, tractorId;
  const seen = new Map();
  let timeoutCount = 0;
  const rows = [];
  input.samples.forEach((sample, index) => {
    if (!object(sample)) fail(`Amostra ${index + 1}: esperado objeto do histórico SOMPO.`);
    if (!SOURCE_KINDS.has(sample.sourceKind)) fail(`Amostra ${index + 1}: sourceKind deve ser firebase ou simulation.`);
    if (typeof sample.tractorId !== 'string' || !sample.tractorId.trim() || sample.tractorId !== sample.tractorId.trim()) fail(`Amostra ${index + 1}: tractorId deve ser um texto preenchido, sem espaços nas extremidades.`);
    sourceKind ??= sample.sourceKind;
    tractorId ??= sample.tractorId;
    if (sample.sourceKind !== sourceKind || sample.tractorId !== tractorId) fail('Separe máquinas e origens diferentes em datasets distintos.');
    const timestamp = utc(sample.observedAt, index);
    if (sample.observedMs != null && number(sample.observedMs, 'observedMs', index) !== timestamp.ms) fail(`Amostra ${index + 1}: observedMs contradiz observedAt.`);
    const signature = JSON.stringify(canonical(sample));
    if (seen.has(timestamp.ms)) {
      if (seen.get(timestamp.ms) !== signature) fail(`Amostra ${index + 1}: duas leituras diferentes têm o mesmo observedAt. Resolva o conflito de relógio antes de importar.`);
      return;
    }
    seen.set(timestamp.ms, signature);
    const row = Object.fromEntries(columns.map(name => [name, null]));
    Object.assign(row, { timestamp: timestamp.normalized, machine_id: tractorId, synthetic: sourceKind === 'simulation' });
    const x = number(sample.posX, 'posX', index);
    const z = number(sample.posZ, 'posZ', index);
    if (x !== null && z !== null) {
      if (sourceKind !== 'simulation') fail('Posição local sintética exige origem simulation.');
      // Opção (a): o CSV só aceita GNSS; x/z são derivados pelo parser, não importados.
      // Inversa da projeção local em [0, 0], com x leste e z sul, sem mudar o motor.
      row.latitude_deg = -z / 6378137 * (180 / Math.PI);
      row.longitude_deg = x / 6378137 * (180 / Math.PI);
      row.gnss_fix = '3d';
      const heading = number(sample.headingDeg, 'headingDeg', index);
      row.heading_deg = heading === null ? null : ((heading % 360) + 360) % 360;
    }
    for (const [field, column] of Object.entries(SIGNALS)) row[column] = number(sample[field], field, index);
    for (const [field, column] of Object.entries(FLAGS)) {
      const value = sample[field];
      if (value != null && typeof value !== 'boolean') fail(`Amostra ${index + 1}: ${field} deve ser true, false ou null.`);
      row[column] = value ?? null;
    }
    const distance = number(sample.distancia, 'distancia', index);
    if (distance === 999) timeoutCount += 1;
    row.obstacle_distance_cm = distance === 999 ? null : distance;
    // A normal distance alone does not prove a valid echo: history has no echo-quality bit.
    row.ultrasonic_echo_valid = distance === 999 ? false : null;
    rows.push({ ms: timestamp.ms, row });
  });
  if (rows.length < 2) fail('Após remover duplicatas exatas, faltam duas amostras em instantes distintos para o replay.');
  for (const metadata of [input, input.episode].filter(object)) {
    if (metadata.sourceKind != null && metadata.sourceKind !== sourceKind) fail('A origem declarada nos metadados contradiz as amostras.');
    if (metadata.tractorId != null && metadata.tractorId !== tractorId) fail('A máquina declarada nos metadados contradiz as amostras.');
    if (metadata.synthetic != null && metadata.synthetic !== (sourceKind === 'simulation')) fail('O indicador synthetic contradiz a origem das amostras.');
  }
  const timestampBasis = sourceKind === 'firebase' ? 'server_received' : 'simulator_observed';
  if (input.timestampBasis != null && input.timestampBasis !== timestampBasis) fail('A base temporal declarada é incompatível com a origem do histórico SOMPO.');
  rows.sort((a, b) => a.ms - b.ms);
  const hasPosition = rows.some(({ row }) => row.gnss_fix === '3d');
  const fileName = `sompo-${tractorId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}-${sourceKind}-${rows[0].row.timestamp.replace(/[:.]/g, '-')}.csv`;
  const warnings = [
    'Histórico normalizado pelo servidor SOMPO; não é o payload bruto do firmware.',
    timestampBasis === 'server_received' ? 'Tempo de recebimento no servidor; não confirma o instante de medição no ESP32.' : 'Tempo observado pelo simulador; não representa aquisição física.',
    'Distância em cm, temperatura ambiente em °C e umidade em % seguem a convenção SOMPO; confirme a calibração do dispositivo.',
    'IMU preservada na unidade de origem, sem converter eixos para orientação geográfica ou inferir trajetória.',
    hasPosition ? 'Posição GNSS sintética derivada de metros locais; ECU não registrada; sinais ausentes permanecem vazios.' : 'GNSS e ECU não registrados; sinais ausentes permanecem vazios.',
    'Flags são avisos registrados pelo dispositivo/simulador; não comprovam colisão ou causa de incidente.',
  ];
  if (timeoutCount) warnings.push(`${timeoutCount} leitura(s) de distância 999 tratadas como ausência de eco; o valor original permanece no JSON.`);
  const manifest = {
    version: '1.0', synthetic: sourceKind === 'simulation', profile: 'esp32',
    machine: { id: tractorId }, source_kind: sourceKind, timestamp_basis: timestampBasis,
    source_schema: 'sompo-telemetry-v1', duration_s: (rows.at(-1).ms - rows[0].ms) / 1000,
    files: [{ file: fileName, samples: rows.length }],
    original_sample_count: input.samples.length, removed_exact_duplicates: input.samples.length - rows.length,
    source_episode_id: typeof input.episode?.publicId === 'string' ? input.episode.publicId : null,
    conversion_warnings: warnings,
    ...(hasPosition ? { local_origin: [0, 0] } : {}),
  };
  const mappedFields = Object.fromEntries([...Object.entries(SIGNALS), ...Object.entries(FLAGS)].map(([field, column]) => [column, field]));
  const schema = {
    version: 1, delimiter: ',', decimal: '.', encoding: 'UTF-8', missing_value: 'empty CSV cell',
    fields: columns.map(name => ({
      name, unit: LAB_UNITS[name], origin: `Histórico SOMPO normalizado (${sourceKind})`,
      meaning: hasPosition && ['latitude_deg', 'longitude_deg', 'gnss_fix', 'heading_deg'].includes(name)
        ? ({ latitude_deg: 'Latitude sintética derivada de posZ, positivo para sul.', longitude_deg: 'Longitude sintética derivada de posX, positivo para leste.', gnss_fix: '3d somente com posX e posZ; ausente sem posição.', heading_deg: 'headingDeg do simulador: 0 = norte, 90 = leste.' }[name])
        : mappedFields[name] ? `Campo ${mappedFields[name]} preservado; ${name.endsWith('_raw') ? 'unidade e eixos de origem não calibrados' : name === 'ambient_temp_c' ? 'temperatura do ar, não arrefecimento do motor' : 'null permanece ausente'}.`
        : ({ timestamp: `observedAt em UTC (${timestampBasis})`, machine_id: 'Identificador tractorId', synthetic: 'true somente para origem simulation', obstacle_distance_cm: 'Distância frontal em cm pela convenção SOMPO; 999 é ausência de eco', ultrasonic_echo_valid: 'false para sentinela 999; null quando qualidade do eco não foi registrada' }[name] || 'Sinal não registrado neste histórico; célula vazia, sem valor inventado.'),
    })),
  };
  const csv = [columns.join(','), ...rows.map(({ row }) => columns.map(name => cell(row[name])).join(','))].join('\n') + '\n';
  if (new TextEncoder().encode(csv).length > MAX_CSV_BYTES) fail('O CSV convertido excede 5 MiB. Exporte uma janela menor para salvar o caso no Laboratório.', 413);
  try {
    parseLabCase(csv, { fileName, manifest, schema });
  } catch (error) {
    fail(error.message || 'O dataset não respeita o contrato do Laboratório.');
  }
  return { csv, fileName, manifest, schema };
}
