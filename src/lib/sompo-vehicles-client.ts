import type { SompoVehicle } from '../../shared/sompo-vehicles.js';

export type { SompoVehicle };

export class SompoVehicleRequestError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

async function vehicleRequest<T>(path: string, method: 'GET' | 'POST' | 'PUT', body?: unknown): Promise<T> {
  const response = await fetch(`/api/sompo/vehicles${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SompoVehicleRequestError(
      payload.message || (response.status === 401 ? 'Entre novamente para ver os veículos da sua conta.' : 'Não foi possível acessar o cadastro de veículos. Tente novamente.'),
      payload.field,
    );
  }
  return payload as T;
}

export async function listSompoVehicles() {
  return (await vehicleRequest<{ vehicles: SompoVehicle[] }>('', 'GET')).vehicles;
}

export async function createSompoVehicle(vehicle: Omit<SompoVehicle, 'exemplo' | 'createdAt' | 'updatedAt'>) {
  return (await vehicleRequest<{ vehicle: SompoVehicle }>('', 'POST', vehicle)).vehicle;
}

export async function updateSompoVehicle(id: string, changes: Partial<Omit<SompoVehicle, 'id' | 'exemplo' | 'createdAt' | 'updatedAt'>>) {
  return (await vehicleRequest<{ vehicle: SompoVehicle }>(`/${encodeURIComponent(id)}`, 'PUT', changes)).vehicle;
}
