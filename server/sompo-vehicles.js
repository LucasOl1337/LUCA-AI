import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { requireWorkspaceUserId, runWithWorkspaceUser } from './workspace-context.js';
import { SOMPO_VEHICLE_SEED, checkSompoVehicleModel, defaultModel3dFor, validateSompoVehicle } from '../shared/sompo-vehicles.js';

// Cadastro de veículos do SOMPO, por conta. Mesmo padrão de lab-cases.js:
// arquivo JSON no workspace do usuário, escrita atômica, erros com código e mensagem em PT-BR.
const digest = (value) => createHash('sha256').update(value).digest('hex');
const MAX_VEHICLES = 200;

class VehicleError extends Error {
  constructor(message, status = 400, code = 'sompo_vehicle_invalid', field) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const seedRecords = () => SOMPO_VEHICLE_SEED.map((vehicle) => ({ ...vehicle, createdAt: null, updatedAt: null }));

export function registerSompoVehicleRoutes(app, { dataDir = process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca') } = {}) {
  const root = path.resolve(dataDir, 'workspaces');
  const file = () => path.join(root, digest(requireWorkspaceUserId()).slice(0, 32), 'sompo-vehicles.json');
  const read = () => {
    try {
      const stored = JSON.parse(fs.readFileSync(file(), 'utf8'));
      return Array.isArray(stored?.vehicles) ? stored.vehicles : seedRecords();
    } catch (error) {
      if (error.code === 'ENOENT') return seedRecords();
      throw error;
    }
  };
  const save = (vehicles) => {
    const target = file();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, vehicles }), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, target);
  };
  const validate = (input, options) => {
    const result = validateSompoVehicle(input, options);
    if (!result.ok) throw new VehicleError(result.message, 400, 'sompo_vehicle_invalid', result.field);
    return result.vehicle;
  };
  const checkModel = (vehicle) => {
    const result = checkSompoVehicleModel(vehicle);
    if (!result.ok) throw new VehicleError(result.message, 400, 'sompo_vehicle_invalid', result.field);
  };
  const route = (handler) => async (req, res) => {
    if (!req.auth?.user?.id || req.auth.user.id === 'system') {
      res.status(401).json({ ok: false, error: 'authentication_required' });
      return;
    }
    await runWithWorkspaceUser(req.auth.user.id, async () => {
      try { await handler(req, res); }
      catch (error) {
        const known = error instanceof VehicleError;
        if (!known) console.error('[sompo-vehicles]', error.message);
        res.status(known ? error.status : 500).json({
          ok: false,
          error: known ? error.code : 'sompo_vehicle_storage_error',
          ...(known && error.field ? { field: error.field } : {}),
          message: known ? error.message : 'Não foi possível salvar ou ler o cadastro de veículos. Tente novamente.',
        });
      }
    });
  };

  app.get('/api/sompo/vehicles', route((_req, res) => {
    res.json({ ok: true, vehicles: read() });
  }));

  app.post('/api/sompo/vehicles', route((req, res) => {
    const vehicle = validate(req.body || {});
    checkModel(vehicle);
    const vehicles = read();
    if (vehicles.some((item) => item.id.toLowerCase() === vehicle.id)) {
      throw new VehicleError(`ID: já existe um veículo com o ID ${vehicle.id}. Escolha outro.`, 409, 'sompo_vehicle_duplicate_id', 'id');
    }
    if (vehicles.length >= MAX_VEHICLES) throw new VehicleError(`Limite de ${MAX_VEHICLES} veículos por conta.`, 400, 'sompo_vehicle_limit');
    const now = new Date().toISOString();
    const record = { ...vehicle, exemplo: false, createdAt: now, updatedAt: now };
    save([...vehicles, record]);
    res.status(201).json({ ok: true, vehicle: record });
  }));

  app.put('/api/sompo/vehicles/:id', route((req, res) => {
    const id = String(req.params.id || '').toLowerCase();
    const vehicles = read();
    const index = vehicles.findIndex((item) => item.id.toLowerCase() === id);
    if (index < 0) throw new VehicleError('Veículo não encontrado.', 404, 'sompo_vehicle_not_found');
    const body = req.body || {};
    if (body.id != null && String(body.id).trim().toLowerCase() !== id) {
      throw new VehicleError('ID: o identificador não muda depois do cadastro.', 400, 'sompo_vehicle_id_immutable', 'id');
    }
    const { id: _ignored, ...changes } = body;
    const patch = validate(changes, { partial: true });
    if (patch.veiculo && !('modelo3d' in changes) && patch.veiculo !== vehicles[index].veiculo) patch.modelo3d = defaultModel3dFor(patch.veiculo);
    const record = { ...vehicles[index], ...patch, exemplo: false, updatedAt: new Date().toISOString() };
    checkModel(record);
    const next = vehicles.slice();
    next[index] = record;
    save(next);
    res.json({ ok: true, vehicle: record });
  }));
}
