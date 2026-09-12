import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseLabCase, getReplayFrame, toLocalCoordinate, formatLabTime, LAB_COLUMNS, LAB_ESP32_COLUMNS, LAB_UNITS } from '../shared/lab-telemetry.js';

const dataset = new URL('../datasets/laboratorio-virtual-v1/', import.meta.url);
const read = file => readFileSync(new URL(file, dataset), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const map = JSON.parse(read('mapa.geojson'));
const schema = JSON.parse(read('schema.json'));
// Only the tests can import this answer key. Application code derives events from samples and geometry.
const expected = JSON.parse(read('eventos-esperados.json'));
const cases = manifest.files.map(({ file }) => parseLabCase(read(file), { fileName: file, manifest, map, schema }));
const source = read('01-operacao-normal.csv');
const initialRows = source.trim().split(/\r?\n/).slice(0, 4);
const fields = initialRows[0].split(',');
function csvWith(patches = [{}], { header = fields, start = 0, step = 100 } = {}) {
  const baseline = Object.fromEntries(fields.map((name, index) => [name, initialRows[1].split(',')[index]]));
  return [header.join(','), ...patches.map((patch, index) => {
    const sample = { ...baseline, timestamp: new Date(Date.parse(baseline.timestamp) + start + index * step).toISOString(), ...patch };
    return header.map(name => sample[name] ?? '').join(',');
  })].join('\n');
}

test('all three original examples reproduce the independent expected transitions exactly', () => {
  for (const labCase of cases) {
    assert.equal(labCase.samples.length, 6001);
    assert.equal(labCase.durationMs, 600000);
    assert.equal(labCase.sampleIntervalMs, 100);
    assert.equal(labCase.rawCsv, read(labCase.fileName));
    assert.deepEqual(labCase.schema, schema);
    assert.deepEqual(labCase.events.map(event => ({
      case: labCase.fileName.replace('.csv', ''), timestamp: event.timestamp,
      elapsed_s: event.elapsedMs / 1000, event: event.type, transition: event.transition,
      synthetic: labCase.synthetic,
    })), expected.filter(event => event.case === labCase.fileName.replace('.csv', '')));
  }
  assert.equal(cases[0].events.length, 0);
  assert.equal(cases[1].events.at(-1).transition, 'start');
  assert.equal(cases[2].events.at(-1).type, 'coolant_warning');
  assert.equal(cases[2].events.at(-1).transition, 'start');
});

test('playback navigation is a pure lookup, retains raw sample values, and never duplicates events', () => {
  const labCase = cases[1];
  const eventsBefore = JSON.stringify(labCase.events);
  const order = [0, 134900, 600000, 128500, 100, 428500, 428500, -100, 999999];
  for (const time of order) {
    const frame = getReplayFrame(labCase, time);
    assert.ok(frame.sample.elapsedMs <= frame.elapsedMs);
    assert.equal(frame.sample, labCase.samples[frame.sampleIndex]);
    assert.equal(JSON.stringify(labCase.events), eventsBefore);
    assert.deepEqual(frame, getReplayFrame(labCase, time));
  }
  assert.deepEqual(getReplayFrame(labCase, 134999).activeEvents.map(event => event.type).sort(), ['near_water', 'outside_fence']);
  assert.equal(getReplayFrame(labCase, 134999).sample.elapsedMs, 134900);
  assert.equal(getReplayFrame(labCase, 172000).activeEvents.length, 0);
});

test('GPS outage preserves 30 null samples and INS without inventing a trajectory', () => {
  const labCase = cases[2];
  const gapSamples = labCase.samples.filter(sample => sample.gnss_fix === 'no_fix');
  assert.equal(gapSamples.length, 30);
  for (const sample of gapSamples) {
    for (const field of ['latitude_deg', 'longitude_deg', 'ground_speed_kmh', 'gnss_horizontal_accuracy_m', 'x', 'z']) assert.equal(sample[field], null);
    assert.equal(typeof sample.heading_deg, 'number');
    assert.equal(typeof sample.engine_rpm, 'number');
  }
  for (const time of [240000, 241550, 242999]) {
    const frame = getReplayFrame(labCase, time);
    assert.equal(frame.hasGps, false);
    assert.equal(frame.gap, true);
    assert.equal(frame.position, null);
    assert.equal(frame.activeEvents.find(event => event.type === 'gnss_unavailable').elapsedMs, 240000);
  }
  assert.equal(getReplayFrame(labCase, 239999).hasGps, true);
  assert.equal(getReplayFrame(labCase, 243000).hasGps, true);
  assert.equal(getReplayFrame(labCase, 243000).activeEvents.length, 0);
});

test('missing sensors remain null, empty GNSS fix is unavailable, and no map cannot create geofence events', () => {
  const labCase = parseLabCase(csvWith([
    { coolant_temp_c: '', brake_pressed: '', engine_rpm: '', gnss_fix: '', latitude_deg: '', longitude_deg: '' },
    { coolant_temp_c: '', brake_pressed: '', engine_rpm: '' },
  ]));
  assert.equal(labCase.samples[0].coolant_temp_c, null);
  assert.equal(labCase.samples[0].brake_pressed, null);
  assert.equal(labCase.samples[0].engine_rpm, null);
  assert.equal(labCase.samples[0].x, null);
  assert.ok(labCase.warnings.some(warning => warning.includes('Valores ausentes')));
  assert.ok(labCase.warnings.some(warning => warning.includes('Mapa não associado')));
  assert.deepEqual(labCase.events.map(event => event.type), ['gnss_unavailable', 'gnss_unavailable']);
});

test('omitted recording interval is explicit; no forward position is used or interpolated', () => {
  const csv = csvWith([{}, {}, { timestamp: '2026-09-09T12:00:02.000Z' }, { timestamp: '2026-09-09T12:00:02.100Z' }]);
  const labCase = parseLabCase(csv);
  assert.equal(labCase.sampleIntervalMs, 100);
  assert.equal(getReplayFrame(labCase, 199).recordingGap, false);
  for (const time of [200, 1500, 1999]) {
    const frame = getReplayFrame(labCase, time);
    assert.equal(frame.sample.elapsedMs, 100);
    assert.equal(frame.recordingGap, true);
    assert.equal(frame.position, null);
  }
  assert.equal(getReplayFrame(labCase, 2000).recordingGap, false);
  assert.ok(labCase.warnings.some(warning => warning.includes('timestamps')));
});

test('CSV parser handles BOM, quoting and original data preservation', () => {
  const csv = '\uFEFF' + csvWith([{ machine_id: '"TRATOR, teste"' }, { machine_id: '"TRATOR, teste"' }]).replaceAll('\n', '\r\n') + '\r\n';
  const labCase = parseLabCase(csv);
  assert.equal(labCase.machineId, 'TRATOR, teste');
  assert.equal(labCase.rawCsv, csv);
  assert.equal(labCase.samples[0].brake_pressed, false);
  assert.equal(labCase.samples[0].roll_deg, 0);
});

test('invalid columns, timestamps, numeric domains and GNSS semantics produce readable errors', () => {
  const examples = [
    ['', /vazio/],
    [csvWith([{}]), /duas amostras/],
    [csvWith([{}, {}], { header: fields.filter(name => name !== 'coolant_temp_c') }), /coolant_temp_c/],
    [csvWith([{}, {}], { header: [...fields, 'engine_rpm'] }), /duplicadas/],
    [csvWith([{}, {}], { header: [...fields, 'coolant_temp_f'] }), /não reconhecidas/],
    [csvWith([{ timestamp: '2026-02-30T12:00:00.000Z' }, {}]), /data ou hora inválida/],
    [csvWith([{ timestamp: '2026-09-09T12:00:00-03:00' }, {}]), /UTC ISO/],
    [csvWith([{}, { timestamp: '2026-09-09T12:00:00.000Z' }]), /repetidos ou fora de ordem/],
    [csvWith([{}, { timestamp: '2026-09-08T12:00:00.000Z' }]), /repetidos ou fora de ordem/],
    [csvWith([{ engine_rpm: 'NaN' }, {}]), /engine_rpm/],
    [csvWith([{ ground_speed_kmh: '-1' }, {}]), /ground_speed_kmh/],
    [csvWith([{ heading_deg: '360' }, {}]), /heading_deg/],
    [csvWith([{ relative_humidity_pct: '101' }, {}]), /relative_humidity_pct/],
    [csvWith([{ latitude_deg: '100' }, {}]), /latitude_deg/],
    [csvWith([{ brake_pressed: '0' }, {}]), /true, false/],
    [csvWith([{ gnss_fix: 'no_fix', latitude_deg: '0' }, {}]), /não use zero/],
    [csvWith([{}, { machine_id: 'outra' }]), /mistura máquinas/],
    [csvWith([{}, { synthetic: 'false' }]), /mistura dados/],
    [csvWith([{}, { synthetic: '' }]), /informe synthetic/],
  ];
  for (const [csv, message] of examples) assert.throws(() => parseLabCase(csv), message);
  assert.throws(() => parseLabCase(initialRows.join('\n') + ',extra'), /valores/);
  assert.throws(() => parseLabCase('"unclosed'), /aspas não foi fechado/);
});

test('schema units and metadata must agree with the original values and coordinate semantics', () => {
  const wrongSchema = structuredClone(schema);
  wrongSchema.fields.find(field => field.name === 'coolant_temp_c').unit = '°F';
  assert.throws(() => parseLabCase(source, { schema: wrongSchema }), /Unidade incompatível.*coolant_temp_c/);
  for (const metadata of [
    { ...manifest, machine: { id: 'outra' } },
    { ...manifest, synthetic: false },
    { ...manifest, duration_s: 500 },
    { ...manifest, coordinate_reference: 'latitude,longitude' },
    { ...manifest, local_origin: [200, -22] },
    { ...manifest, rules: { water_warning_distance_m: -1 } },
    { ...manifest, export_rate_hz: 0 },
  ]) assert.throws(() => parseLabCase(source, { manifest: metadata }));
  assert.throws(() => parseLabCase(source, { map: { type: 'Point', coordinates: [0, 0] } }), /GeoJSON FeatureCollection/);
  const unclosedMap = structuredClone(map);
  unclosedMap.features[0].geometry.coordinates[0].pop();
  assert.throws(() => parseLabCase(source, { map: unclosedMap }), /terminar na coordenada inicial/);
});

test('map position and scale derive from WGS84, boundary included and holes respected', () => {
  const origin = [-47.65, -22.7];
  assert.deepEqual(toLocalCoordinate(...origin, origin), { x: 0, z: -0 });
  const fence = cases[0].polygons.find(polygon => polygon.role === 'allowed_area');
  assert.ok(Math.abs(fence.rings[0][0].x + 95) < 0.001);
  assert.ok(Math.abs(fence.rings[0][0].z - 80) < 0.001);
  const ring = map.features[0].geometry.coordinates[0];
  const corner = { longitude_deg: String(ring[0][0]), latitude_deg: String(ring[0][1]) };
  const boundaryCase = parseLabCase(csvWith([corner, corner]), { map, manifest: { local_origin: origin } });
  assert.equal(boundaryCase.events.length, 0);
  const withHole = structuredClone(map);
  withHole.features[0].geometry.coordinates.push([
    [-47.6501, -22.7001], [-47.6499, -22.7001], [-47.6499, -22.6999], [-47.6501, -22.6999], [-47.6501, -22.7001],
  ]);
  const holeCase = parseLabCase(csvWith([{ longitude_deg: '-47.65', latitude_deg: '-22.7' }, corner]), { map: withHole, manifest: { local_origin: origin } });
  assert.deepEqual(holeCase.events.map(event => [event.type, event.transition]), [['outside_fence', 'start'], ['outside_fence', 'end']]);
});

test('rules actually drive computed events and case identity includes machine, time and raw data', () => {
  const custom = parseLabCase(csvWith([{ coolant_temp_c: '95' }, { coolant_temp_c: '94' }]), { manifest: { rules: { coolant_warning_c: 95 } } });
  assert.deepEqual(custom.events.map(event => [event.type, event.transition]), [['coolant_warning', 'start'], ['coolant_warning', 'end']]);
  assert.equal(custom.events[0].evidence.threshold_c, 95);
  assert.notEqual(parseLabCase(csvWith([{}, {}])).id, parseLabCase(csvWith([{}, {}], { start: 1000 })).id);
  assert.notEqual(parseLabCase(csvWith([{}, {}])).id, parseLabCase(csvWith([{ engine_rpm: '1800' }, {}])).id);
  assert.equal(parseLabCase(source).id, parseLabCase(source).id);
  assert.equal(formatLabTime(243050), '04:03.0');
  assert.equal(formatLabTime(600000), '10:00.0');
});

test('ESP32 optional columns preserve original v1 cases, source units, zero, false and missing values', () => {
  assert.equal(LAB_COLUMNS.length, 23);
  assert.equal(LAB_ESP32_COLUMNS.length, 13);
  for (const labCase of cases) {
    assert.equal(labCase.hasEsp32, false);
    for (const name of LAB_ESP32_COLUMNS) assert.equal(labCase.samples[0][name], null);
  }
  const header = [...fields, ...LAB_ESP32_COLUMNS];
  const labCase = parseLabCase(csvWith([
    { obstacle_distance_cm: '0', ultrasonic_echo_valid: 'false', imu_pitch_raw: '270', rotation_z_raw: '-5000', collision_warning_active: 'false', device_timestamp: '0' },
    {},
  ], { header }));
  assert.equal(labCase.hasEsp32, true);
  assert.equal(labCase.samples[0].obstacle_distance_cm, 0);
  assert.equal(labCase.samples[0].ultrasonic_echo_valid, false);
  assert.equal(labCase.samples[0].imu_pitch_raw, 270);
  assert.equal(labCase.samples[0].rotation_z_raw, -5000);
  assert.equal(labCase.samples[0].collision_warning_active, false);
  assert.equal(labCase.samples[0].device_timestamp, 0);
  for (const name of LAB_ESP32_COLUMNS) assert.equal(labCase.samples[1][name], null);
  assert.ok(labCase.warnings.some(warning => warning.includes('unidade de origem')));
  assert.ok(labCase.warnings.some(warning => warning.includes('collision_warning_active')));
});

test('ESP32 schema extension validates every supplied column and rejects unknown names and incompatible units', () => {
  const header = [...fields, ...LAB_ESP32_COLUMNS];
  const csv = csvWith([{}, {}], { header });
  const extendedSchema = {
    ...schema,
    fields: [...schema.fields, ...LAB_ESP32_COLUMNS.map(name => ({ name, unit: LAB_UNITS[name], origin: 'ESP32', meaning: `Sinal original ${name}` }))],
  };
  assert.equal(parseLabCase(csv, { schema: extendedSchema }).hasEsp32, true);
  assert.throws(() => parseLabCase(csv, { schema }), /falta a descrição de obstacle_distance_cm/);
  const wrongUnit = structuredClone(extendedSchema);
  wrongUnit.fields.find(field => field.name === 'imu_pitch_raw').unit = 'graus';
  assert.throws(() => parseLabCase(csv, { schema: wrongUnit }), /Unidade incompatível.*imu_pitch_raw/);
  assert.throws(() => parseLabCase(csv, { schema: { ...extendedSchema, fields: [...extendedSchema.fields, { name: 'obstacle_distance_m', unit: 'm' }] } }), /colunas reconhecidas/);
  assert.throws(() => parseLabCase(csvWith([{ obstacle_distance_cm: '-1' }, {}], { header })), /obstacle_distance_cm.*fora do intervalo/);
  assert.throws(() => parseLabCase(csvWith([{ device_timestamp: '-1' }, {}], { header })), /device_timestamp.*fora do intervalo/);
  assert.throws(() => parseLabCase(csvWith([{ collision_warning_active: '1' }, {}], { header })), /true, false/);
});

test('ESP32 device alerts use known flag transitions and remain usable without inventing GPS, water or accident evidence', () => {
  const noPosition = Object.fromEntries(fields.map(name => [name, '']));
  Object.assign(noPosition, { timestamp: initialRows[1].split(',')[0], machine_id: 'ESP32-001', synthetic: 'false' });
  const patches = [
    { collision_warning_active: '', inclination_warning_active: 'false' },
    { collision_warning_active: 'false', inclination_warning_active: 'false' },
    { collision_warning_active: 'true', inclination_warning_active: 'true', obstacle_distance_cm: '35' },
    { collision_warning_active: '', inclination_warning_active: '' },
    { collision_warning_active: 'true', inclination_warning_active: 'true' },
    { collision_warning_active: 'false', inclination_warning_active: 'false' },
  ].map((patch, index) => ({ ...noPosition, timestamp: new Date(Date.parse(noPosition.timestamp) + index * 2000).toISOString(), ...patch }));
  const labCase = parseLabCase(csvWith(patches, { header: [...fields, ...LAB_ESP32_COLUMNS] }));
  const deviceEvents = labCase.events.filter(event => event.type.startsWith('device_'));
  assert.deepEqual(deviceEvents.map(event => [event.type, event.transition, event.elapsedMs]), [
    ['device_collision_warning', 'start', 4000], ['device_inclination_warning', 'start', 4000],
    ['device_collision_warning', 'end', 10000], ['device_inclination_warning', 'end', 10000],
  ]);
  assert.equal(deviceEvents[0].title, 'Alerta de colisão do dispositivo');
  assert.equal(deviceEvents[1].title, 'Alerta de inclinação do dispositivo');
  assert.equal(deviceEvents[0].evidence.collision_warning_active, true);
  assert.equal(deviceEvents[0].evidence.obstacle_distance_cm, 35);
  assert.match(deviceEvents[0].description, /não comprova colisão/);
  assert.match(deviceEvents[1].description, /não comprova tombamento/);
  assert.equal(labCase.events.some(event => ['near_water', 'outside_fence'].includes(event.type)), false);
  assert.ok(labCase.warnings.some(warning => warning.includes('Nenhuma posição GNSS')));
  for (const elapsedMs of [0, 4000, 6000, 8000, 10000]) assert.equal(getReplayFrame(labCase, elapsedMs).position, null);
  for (const elapsedMs of [4000, 8000]) assert.equal(getReplayFrame(labCase, elapsedMs).activeEvents.filter(event => event.type.startsWith('device_')).length, 2);
  for (const elapsedMs of [0, 6000, 10000]) assert.equal(getReplayFrame(labCase, elapsedMs).activeEvents.filter(event => event.type.startsWith('device_')).length, 0);
});
