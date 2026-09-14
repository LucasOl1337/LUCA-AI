/**
 * Duas linhas do HUD do simulador agrícola (módulo src/geofencing): o radar ("Radar: Borda do declive · ...")
 * e o limite da máquina. Só renderiza quando o snapshot passou pelo geofencing (tem `geofence`), ou seja,
 * nos cenários com talhão; nos demais devolve null e o HUD fica como era.
 */
import { describeGeofence, describeMachineLimit, type SompoGeofenceResult } from '../../shared/geofencing/index.js';
import { bandTone } from './SompoGeofencePanel';
import './geofencing.css';

export default function SompoGeofenceReadout({ geofence, proximity }: { geofence: SompoGeofenceResult | null | undefined; proximity: boolean }) {
  if (!geofence) return null;
  const near = geofence.alert ?? geofence.nearest;
  return (
    <>
      <div data-geofence data-alert={proximity} className={near ? `sompo-geofence-${bandTone(near.bandId, near.alertable)}` : undefined}>
        <span>Fazenda sintética · demonstração</span>
        <strong>{!geofence.nearest && geofence.insideAllowed
          ? 'Radar: sem perigo mapeado no alcance'
          : `Radar: ${describeGeofence(geofence)}`}</strong>
      </div>
      {geofence.machine && (
        <div data-geofence-machine data-alert className={`sompo-geofence-${geofence.machine.bandId === 'acima' ? 'forte' : 'media'}`}>
          <span>Limite da máquina · perfil de demonstração</span>
          <strong>{describeMachineLimit(geofence.machine)}</strong>
        </div>
      )}
    </>
  );
}
