import fs from 'node:fs/promises';
import path from 'node:path';
import { CliError, numberOption, objectBody } from './io.js';

export async function readLabInput(fields) {
  return {
    rawCsv: await fs.readFile(fields.csv, 'utf8'), sourceName: path.basename(fields.csv),
    ...(fields.name ? { name: fields.name } : {}),
    metadata: fields.metadata ?? null, map: fields.map ?? null, schema: fields.schema ?? null,
  };
}

export async function runLocal(name, fields, data) {
  if (name === 'lab convert') {
    const { convertSompoDataset } = await import('../shared/sompo-lab-export.js');
    return Buffer.from(convertSompoDataset(objectBody(data)).csv);
  }
  if (name === 'lab report') {
    const { parseLabCase } = await import('../shared/lab-telemetry.js');
    const { renderLabReport } = await import('../shared/lab-report.js');
    const record = objectBody(data?.case || data);
    if (typeof record.rawCsv !== 'string' || !Array.isArray(record.analyses) || !Array.isArray(record.conclusions)) throw new CliError('invalid_case', 'Use o JSON de lab cases get, com rawCsv, analyses e conclusions.');
    const parsed = parseLabCase(record.rawCsv, { fileName: record.sourceName, manifest: record.metadata, map: record.map, schema: record.schema });
    return Buffer.from(renderLabReport(parsed, record, fields.author));
  }
  if (name.startsWith('lab ')) {
    const { parseLabCase, getReplayFrame } = await import('../shared/lab-telemetry.js');
    const input = await readLabInput(fields);
    const parsed = parseLabCase(input.rawCsv, { fileName: input.sourceName, manifest: input.metadata, map: input.map, schema: input.schema });
    return name === 'lab replay' ? { ok: true, frame: getReplayFrame(parsed, fields.elapsedMs) } : { ok: true, case: parsed };
  }
  if (name === 'sompo scenarios' || name === 'sompo simulate') {
    const road = await import('../shared/sompo-telemetry-simulator.js');
    const { SOMPO_AGRI_SCENARIOS } = await import('../shared/sompo-agri-scenarios.js');
    const agri = await import('../shared/sompo-agri-brief.js');
    const { snapshotToSimulationRaw } = await import('../shared/sompo-simulation-sample.js');
    const { withSompoAgriGeofence } = await import('../shared/geofencing/index.js');
    if (name === 'sompo scenarios') return {
      road: Object.values(road.SOMPO_SIMULATION_SCENARIOS).map(s => ({ ...s, outcomes: road.getSompoScenarioOutcomes(s.scenarioId) })),
      agricultural: Object.values(SOMPO_AGRI_SCENARIOS),
    };
    const id = fields.scenario;
    const isAgri = Object.hasOwn(SOMPO_AGRI_SCENARIOS, id);
    if (!isAgri && !Object.hasOwn(road.SOMPO_SIMULATION_SCENARIOS, id)) throw new CliError('unknown_scenario', 'Cenário desconhecido. Consulte sompo scenarios.');
    const outcomes = isAgri ? agri.getSompoAgriOutcomes(id) : road.getSompoScenarioOutcomes(id);
    if (fields.outcome && !outcomes.some(item => item.id === fields.outcome)) throw new CliError('unknown_outcome', 'Desfecho desconhecido. Consulte sompo scenarios.');
    const elapsedMs = numberOption(fields.elapsedMs, 'elapsed-ms', 0, 0);
    const options = { elapsedMs, ...(data?.observedAt ? { observedAt: data.observedAt } : {}), ...(data?.connectedAt ? { connectedAt: data.connectedAt } : {}) };
    const snapshot = isAgri ? withSompoAgriGeofence(agri.createSompoAgriSimulationSnapshot(id, fields.outcome, options), id, fields.outcome, elapsedMs) : road.createSompoSimulationSnapshot({ ...data?.controls, scenarioId: id, outcomeId: fields.outcome }, options);
    const brief = isAgri ? agri.buildSompoAgriRunBrief(id, fields.outcome, elapsedMs) : road.buildSompoScenarioRunBrief(id, fields.outcome, elapsedMs);
    return { ok: true, snapshot, brief, samples: [snapshotToSimulationRaw(snapshot)] };
  }
  if (name === 'sompo normalize') {
    const { normalizeSompoTelemetry } = await import('../shared/sompo-telemetry.js');
    return { ok: true, snapshot: normalizeSompoTelemetry(objectBody(data)) };
  }
  if (name === 'sompo risk calculate') {
    const { assessSompoRisk } = await import('../shared/sompo-risk.js');
    objectBody(data);
    if (!data.snapshot) throw new CliError('missing_snapshot', '--data deve conter {snapshot,context}.');
    return { ok: true, assessment: assessSompoRisk(data.snapshot, data.context || {}) };
  }
  if (name === 'geofence evaluate') {
    const { evaluateGeofence } = await import('../shared/geofencing/index.js');
    objectBody(data);
    if (!data.position || !Number.isFinite(data.position.x) || !Number.isFinite(data.position.z) || !data.rules || !Array.isArray(data.polygons)) throw new CliError('invalid_geofence', '--data deve conter {position:{x,z,...},rules,polygons:[],machine?}.');
    return { ok: true, geofence: evaluateGeofence(data.position, data.rules, data.polygons, data.machine) };
  }
  if (name.startsWith('sensor ')) {
    const { SENSOR_SCENARIOS, sampleSensorLab, scenarioTimeline, telemetryPacket } = await import('../src/sensor-lab/physics.js');
    if (name === 'sensor scenarios') return { scenarios: SENSOR_SCENARIOS };
    const scenario = SENSOR_SCENARIOS.find(item => item.id === fields.scenario);
    if (!scenario) throw new CliError('unknown_scenario', 'Cenário desconhecido. Consulte sensor scenarios.');
    const parameter = numberOption(fields.parameter, 'parameter', scenario.param.value, scenario.param.min, scenario.param.max);
    const time = numberOption(fields.time, 'time', 0, 0);
    const reading = sampleSensorLab(scenario.id, parameter, time);
    return { ok: true, reading, timeline: scenarioTimeline(scenario.id, parameter), telemetry: telemetryPacket(reading) };
  }
  if (name === 'drowsiness evaluate') {
    const { createEyeMonitor, SENSITIVITY_THRESHOLDS } = await import('../src/sonolencia/eye-state.js');
    const sensitivity = fields.sensitivity || 'normal';
    if (!Object.hasOwn(SENSITIVITY_THRESHOLDS, sensitivity)) throw new CliError('invalid_sensitivity', 'Use low, normal ou high.');
    if (!Array.isArray(data?.samples)) throw new CliError('invalid_samples', '--data deve conter {samples:[{at,left,right},...]}; sample:null indica rosto perdido.');
    const monitor = createEyeMonitor(SENSITIVITY_THRESHOLDS[sensitivity]);
    const results = data.samples.map(sample => {
      if (!sample || !Number.isFinite(sample.at)) throw new CliError('invalid_sample', 'Cada observação deve ter at em milissegundos.');
      return { at: sample.at, ...monitor.update(Object.hasOwn(sample, 'sample') ? sample.sample : sample, sample.at) };
    });
    return { ok: true, sensitivity, results };
  }
  throw new CliError('unknown_local_command', `Comando local desconhecido: ${name}`);
}
