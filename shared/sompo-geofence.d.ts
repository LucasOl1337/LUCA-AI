import type { LabGeofenceRules } from './lab-geofence.js';
import type { LabPolygon, LabPoint } from './lab-telemetry.js';

export interface SompoGeofenceHit {
  hazardKey: string;
  hazardLabel: string;
  bandId: string;
  bandLabel: string;
  bandMaxM: number;
  innermost: boolean;             // faixa mais interna do perigo (crítica na água, dentro no declive/ribanceira)
  alertable: boolean;             // regra do perigo; false = contexto territorial, não acende alerta sozinho
  distanceM: number;
  bearingDeg: number | null;      // 0 = à frente, +90 = à direita, -90 = à esquerda, ±180 = atrás; null sem rumo ou dentro do perigo
  timeToHazardS: number | null;   // só com o perigo à frente (±20°) e aproximando; senão null
  closingSpeedMs: number | null;  // velocidade geométrica de fechamento em m/s
  trend: 'aproximando' | 'afastando' | 'estavel' | null; // tendência da distância (|fechamento| < 0,10 m/s = estável)
  nextBandLabel: string | null;   // faixa imediatamente mais interna que a atual; null na mais interna
  timeToNextBandS: number | null;  // segundos até a faixa mais interna seguinte
  timeToHazardEdgeS: number | null; // segundos até a borda do polígono
  closestPoint: LabPoint;
}
export interface SompoMachineHit {
  hazardKey: string;
  hazardLabel: string;
  bandId: string;
  bandLabel: string;
  bandMaxDeg: number;
  metric: 'roll_deg' | 'pitch_deg';
  valueDeg: number;               // inclinação medida, em módulo
  limitDeg: number;               // limite do perfil da máquina
  marginDeg: number;              // 0 = no limite ou acima
}
export interface SompoGeofenceResult {
  insideAllowed: boolean | null;
  nearest: SompoGeofenceHit | null;
  alert: SompoGeofenceHit | null;   // perigo alertável na faixa mais interna (acende a bandeira); pode não ser o mais próximo
  all: SompoGeofenceHit[];
  machine: SompoMachineHit | null;
  warnings: string[];
}

export function closestPointOnPolygon(point: LabPoint, polygon: LabPolygon): LabPoint & { distance: number };
export function forwardVector(headingDeg: number): LabPoint;
export function evaluateGeofence(state: { x: number; z: number; headingDeg?: number | null; speedKph?: number; rollDeg?: number | null; pitchDeg?: number | null; previous?: { x: number; z: number; elapsedMs: number }; elapsedMs?: number }, rules: LabGeofenceRules, polygons: LabPolygon[], machine?: { profile?: Record<string, number | boolean> } | null): SompoGeofenceResult;
export function describeGeofence(result: SompoGeofenceResult | null | undefined): string;
export function describeMachineLimit(hit: SompoMachineHit | null | undefined): string;
