export type SompoVehicleType = 'Caminhão' | 'Trator';
export type SompoVehicleModel3dId = 'caminhao-sompo' | 'trator-max';

export interface SompoVehicle {
  id: string;
  veiculo: SompoVehicleType;
  placa: string;
  modelo: string;
  modelo3d: SompoVehicleModel3dId;
  exemplo?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SompoVehicleModel3d {
  readonly id: SompoVehicleModel3dId;
  readonly label: string;
  readonly vehicleType: SompoVehicleType;
}

export const SOMPO_VEHICLE_TYPES: readonly SompoVehicleType[];
export const SOMPO_VEHICLE_MODELS_3D: Readonly<Record<SompoVehicleModel3dId, SompoVehicleModel3d>>;
export const SOMPO_VEHICLE_ID_PATTERN: RegExp;
export const SOMPO_VEHICLE_PLATE_MAX: number;
export const SOMPO_VEHICLE_MODEL_MAX: number;
export const SOMPO_VEHICLE_SEED: readonly Readonly<SompoVehicle>[];
export function defaultModel3dFor(veiculo: string): SompoVehicleModel3dId;
export function validateSompoVehicle(input: unknown, options?: { partial?: boolean }):
  | { ok: true; vehicle: Partial<SompoVehicle> }
  | { ok: false; field: string; message: string };
export function checkSompoVehicleModel(vehicle: Pick<SompoVehicle, 'veiculo' | 'modelo3d'>):
  | { ok: true }
  | { ok: false; field: string; message: string };
