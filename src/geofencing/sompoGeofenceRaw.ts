/**
 * Campos que o geofencing acrescenta à amostra crua enviada ao histórico (módulo src/geofencing):
 * posição de cena, rumo e a faixa lida pelo radar no instante. Objeto vazio quando o snapshot não passou
 * pelo geofencing, então a amostra dos demais cenários segue idêntica.
 */
import type { SompoTelemetrySnapshot } from '@/lib/types';
import type { SompoAgriMaybeGeofenceSnapshot } from '../../shared/geofencing/index.js';

export function sompoGeofenceRawFields(snapshot: SompoTelemetrySnapshot): Record<string, unknown> {
  const { position, geofence } = snapshot as SompoAgriMaybeGeofenceSnapshot;
  if (!position || !geofence) return {};
  return {
    posX: position.x,
    posZ: position.z,
    headingDeg: position.headingDeg,
    geofenceBand: geofence.nearest?.bandId ?? null,
    geofenceHazard: geofence.nearest?.hazardKey ?? null,
    geofenceDistanceM: geofence.nearest?.distanceM ?? null,
    machineBand: geofence.machine?.bandId ?? null,
  };
}
