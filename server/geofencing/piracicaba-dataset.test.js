// Trava o caso de exemplo brasileiro: os CSVs reproduzem eventos-esperados.json e os episódios por faixa.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseLabCase } from '../../shared/lab-telemetry.js';

const dir = path.resolve('public/datasets/piracicaba-artemis');
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const map = JSON.parse(read('mapa.geojson'));
const expected = JSON.parse(read('eventos-esperados.json'));
const parse = (fileName) => parseLabCase(read(fileName), { fileName, manifest, map });
const shape = (events) => events.map(({ type, transition, elapsedMs }) => ({ type, transition, elapsedMs }));

test('dataset Piracicaba: mapa tem os quatro papéis e o rio preserva a ilha', () => {
  const roles = map.features.map((feature) => feature.properties.role);
  assert.deepEqual([...new Set(roles)].sort(), ['allowed_area', 'hazard', 'property_boundary', 'water']);
  const water = map.features.find((feature) => feature.properties.role === 'water');
  const polygons = water.geometry.type === 'MultiPolygon' ? water.geometry.coordinates : [water.geometry.coordinates];
  assert.ok(['Polygon', 'MultiPolygon'].includes(water.geometry.type));
  assert.ok(polygons.some((rings) => rings.length >= 2), 'o rio deve conter um anel interno (ilha)');
  for (const rings of polygons) for (const ring of rings) assert.deepEqual(ring[0], ring.at(-1), 'anéis fechados');
  for (const feature of map.features) if (feature.properties.role !== 'water') assert.equal(feature.properties.synthetic, true);
});

test('dataset Piracicaba: os dois CSVs reproduzem eventos-esperados.json e são determinísticos', () => {
  for (const fileName of Object.keys(expected)) {
    const first = parse(fileName);
    const second = parse(fileName);
    assert.deepEqual(shape(first.events), expected[fileName], `${fileName}: eventos divergem do esperado`);
    assert.deepEqual(first.geofence, second.geofence, `${fileName}: geofence não determinístico`);
    assert.ok(first.samples.every((sample) => sample.synthetic === true), `${fileName}: toda amostra deve ser sintética`);
    assert.doesNotMatch(JSON.stringify(first.events), /seguro|acidente/i);
  }
});

test('dataset Piracicaba: colheita normal chega à faixa elevada da água, nunca à crítica, com lacuna contada', () => {
  const labCase = parse('01-colheita-normal.csv');
  const water = labCase.geofence.episodes.filter((episode) => episode.hazardKey.startsWith('water'));
  assert.ok(water.some((episode) => episode.bandId === 'elevada'), 'esperava episódio na faixa elevada');
  assert.ok(!water.some((episode) => episode.bandId === 'critica'), 'não deveria entrar na faixa crítica');
  assert.ok(Math.min(...water.map((episode) => episode.minDistanceM)) > 5);
  assert.ok(labCase.events.some((event) => event.type === 'gnss_unavailable'));
  assert.ok(labCase.geofence.affectedArea.every((row) => row.areaM2 >= 0 && row.shareOfAllowed <= 1));
});

test('dataset Piracicaba: declive registra entrada no polígono e o alerta de inclinação vem depois', () => {
  const labCase = parse('02-declive-tombamento.csv');
  const inside = labCase.geofence.episodes.find((episode) => episode.hazardKey.startsWith('hazard:slope') && episode.bandId === 'dentro');
  assert.ok(inside, 'esperava episódio dentro do declive');
  assert.equal(inside.minDistanceM, 0);
  const warning = labCase.events.find((event) => event.type === 'device_inclination_warning' && event.transition === 'start');
  assert.ok(warning && warning.elapsedMs >= inside.startMs, 'alerta de inclinação deve ocorrer já dentro do declive');
  assert.equal(inside.endMs, null, 'máquina parada dentro do declive: episódio aberto no fim');
  assert.equal(inside.quality, 'aberto-no-fim');
});

test('dataset Piracicaba: a máquina passa do limite de inclinação do perfil antes do alerta do dispositivo e dentro da encosta', () => {
  const labCase = parse('02-declive-tombamento.csv');
  assert.equal(manifest.machine.profile.max_roll_deg, 15);
  const above = labCase.geofence.episodes.find((episode) => episode.hazardKey === 'machine:roll_deg' && episode.bandId === 'acima');
  const near = labCase.geofence.episodes.find((episode) => episode.hazardKey === 'machine:roll_deg' && episode.bandId === 'proximo');
  assert.ok(near && above && near.startMs < above.startMs, 'próximo do limite vem antes de acima do limite');
  const warning = labCase.events.find((event) => event.type === 'device_inclination_warning' && event.transition === 'start');
  assert.ok(warning && above.startMs < warning.elapsedMs, 'o limite do perfil é cruzado antes do alerta de 25° do dispositivo');
  assert.equal(above.endMs, null, 'tombada dentro da encosta: episódio aberto no fim');
});
