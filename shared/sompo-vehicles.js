// Cadastro de veículos do SOMPO: contrato compartilhado entre servidor e painel.
// Termos no GLOSSARY.md: Veículo, Tipo, Modelo 3D, Dispositivo e Case.

export const SOMPO_VEHICLE_TYPES = Object.freeze(['Caminhão', 'Trator']);

export const SOMPO_VEHICLE_MODELS_3D = Object.freeze({
  'caminhao-sompo': Object.freeze({ id: 'caminhao-sompo', label: 'Caminhão SOMPO (atual)', vehicleType: 'Caminhão' }),
  'trator-max': Object.freeze({ id: 'trator-max', label: 'Trator MAX (fotos do brinquedo)', vehicleType: 'Trator' }),
});

export const SOMPO_VEHICLE_ID_PATTERN = /^[a-z0-9-]{3,60}$/;
export const SOMPO_VEHICLE_PLATE_MAX = 16;
export const SOMPO_VEHICLE_MODEL_MAX = 80;

export const SOMPO_VEHICLE_SEED = Object.freeze([
  Object.freeze({ id: 'caminhao-scania0001', veiculo: 'Caminhão', placa: 'ABC1D23', modelo: 'Scania R450', modelo3d: 'caminhao-sompo', exemplo: true }),
  Object.freeze({ id: 'trator-0001', veiculo: 'Trator', placa: 'TRT0001', modelo: 'John Deere 6110J', modelo3d: 'trator-max', exemplo: true }),
]);

export const defaultModel3dFor = (veiculo) => (veiculo === 'Trator' ? 'trator-max' : 'caminhao-sompo');

/**
 * Valida um veículo vindo do formulário ou da API.
 * Devolve { ok: true, vehicle } ou { ok: false, field, message } com mensagem em PT-BR.
 */
export function validateSompoVehicle(input, { partial = false } = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const vehicle = {};
  const fail = (field, message) => ({ ok: false, field, message });
  const textOf = (value) => (typeof value === 'string' ? value.trim() : '');

  if (!partial || 'id' in source) {
    const id = textOf(source.id).toLowerCase();
    if (!id) return fail('id', 'ID: preencha o identificador do veículo.');
    if (!SOMPO_VEHICLE_ID_PATTERN.test(id)) return fail('id', 'ID: use de 3 a 60 caracteres entre letras minúsculas, números e hífen (ex. trator-0002).');
    vehicle.id = id;
  }
  if (!partial || 'veiculo' in source) {
    const veiculo = textOf(source.veiculo);
    if (!veiculo) return fail('veiculo', 'Veículo: escolha Caminhão ou Trator.');
    if (!SOMPO_VEHICLE_TYPES.includes(veiculo)) return fail('veiculo', 'Veículo: o tipo precisa ser Caminhão ou Trator.');
    vehicle.veiculo = veiculo;
  }
  if (!partial || 'placa' in source) {
    const placa = textOf(source.placa);
    if (!placa) return fail('placa', 'Placa: preencha a placa ou, para máquina agrícola, a identificação interna (ex. TRT0001).');
    if (placa.length > SOMPO_VEHICLE_PLATE_MAX) return fail('placa', `Placa: use até ${SOMPO_VEHICLE_PLATE_MAX} caracteres (placa ou identificação interna, ex. TRT0001).`);
    vehicle.placa = placa;
  }
  if (!partial || 'modelo' in source) {
    const modelo = textOf(source.modelo);
    if (!modelo) return fail('modelo', 'Modelo (cadastro): preencha o modelo do veículo (ex. John Deere 6110J).');
    if (modelo.length > SOMPO_VEHICLE_MODEL_MAX) return fail('modelo', `Modelo (cadastro): use até ${SOMPO_VEHICLE_MODEL_MAX} caracteres.`);
    vehicle.modelo = modelo;
  }
  if (!partial || 'modelo3d' in source) {
    const fallback = vehicle.veiculo ? defaultModel3dFor(vehicle.veiculo) : '';
    const modelo3d = textOf(source.modelo3d) || fallback;
    if (!modelo3d) return fail('modelo3d', 'Modelo 3D: escolha o modelo usado no simulador.');
    if (!Object.hasOwn(SOMPO_VEHICLE_MODELS_3D, modelo3d)) return fail('modelo3d', 'Modelo 3D: escolha caminhao-sompo ou trator-max.');
    vehicle.modelo3d = modelo3d;
  }
  return { ok: true, vehicle };
}

/** O modelo 3D precisa casar com o tipo: caminhão usa o caminhão, trator usa o MAX. */
export function checkSompoVehicleModel(vehicle) {
  const model = SOMPO_VEHICLE_MODELS_3D[vehicle.modelo3d];
  if (model && model.vehicleType !== vehicle.veiculo) {
    return { ok: false, field: 'modelo3d', message: `Modelo 3D: ${model.label} não serve para ${vehicle.veiculo}.` };
  }
  return { ok: true };
}

/**
 * Veículo em uso no simulador. O `?veiculo=` vence; sem ele (ou com um ID que
 * não está no cadastro) vale o primeiro veículo do modelo 3D preferido, que a
 * página tira do cenário pedido. Assim um link antigo de caminhão continua caminhão.
 */
export function pickActiveSompoVehicle(vehicles, { requestedId = '', preferModel3d = 'caminhao-sompo' } = {}) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const requested = list.find((vehicle) => vehicle.id === requestedId);
  if (requested) return { vehicle: requested, missingId: '' };
  const fallback = list.find((vehicle) => vehicle.modelo3d === preferModel3d) || list[0] || null;
  return { vehicle: fallback, missingId: requestedId && !requested ? requestedId : '' };
}
