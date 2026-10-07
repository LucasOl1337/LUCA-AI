import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createAuthService } from './auth.js';
import { registerSompoVehicleRoutes } from './sompo-vehicles.js';
import { SOMPO_VEHICLE_SEED, pickActiveSompoVehicle, validateSompoVehicle } from '../shared/sompo-vehicles.js';

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-vehicles-test-'));
  const authPath = path.join(directory, 'auth.json');
  const servers = [];
  const launch = async () => {
    const app = express();
    app.use(express.json());
    const auth = createAuthService({ dataPath: authPath });
    auth.registerRoutes(app);
    app.use('/api', auth.requireUser);
    registerSompoVehicleRoutes(app, { dataDir: directory });
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise((resolve) => server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  let base = await launch();
  const request = async (url, { cookie, body, method = body ? 'POST' : 'GET' } = {}) => {
    const response = await fetch(`${base}${url}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const register = async (name) => (await request('/api/auth/register', { body: { name, email: `${name}@veiculos.test`, password: 'test-password-2026' } })).cookie;
  const restart = async () => { base = await launch(); };
  t.after(async () => {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    // The absolute temp directory was created by this test and is the only cleanup target.
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('luca-vehicles-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { request, register, restart, directory };
}

test('new account starts with the two example vehicles from the JSON', async (t) => {
  const { request, register } = await fixture(t);
  const cookie = await register('seed');
  const { status, body } = await request('/api/sompo/vehicles', { cookie });
  assert.equal(status, 200);
  assert.deepEqual(body.vehicles.map(({ id, veiculo, placa, modelo, modelo3d, exemplo }) => ({ id, veiculo, placa, modelo, modelo3d, exemplo })), [
    { id: 'caminhao-scania0001', veiculo: 'Caminhão', placa: 'ABC1D23', modelo: 'Scania R450', modelo3d: 'caminhao-sompo', exemplo: true },
    { id: 'trator-0001', veiculo: 'Trator', placa: 'TRT0001', modelo: 'John Deere 6110J', modelo3d: 'trator-max', exemplo: true },
  ]);
});

test('requires a session', async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request('/api/sompo/vehicles')).status, 401);
});

test('create persists per account across restart and rejects duplicate ids case-insensitively', async (t) => {
  const { request, register, restart, directory } = await fixture(t);
  const ana = await register('ana');
  const bia = await register('bia');
  const created = await request('/api/sompo/vehicles', { cookie: ana, body: { id: 'Trator-0002', veiculo: 'Trator', placa: 'TRT0002', modelo: 'Valtra A950' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.vehicle.id, 'trator-0002');
  assert.equal(created.body.vehicle.modelo3d, 'trator-max');
  assert.equal(created.body.vehicle.exemplo, false);

  const duplicate = await request('/api/sompo/vehicles', { cookie: ana, body: { id: 'TRATOR-0002', veiculo: 'Trator', placa: 'X', modelo: 'Y' } });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, 'sompo_vehicle_duplicate_id');
  assert.equal(duplicate.body.field, 'id');
  const seedDuplicate = await request('/api/sompo/vehicles', { cookie: ana, body: { id: 'trator-0001', veiculo: 'Trator', placa: 'X', modelo: 'Y' } });
  assert.equal(seedDuplicate.status, 409);

  await restart();
  const listed = await request('/api/sompo/vehicles', { cookie: ana });
  assert.deepEqual(listed.body.vehicles.map((item) => item.id), ['caminhao-scania0001', 'trator-0001', 'trator-0002']);
  const other = await request('/api/sompo/vehicles', { cookie: bia });
  assert.deepEqual(other.body.vehicles.map((item) => item.id), ['caminhao-scania0001', 'trator-0001']);

  const files = fs.readdirSync(path.join(directory, 'workspaces'));
  assert.equal(files.length, 1);
  const stat = fs.statSync(path.join(directory, 'workspaces', files[0], 'sompo-vehicles.json'));
  assert.equal(stat.mode & 0o777, 0o600);
});

test('rejects empty fields with PT-BR messages naming the field', async (t) => {
  const { request, register } = await fixture(t);
  const cookie = await register('vazio');
  const base = { id: 'caminhao-0002', veiculo: 'Caminhão', placa: 'DEF4G56', modelo: 'Volvo FH' };
  for (const field of ['id', 'veiculo', 'placa', 'modelo']) {
    const result = await request('/api/sompo/vehicles', { cookie, body: { ...base, [field]: '   ' } });
    assert.equal(result.status, 400, field);
    assert.equal(result.body.field, field);
    assert.match(result.body.message, /:/);
  }
  const plate = await request('/api/sompo/vehicles', { cookie, body: { ...base, placa: '' } });
  assert.match(plate.body.message, /identificação interna/);
  const wrongModel = await request('/api/sompo/vehicles', { cookie, body: { ...base, modelo3d: 'trator-max' } });
  assert.equal(wrongModel.status, 400);
  assert.equal(wrongModel.body.field, 'modelo3d');
  const badId = await request('/api/sompo/vehicles', { cookie, body: { ...base, id: 'ab cd' } });
  assert.equal(badId.body.field, 'id');
});

test('edit keeps the id immutable and updates the other fields', async (t) => {
  const { request, register } = await fixture(t);
  const cookie = await register('edita');
  const edited = await request('/api/sompo/vehicles/trator-0001', { cookie, method: 'PUT', body: { placa: 'TRT-9', modelo: 'MAX Trator de mesa' } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.vehicle.placa, 'TRT-9');
  assert.equal(edited.body.vehicle.exemplo, false);
  const renamed = await request('/api/sompo/vehicles/trator-0001', { cookie, method: 'PUT', body: { id: 'trator-9999' } });
  assert.equal(renamed.status, 400);
  assert.equal(renamed.body.error, 'sompo_vehicle_id_immutable');
  const empty = await request('/api/sompo/vehicles/trator-0001', { cookie, method: 'PUT', body: { modelo: '' } });
  assert.equal(empty.status, 400);
  const missing = await request('/api/sompo/vehicles/nao-existe', { cookie, method: 'PUT', body: { modelo: 'x' } });
  assert.equal(missing.status, 404);
  const retype = await request('/api/sompo/vehicles/trator-0001', { cookie, method: 'PUT', body: { veiculo: 'Caminhão' } });
  assert.equal(retype.body.vehicle.modelo3d, 'caminhao-sompo');
  const listed = await request('/api/sompo/vehicles', { cookie });
  assert.equal(listed.body.vehicles.find((item) => item.id === 'trator-0001').modelo, 'MAX Trator de mesa');
});

test('shared validator normalises ids and fills the 3D model from the type', () => {
  const result = validateSompoVehicle({ id: ' TRATOR-0003 ', veiculo: 'Trator', placa: 'TRT0003', modelo: 'x' });
  assert.equal(result.ok, true);
  assert.equal(result.vehicle.id, 'trator-0003');
  assert.equal(result.vehicle.modelo3d, 'trator-max');
});

test('active vehicle: ?veiculo= wins, otherwise the preferred 3D model, unknown id falls back with a note', () => {
  const list = SOMPO_VEHICLE_SEED;
  assert.equal(pickActiveSompoVehicle(list, { requestedId: 'trator-0001' }).vehicle.id, 'trator-0001');
  assert.equal(pickActiveSompoVehicle(list, {}).vehicle.id, 'caminhao-scania0001', 'link antigo continua caminhão');
  assert.equal(pickActiveSompoVehicle(list, { preferModel3d: 'trator-max' }).vehicle.id, 'trator-0001');
  const missing = pickActiveSompoVehicle(list, { requestedId: 'trator-9999' });
  assert.equal(missing.vehicle.id, 'caminhao-scania0001');
  assert.equal(missing.missingId, 'trator-9999');
  assert.deepEqual(pickActiveSompoVehicle([], { requestedId: 'x' }), { vehicle: null, missingId: 'x' });
});
