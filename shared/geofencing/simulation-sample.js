/** Optional scene/radar fields on a simulated telemetry sample. */
export function sompoGeofenceRawFields({ position, geofence }) {
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
