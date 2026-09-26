import { sompoGeofenceRawFields } from './geofencing/index.js';

// The browser and CLI submit the same firmware-shaped simulation payload.
export function snapshotToSimulationRaw(snapshot) {
  const readings = snapshot.readings;
  return {
    ...sompoGeofenceRawFields(snapshot),
    trator: snapshot.tractorId,
    timestamp: snapshot.deviceTimestamp,
    distancia: readings.distance,
    temperatura: readings.temperature,
    umidade: readings.humidity,
    pitch: readings.pitch,
    roll: readings.roll,
    aceleracaoX: readings.acceleration?.x,
    aceleracaoY: readings.acceleration?.y,
    aceleracaoZ: readings.acceleration?.z,
    rotacaoX: readings.rotation?.x,
    rotacaoY: readings.rotation?.y,
    rotacaoZ: readings.rotation?.z,
    velocidade: readings.speedKph,
    velocidadeRoda: readings.wheelSpeedKph,
    riscoColisao: snapshot.risks.collision,
    riscoInclinacao: snapshot.risks.inclination,
    scenarioLabel: snapshot.source.scenarioLabel,
    observedAt: snapshot.observedAt,
  };
}
