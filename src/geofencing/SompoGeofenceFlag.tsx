/**
 * Card "Proximidade · geofencing" do painel de telemetria (módulo src/geofencing). Renderiza só quando o
 * snapshot traz `risks.proximity`, o que acontece apenas nos cenários com talhão; nos demais devolve null.
 */
import { Radar } from 'lucide-react';
import type { SompoTelemetrySnapshot } from '@/lib/types';
import { describeGeofence, describeMachineLimit, type SompoGeofenceResult } from '../../shared/geofencing/index.js';

type MaybeGeofenced = SompoTelemetrySnapshot & { geofence?: SompoGeofenceResult | null; risks: SompoTelemetrySnapshot['risks'] & { proximity?: boolean | null } };

export default function SompoGeofenceFlag({ telemetry, historical, riskValue }: {
  telemetry: SompoTelemetrySnapshot;
  historical: boolean;
  riskValue: (value: boolean | null, inactiveLabel: string, historical: boolean) => string;
}) {
  const snapshot = telemetry as MaybeGeofenced;
  if (snapshot.risks.proximity === undefined) return null;
  // A bandeira acende na faixa mais interna de um perigo alertável ou no limite da máquina.
  const geofence = snapshot.geofence ?? null;
  const detail = geofence?.machine?.bandId === 'acima' ? describeMachineLimit(geofence.machine) : geofence?.nearest ? describeGeofence(geofence) : null;
  return (
    <article data-active={!!snapshot.risks.proximity} data-unknown={historical} data-geofence-flag>
      <Radar />
      <div>
        <span>Proximidade · geofencing</span>
        <strong>{snapshot.risks.proximity && detail ? detail : riskValue(snapshot.risks.proximity ?? null, geofence ? 'Fora da faixa crítica' : 'Sem talhão mapeado', historical)}</strong>
      </div>
    </article>
  );
}
