// File-backed laboratory telemetry. No Firebase, wall clock, or expected-event fixture.
const EARTH_RADIUS_M = 6378137;
const RAD = Math.PI / 180;
const FIELDS = [
  ['timestamp', 'UTC ISO8601'], ['machine_id', 'texto'], ['synthetic', 'boolean'],
  ['latitude_deg', 'graus'], ['longitude_deg', 'graus'], ['gnss_fix', 'texto'],
  ['gnss_horizontal_accuracy_m', 'm'], ['ground_speed_kmh', 'km/h'],
  ['heading_deg', 'graus'], ['roll_deg', 'graus'], ['pitch_deg', 'graus'],
  ['yaw_rate_deg_s', 'graus/s'], ['engine_rpm', 'rpm'], ['engine_load_pct', '%'],
  ['coolant_temp_c', '°C'], ['oil_pressure_kpa', 'kPa'], ['fuel_rate_l_h', 'L/h'],
  ['battery_voltage_v', 'V'], ['ambient_temp_c', '°C'], ['relative_humidity_pct', '%'],
  ['brake_pressed', 'boolean'], ['pto_engaged', 'boolean'], ['coolant_warning_active', 'boolean'],
];
const ESP32_FIELDS = [
  ['obstacle_distance_cm', 'cm'], ['ultrasonic_echo_valid', 'boolean'],
  ['imu_pitch_raw', 'unidade de origem'], ['imu_roll_raw', 'unidade de origem'],
  ['acceleration_x_raw', 'unidade de origem'], ['acceleration_y_raw', 'unidade de origem'], ['acceleration_z_raw', 'unidade de origem'],
  ['rotation_x_raw', 'unidade de origem'], ['rotation_y_raw', 'unidade de origem'], ['rotation_z_raw', 'unidade de origem'],
  ['collision_warning_active', 'boolean'], ['inclination_warning_active', 'boolean'],
  ['device_timestamp', 'contador do dispositivo'],
];
export const LAB_COLUMNS = FIELDS.map(([name]) => name);
export const LAB_ESP32_COLUMNS = ESP32_FIELDS.map(([name]) => name);
export const LAB_UNITS = Object.fromEntries([...FIELDS, ...ESP32_FIELDS]);
const BOOLEAN_FIELDS = new Set(Object.keys(LAB_UNITS).filter(name => LAB_UNITS[name] === 'boolean'));
const NONNEGATIVE_FIELDS = new Set(['gnss_horizontal_accuracy_m', 'ground_speed_kmh', 'engine_rpm', 'oil_pressure_kpa', 'fuel_rate_l_h', 'battery_voltage_v', 'obstacle_distance_cm', 'device_timestamp']);
const DEVICE_WARNING_FIELDS = { device_collision_warning: 'collision_warning_active', device_inclination_warning: 'inclination_warning_active' };
const TITLES = {
  outside_fence: ['Fora da área permitida', 'Retorno à área permitida'],
  near_water: ['Aproximação da água', 'Afastamento da água'],
  coolant_warning: ['Temperatura acima do limite didático', 'Temperatura abaixo do limite didático'],
  gnss_unavailable: ['Posição GPS indisponível', 'Posição GPS recuperada'],
  device_collision_warning: ['Alerta de colisão do dispositivo', 'Alerta de colisão do dispositivo desativado'],
  device_inclination_warning: ['Alerta de inclinação do dispositivo', 'Alerta de inclinação do dispositivo desativado'],
};

function fail(message) { throw new Error(message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function coordinate(value) {
  return Array.isArray(value) && value.length >= 2 && finite(value[0]) && finite(value[1])
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) < 90;
}

export function toLocalCoordinate(longitude, latitude, origin) {
  return {
    x: (longitude - origin[0]) * RAD * EARTH_RADIUS_M * Math.cos(origin[1] * RAD),
    z: -(latitude - origin[1]) * RAD * EARTH_RADIUS_M,
  };
}

function readCsv(text) {
  if (typeof text !== 'string' || !text.trim()) fail('O CSV está vazio. Escolha um arquivo com cabeçalho e amostras.');
  if (text.length > 25 * 1024 * 1024) fail('O CSV excede 25 MB. Divida o período em arquivos menores.');
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"') {
      if (cell || closed) fail(`CSV inválido na linha ${rows.length + 1}: aspas em posição incorreta.`);
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (c !== ',') {
        if (row.some(value => value.trim() !== '')) rows.push(row);
        row = [];
        if (c === '\r' && source[i + 1] === '\n') i++;
      }
    } else {
      if (closed) fail(`CSV inválido na linha ${rows.length + 1}: conteúdo após aspas.`);
      cell += c;
    }
    if (rows.length > 100001) fail('O CSV excede 100.000 amostras. Divida o período em arquivos menores.');
  }
  if (quoted) fail('CSV inválido: um campo entre aspas não foi fechado.');
  row.push(cell);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
}

function validateSchema(schema, columns) {
  if (schema == null) return;
  if (!object(schema) || schema.version !== 1 || schema.delimiter !== ',' || schema.decimal !== '.'
    || schema.encoding !== 'UTF-8' || schema.missing_value !== 'empty CSV cell' || !Array.isArray(schema.fields)) {
    fail('Schema incompatível: use versão 1, CSV UTF-8, vírgula, decimal ponto e célula vazia para valor ausente.');
  }
  const names = schema.fields.map(field => field?.name);
  if (new Set(names).size !== names.length || names.some(name => !Object.hasOwn(LAB_UNITS, name))) {
    fail('Schema incompatível: use apenas colunas reconhecidas, sem duplicatas.');
  }
  for (const name of columns) if (!names.includes(name)) fail(`Schema incompatível: falta a descrição de ${name}.`);
  for (const field of schema.fields) {
    const unit = LAB_UNITS[field.name];
    if (field.unit !== unit) fail(`Unidade incompatível para ${field.name}: esperado ${unit}. Os valores não foram convertidos.`);
    if (![field.origin, field.meaning].every(value => typeof value === 'string' && value.trim())) fail(`Schema sem origem ou semântica para ${field.name}.`);
  }
}

function validateManifest(manifest) {
  if (manifest == null) return;
  if (!object(manifest)) fail('Metadados inválidos: manifest.json deve conter um objeto JSON.');
  if (manifest.version != null && !['1', '1.0'].includes(String(manifest.version))) fail('Versão do manifesto incompatível com o laboratório (esperado 1.0).');
  if (manifest.local_origin != null && !coordinate(manifest.local_origin)) fail('Origem inválida: informe [longitude, latitude] WGS84.');
  if (manifest.coordinate_reference != null && manifest.coordinate_reference !== 'WGS84 / GeoJSON longitude,latitude') fail('Referencial incompatível: esperado WGS84 / GeoJSON longitude,latitude.');
  if (manifest.synthetic != null && typeof manifest.synthetic !== 'boolean') fail('Metadado synthetic deve ser true ou false.');
  if (manifest.site != null && (!object(manifest.site) || !['id', 'name'].every(key => typeof manifest.site[key] === 'string' && manifest.site[key].trim()))) fail('Área inválida: site deve informar id e name.');
  if (manifest.terrain != null) {
    const terrain = manifest.terrain;
    if (!object(terrain) || !/^[a-f0-9]{64}$/.test(terrain.sha256 || '') || typeof terrain.vertical_datum !== 'string' || !terrain.vertical_datum.trim()) fail('Relevo: informe SHA-256 e datum vertical.');
    if (!finite(terrain.resolution_m) || terrain.resolution_m <= 0) fail('Relevo: informe resolução positiva em metros.');
    validateManifest({ satellite: { ...terrain, crs: 'EPSG:4326' } });
    if (JSON.stringify(terrain.bbox) !== JSON.stringify(manifest.satellite?.bbox)) fail('Relevo: forneça imagem aérea com o mesmo bbox da grade.');
  }
  if (manifest.satellite != null) {
    const image = manifest.satellite;
    if (!object(image) || typeof image.url !== 'string' || !image.url.trim() || typeof image.attribution !== 'string' || !image.attribution.trim()) fail('Imagem aérea: informe URL e atribuição.');
    const bbox = image.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(finite) || !coordinate(bbox.slice(0, 2)) || !coordinate(bbox.slice(2)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) fail('Imagem aérea: bbox deve ser [oeste, sul, leste, norte] em WGS84, sem cruzar o antimeridiano.');
    // Only origin-relative assets or HTTPS; never persist session-local blob URLs.
    const local = image.url.startsWith('/') && !image.url.startsWith('//') && !image.url.includes('\\');
    let url;
    try { url = new URL(image.url, 'https://lab.invalid'); } catch { fail('Imagem aérea: URL inválida.'); }
    if ((!local && !image.url.startsWith('https://')) || url.protocol !== 'https:' || url.username || url.password) fail('Imagem aérea: use caminho /assets/... ou HTTPS sem credenciais.');
    if (image.crs != null && image.crs !== 'EPSG:4326') fail('Imagem aérea: reprojete a imagem para EPSG:4326 antes de associar o bbox.');
    if (image.resolution_m != null && (!finite(image.resolution_m) || image.resolution_m <= 0)) fail('Imagem aérea: resolução deve ser positiva, em metros por pixel.');
  }
  if (manifest.machine != null && (!object(manifest.machine) || typeof manifest.machine.id !== 'string' || !manifest.machine.id.trim())) fail('Identificação de máquina inválida no manifesto.');
  for (const field of ['duration_s', 'export_rate_hz']) {
    if (manifest[field] != null && (!finite(manifest[field]) || manifest[field] <= 0)) fail(`Metadado ${field} deve ser um número positivo.`);
  }
  if (manifest.rules != null && !object(manifest.rules)) fail('Regras inválidas no manifesto.');
  const water = manifest.rules?.water_warning_distance_m;
  const coolant = manifest.rules?.coolant_warning_c;
  if (water != null && (!finite(water) || water < 0)) fail('A distância de aviso da água deve ser um número em metros, maior ou igual a zero.');
  if (coolant != null && (!finite(coolant) || coolant < -273.15)) fail('O limite de arrefecimento deve ser um número válido em °C.');
  if (manifest.files != null && (!Array.isArray(manifest.files) || manifest.files.some(file => !object(file) || typeof file.file !== 'string' || !Number.isInteger(file.samples) || file.samples < 1))) fail('Lista de arquivos inválida no manifesto.');
}

function parseTimestamp(value, row) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) fail(`Linha ${row}: timestamp deve ser UTC ISO 8601, por exemplo 2026-09-09T12:00:00.000Z.`);
  const ms = Date.parse(value);
  const canonical = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction = '') => `.${fraction.padEnd(3, '0')}Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== canonical) fail(`Linha ${row}: timestamp contém uma data ou hora inválida.`);
  return ms;
}

function parseValue(name, value, row) {
  if (value === '') return null;
  if (name === 'timestamp' || name === 'machine_id' || name === 'gnss_fix') return value;
  if (BOOLEAN_FIELDS.has(name)) {
    if (value !== 'true' && value !== 'false') fail(`Linha ${row}, ${name}: use true, false ou célula vazia.`);
    return value === 'true';
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) fail(`Linha ${row}, ${name}: esperado número em ${LAB_UNITS[name]} com decimal ponto, ou célula vazia.`);
  const number = Number(value);
  const invalid = (NONNEGATIVE_FIELDS.has(name) && number < 0)
    || (name === 'latitude_deg' && Math.abs(number) >= 90)
    || (name === 'longitude_deg' && Math.abs(number) > 180)
    || (name === 'heading_deg' && (number < 0 || number >= 360))
    || (name === 'roll_deg' && Math.abs(number) > 180)
    || (name === 'pitch_deg' && Math.abs(number) > 90)
    || (['engine_load_pct', 'relative_humidity_pct'].includes(name) && (number < 0 || number > 100))
    || (['coolant_temp_c', 'ambient_temp_c'].includes(name) && number < -273.15);
  if (invalid) fail(`Linha ${row}, ${name}: valor ${value} fora do intervalo válido (${LAB_UNITS[name]}).`);
  return number;
}

function buildPolygons(map, origin, warnings) {
  if (map == null) { warnings.push('Mapa não associado: cerca e proximidade da água não podem ser avaliadas.'); return []; }
  if (!object(map) || map.type !== 'FeatureCollection' || !Array.isArray(map.features)) fail('Mapa inválido: esperado um GeoJSON FeatureCollection.');
  if (map.crs && !['EPSG:4326', 'urn:ogc:def:crs:OGC:1.3:CRS84'].includes(map.crs?.properties?.name)) fail('Mapa: reprojete as coordenadas para WGS84 longitude,latitude antes de importar.');
  if (map.features.length > 1000) fail('Mapa muito grande: limite de 1.000 áreas.');
  const polygons = [];
  for (const [index, feature] of map.features.entries()) {
    if (feature?.type !== 'Feature' || !object(feature.properties) || !object(feature.geometry)) fail(`Mapa: feição ${index + 1} inválida.`);
    const role = feature.properties.role;
    if (!['property_boundary', 'allowed_area', 'water'].includes(role)) { warnings.push(`Feição ${index + 1} sem papel property_boundary, allowed_area ou water: não participa das regras.`); continue; }
    const geometry = feature.geometry;
    if (!['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) fail(`Mapa: a área ${index + 1} deve ser Polygon ou MultiPolygon.`);
    const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!parts.length) fail(`Mapa: a área ${index + 1} não contém polígonos.`);
    for (const [partIndex, part] of parts.entries()) {
      if (!Array.isArray(part) || !part.length) fail(`Mapa: a área ${index + 1} não contém anéis.`);
      const rings = part.map(ring => {
        if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10000 || !ring.every(coordinate)) fail(`Mapa: anel inválido na área ${index + 1}; use pelo menos quatro coordenadas [longitude, latitude].`);
        if (ring.some(point => point.length > 2) && !warnings.includes('Altitudes do GeoJSON preservadas no arquivo, mas não usadas para gerar relevo.')) warnings.push('Altitudes do GeoJSON preservadas no arquivo, mas não usadas para gerar relevo.');
        if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) fail(`Mapa: o anel da área ${index + 1} deve terminar na coordenada inicial.`);
        const projected = ring.map(([lon, lat]) => toLocalCoordinate(lon, lat, origin));
        const area = projected.slice(1).reduce((sum, p, i) => sum + projected[i].x * p.z - p.x * projected[i].z, 0);
        if (Math.abs(area) < 1e-6) fail(`Mapa: a área ${index + 1} tem geometria sem superfície.`);
        return projected;
      });
      polygons.push({ id: `${feature.properties.id || `area-${index + 1}`}${parts.length > 1 ? `-${partIndex}` : ''}`, role, rings });
    }
  }
  if (!polygons.some(p => p.role === 'allowed_area')) warnings.push('Mapa sem área permitida: eventos de cerca indisponíveis.');
  if (!polygons.some(p => p.role === 'water')) warnings.push('Mapa sem água cadastrada: eventos de proximidade indisponíveis.');
  return polygons;
}

// Geography can be explored without creating telemetry or placing a machine.
export function parseLabSite(manifest = null, map = null, fallbackOrigin = [0, 0]) {
  validateManifest(manifest);
  const bbox = manifest?.satellite?.bbox;
  const geometry = map?.features?.[0]?.geometry;
  const first = geometry?.type === 'MultiPolygon' ? geometry.coordinates?.[0]?.[0]?.[0] : geometry?.coordinates?.[0]?.[0];
  const origin = manifest?.local_origin || (bbox ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] : coordinate(first) ? first.slice(0, 2) : fallbackOrigin);
  const warnings = [];
  const polygons = buildPolygons(map, origin, warnings);
  if (manifest?.map_warning) warnings.push(String(manifest.map_warning));
  return { manifest, map, origin, polygons, warnings };
}

export function associateLabSite(manifest, site) {
  // Site metadata must never replace machine identity, timestamps or synthetic flags.
  const result = { ...manifest };
  for (const key of ['site', 'satellite', 'terrain', 'local_origin', 'coordinate_reference', 'map_warning', 'elevation']) {
    delete result[key];
    if (site.manifest?.[key] != null) result[key] = site.manifest[key];
  }
  result.local_origin = site.origin;
  if (site.manifest?.rules || result.rules) result.rules = { ...site.manifest?.rules, ...result.rules };
  return { manifest: result, map: site.map };
}

function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}

function ringContains(point, ring) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    if (segmentDistance(point, a, b) <= 1e-7) return 0; // Boundary belongs to the polygon.
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside ? 1 : -1;
}

function polygonContains(point, polygon) {
  const outer = ringContains(point, polygon.rings[0]);
  if (outer <= 0) return outer === 0;
  for (const hole of polygon.rings.slice(1)) {
    const relation = ringContains(point, hole);
    if (relation === 0) return true;
    if (relation === 1) return false;
  }
  return true;
}

function polygonDistance(point, polygon) {
  if (polygonContains(point, polygon)) return 0;
  let distance = Infinity;
  for (const ring of polygon.rings) for (let i = 1; i < ring.length; i++) distance = Math.min(distance, segmentDistance(point, ring[i - 1], ring[i]));
  return distance;
}

function hasPosition(sample) { return sample.gnss_fix === '3d' && sample.x !== null && sample.z !== null; }

function detectEvents(samples, polygons, rules, caseId) {
  const allowed = polygons.filter(p => p.role === 'allowed_area');
  const water = polygons.filter(p => p.role === 'water');
  const previous = {};
  const events = [];
  for (const sample of samples) {
    const gps = hasPosition(sample);
    const waterDistance = gps && water.length ? Math.min(...water.map(p => polygonDistance(sample, p))) : null;
    const conditions = {
      outside_fence: gps && allowed.length ? !allowed.some(p => polygonContains(sample, p)) : null,
      near_water: waterDistance === null ? null : waterDistance <= rules.water_warning_distance_m,
      coolant_warning: sample.coolant_temp_c === null ? null : sample.coolant_temp_c >= rules.coolant_warning_c,
      gnss_unavailable: !gps,
      device_collision_warning: sample.collision_warning_active,
      device_inclination_warning: sample.inclination_warning_active,
    };
    for (const [type, active] of Object.entries(conditions)) {
      if (active === null) continue; // Missing evidence cannot end a measured event.
      if (active !== (previous[type] ?? false)) {
        const transition = active ? 'start' : 'end';
        const evidence = { gnss_fix: sample.gnss_fix, latitude_deg: sample.latitude_deg, longitude_deg: sample.longitude_deg };
        let description;
        if (type === 'outside_fence') description = active ? 'Posição registrada fora do polígono permitido. A borda faz parte da área permitida.' : 'Posição registrada novamente dentro da área permitida.';
        else if (type === 'near_water') {
          Object.assign(evidence, { distance_to_water_m: waterDistance, threshold_m: rules.water_warning_distance_m });
          description = `Distância horizontal calculada até o polígono da água: ${waterDistance.toFixed(1)} m. Limite de aviso: ${rules.water_warning_distance_m} m. Isso não comprova entrada na água.`;
        } else if (type === 'coolant_warning') {
          Object.assign(evidence, { coolant_temp_c: sample.coolant_temp_c, threshold_c: rules.coolant_warning_c, engine_load_pct: sample.engine_load_pct, coolant_warning_active: sample.coolant_warning_active });
          description = `Líquido de arrefecimento a ${sample.coolant_temp_c} °C; limite didático ${rules.coolant_warning_c} °C. A leitura isolada não comprova defeito mecânico.`;
        } else if (type === 'device_collision_warning') {
          Object.assign(evidence, { collision_warning_active: active, obstacle_distance_cm: sample.obstacle_distance_cm, ultrasonic_echo_valid: sample.ultrasonic_echo_valid });
          description = `Flag de colisão do dispositivo ${active ? 'ativada' : 'desativada'}. É um alerta registrado pelo equipamento; não comprova colisão nem proximidade da água.`;
        } else if (type === 'device_inclination_warning') {
          Object.assign(evidence, { inclination_warning_active: active, imu_pitch_raw: sample.imu_pitch_raw, imu_roll_raw: sample.imu_roll_raw });
          description = `Flag de inclinação do dispositivo ${active ? 'ativada' : 'desativada'}. A atitude bruta conserva as unidades e eixos da origem; o alerta não comprova tombamento.`;
        } else description = active ? 'Sem posição GNSS utilizável. O replay não estima movimento; sinais de INS/IMU disponíveis permanecem registrados.' : 'Primeira posição GNSS utilizável após a lacuna. O trajeto do intervalo ausente permanece desconhecido.';
        events.push({ id: `${caseId}:${type}:${transition}:${sample.elapsedMs}`, type, transition, elapsedMs: sample.elapsedMs, timestamp: sample.timestamp, title: TITLES[type][active ? 0 : 1], description, evidence });
      }
      previous[type] = active;
    }
  }
  return events;
}

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function parseLabCase(rawCsv, { fileName = 'caso.csv', manifest = null, map = null, schema = null } = {}) {
  validateManifest(manifest);
  const [header, ...rows] = readCsv(rawCsv);
  const columns = header.map(value => value.trim());
  const missing = LAB_COLUMNS.filter(name => !columns.includes(name));
  if (missing.length) fail(`Colunas obrigatórias ausentes: ${missing.join(', ')}. Use o CSV do laboratório, separado por vírgulas e com unidades indicadas nos nomes das colunas.`);
  if (new Set(columns).size !== columns.length) fail('O cabeçalho contém colunas duplicadas.');
  const unknown = columns.filter(name => !Object.hasOwn(LAB_UNITS, name));
  if (unknown.length) fail(`Colunas não reconhecidas: ${unknown.join(', ')}. Verifique nomes e unidades no schema.json.`);
  validateSchema(schema, columns);
  if (rows.length < 2) fail('O replay precisa de pelo menos duas amostras com timestamps distintos.');
  const samples = rows.map((values, index) => {
    const row = index + 2;
    if (values.length !== columns.length) fail(`Linha ${row}: ${values.length} valores, mas o cabeçalho tem ${columns.length} colunas. Use vírgula entre campos e ponto nos decimais.`);
    const sample = Object.fromEntries(columns.map((name, i) => [name, parseValue(name, values[i].trim(), row)]));
    for (const name of LAB_ESP32_COLUMNS) if (!Object.hasOwn(sample, name)) sample[name] = null;
    if (!sample.timestamp) fail(`Linha ${row}: timestamp ausente.`);
    if (!sample.machine_id) fail(`Linha ${row}: machine_id ausente.`);
    if (sample.synthetic === null) fail(`Linha ${row}: informe synthetic como true ou false para identificar a origem dos dados.`);
    if (sample.gnss_fix !== null && !['3d', 'no_fix'].includes(sample.gnss_fix)) fail(`Linha ${row}: gnss_fix deve ser 3d, no_fix ou célula vazia.`);
    if (sample.gnss_fix === 'no_fix' && ['latitude_deg', 'longitude_deg', 'ground_speed_kmh', 'gnss_horizontal_accuracy_m'].some(name => sample[name] !== null)) fail(`Linha ${row}: com gnss_fix=no_fix, posição, velocidade GNSS e precisão devem estar vazias; não use zero.`);
    sample.timeMs = parseTimestamp(sample.timestamp, row);
    return sample;
  });
  const first = samples[0], last = samples.at(-1);
  const intervals = [];
  for (const [index, sample] of samples.entries()) {
    if (sample.machine_id !== first.machine_id) fail(`Linha ${index + 2}: o CSV mistura máquinas; importe um caso por máquina.`);
    if (sample.synthetic !== first.synthetic) fail(`Linha ${index + 2}: o CSV mistura dados sintéticos e reais.`);
    sample.elapsedMs = sample.timeMs - first.timeMs;
    if (index) {
      const delta = sample.timeMs - samples[index - 1].timeMs;
      if (delta <= 0) fail(`Linha ${index + 2}: timestamps repetidos ou fora de ordem. O CSV original não foi reordenado.`);
      intervals.push(delta);
    }
  }
  if (manifest?.machine && manifest.machine.id !== first.machine_id) fail('A máquina do manifesto não corresponde ao machine_id do CSV.');
  if (manifest?.synthetic != null && manifest.synthetic !== first.synthetic) fail('A origem synthetic do manifesto não corresponde ao CSV.');
  if (manifest?.duration_s != null && Math.abs(manifest.duration_s * 1000 - last.elapsedMs) > 1) fail('A duração do manifesto não corresponde ao período registrado no CSV.');
  const fileMetadata = manifest?.files?.find(file => file.file === fileName);
  if (fileMetadata && fileMetadata.samples !== samples.length) fail(`O manifesto declara ${fileMetadata.samples} amostras para este arquivo; o CSV contém ${samples.length}.`);
  const validPosition = samples.find(s => s.latitude_deg !== null && s.longitude_deg !== null && s.gnss_fix === '3d');
  const site = parseLabSite(manifest, map, validPosition ? [validPosition.longitude_deg, validPosition.latitude_deg] : [0, 0]);
  const { origin, polygons } = site;
  const warnings = [];
  if (!schema) warnings.push('Unidades convencionadas pelo formato das colunas; sem dicionário associado, confirme a origem e calibração dos sinais.');
  if (!manifest?.rules) warnings.push('Regras padrão didáticas: água a até 20 m e arrefecimento a partir de 105 °C; confirme os limites aplicáveis à máquina.');
  if (!validPosition) warnings.push('Nenhuma posição GNSS utilizável: a localização do trator permanece indisponível.');
  if (ESP32_FIELDS.some(([name, unit]) => unit === 'unidade de origem' && samples.some(sample => sample[name] !== null))) warnings.push('Sinais IMU brutos em unidade de origem: eixos, unidades e calibração não confirmados. Eles não são convertidos em graus, g, rumo absoluto ou trajetória.');
  if (samples.some(sample => sample.collision_warning_active !== null || sample.inclination_warning_active !== null)) warnings.push('Alertas de colisão e inclinação reproduzem flags do dispositivo; não comprovam acidente nem substituem as regras de cerca e água.');
  for (const sample of samples) {
    const position = sample.gnss_fix === '3d' && sample.latitude_deg !== null && sample.longitude_deg !== null
      ? toLocalCoordinate(sample.longitude_deg, sample.latitude_deg, origin) : { x: null, z: null };
    Object.assign(sample, position);
  }
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const sampleIntervalMs = manifest?.export_rate_hz ? 1000 / manifest.export_rate_hz : sortedIntervals[Math.floor(sortedIntervals.length / 2)];
  const gaps = intervals.filter(delta => delta > sampleIntervalMs * 1.5).length;
  if (gaps) warnings.push(`${gaps} lacuna(s) na sequência de timestamps. O replay não preenche os intervalos sem registro.`);
  const missingFields = columns.filter(name => samples.some(sample => sample[name] === null));
  if (missingFields.length) warnings.push(`Valores ausentes preservados como indisponíveis: ${missingFields.join(', ')}.`);
  const inconsistentWarnings = samples.filter(s => s.coolant_temp_c !== null && s.coolant_warning_active !== null && s.coolant_warning_active !== (s.coolant_temp_c >= (manifest?.rules?.coolant_warning_c ?? 105))).length;
  if (inconsistentWarnings) warnings.push(`${inconsistentWarnings} amostra(s) com aviso ECU diferente da comparação térmica; o evento usa a leitura e o limite documentado, sem substituir o sinal original.`);
  warnings.push(...site.warnings);
  const rules = { water_warning_distance_m: manifest?.rules?.water_warning_distance_m ?? 20, coolant_warning_c: manifest?.rules?.coolant_warning_c ?? 105 };
  const id = `lab:${first.machine_id}:${first.timeMs}:${last.timeMs}:${hashText(rawCsv)}`;
  const knownTitles = { '01-operacao-normal.csv': 'Operação normal', '02-cerca-e-agua.csv': 'Cerca e proximidade da água', '03-aquecimento-e-falha-gps.csv': 'Aquecimento e falha de GPS' };
  return {
    id, title: knownTitles[fileName] || fileName.replace(/\.csv$/i, ''), fileName, rawCsv,
    machineId: first.machine_id, synthetic: first.synthetic, hasEsp32: columns.some(name => LAB_ESP32_COLUMNS.includes(name)), samples,
    startedAt: first.timestamp, durationMs: last.elapsedMs, sampleIntervalMs,
    events: detectEvents(samples, polygons, rules, id), warnings, manifest, map, schema, origin, polygons,
  };
}

export function getReplayFrame(labCase, requestedElapsedMs) {
  const elapsedMs = Math.max(0, Math.min(labCase.durationMs, Number.isFinite(requestedElapsedMs) ? requestedElapsedMs : 0));
  let low = 0, high = labCase.samples.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (labCase.samples[middle].elapsedMs <= elapsedMs) low = middle;
    else high = middle - 1;
  }
  const sample = labCase.samples[low];
  const next = labCase.samples[low + 1];
  const recordingGap = Boolean(next && next.elapsedMs - sample.elapsedMs > labCase.sampleIntervalMs * 1.5 && elapsedMs >= sample.elapsedMs + labCase.sampleIntervalMs);
  const gpsGap = !hasPosition(sample);
  const hasGps = !recordingGap && !gpsGap;
  const active = new Map();
  for (const event of labCase.events) {
    if (event.elapsedMs > elapsedMs) break;
    if (event.transition === 'start') active.set(event.type, event);
    else active.delete(event.type);
  }
  const activeEvents = [...active.values()].filter(event => !recordingGap
    && (hasGps || !['outside_fence', 'near_water'].includes(event.type))
    && (!DEVICE_WARNING_FIELDS[event.type] || sample[DEVICE_WARNING_FIELDS[event.type]] === true));
  return { elapsedMs, sample, sampleIndex: low, position: hasGps ? { x: sample.x, z: sample.z } : null, hasGps, gap: gpsGap || recordingGap, gpsGap, recordingGap, activeEvents };
}

export function formatLabTime(milliseconds) {
  const tenths = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 100);
  return `${Math.floor(tenths / 600).toString().padStart(2, '0')}:${Math.floor(tenths / 10 % 60).toString().padStart(2, '0')}.${tenths % 10}`;
}
