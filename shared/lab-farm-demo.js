import { LAB_COLUMNS, associateLabSite, parseLabCase } from './lab-telemetry.js';

// Illustrative route only; never inferred from ESP32 readings or an operational boundary.
export function createFarmDemo(site) {
  if (site.manifest?.site?.id !== 'frying-pan-farm-fairfax-v1') throw new Error('A demonstração é específica da fazenda de exemplo.');
  const duration = 90, count = duration * 10;
  const center = [-77.4077, 38.93645];
  const metersPerDegree = Math.PI / 180 * 6378137;
  const rows = [LAB_COLUMNS.join(',')];
  for (let i = 0; i <= count; i++) {
    const angle = i / count * Math.PI * 2;
    const dx = -32 * Math.sin(angle), dz = 85 * Math.cos(angle);
    const values = {
      timestamp: new Date(Date.UTC(2026, 8, 11) + i * 100).toISOString(),
      machine_id: 'CAMINHAO-DEMO', synthetic: true, gnss_fix: '3d',
      longitude_deg: center[0] + 32 * Math.cos(angle) / (metersPerDegree * Math.cos(center[1] * Math.PI / 180)),
      latitude_deg: center[1] - 85 * Math.sin(angle) / metersPerDegree,
      heading_deg: (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360,
      ground_speed_kmh: Math.hypot(dx, dz) * 2 * Math.PI / duration * 3.6,
      pitch_deg: 0, roll_deg: 0,
    };
    rows.push(LAB_COLUMNS.map(key => values[key] ?? '').join(','));
  }
  const associated = associateLabSite({ version: '1.0', synthetic: true, demo: 'farm-truck-v1', machine: { id: 'CAMINHAO-DEMO', model: 'Caminhão SOMPO' }, provenance: 'Percurso e atitudes sintéticos para demonstrar a navegação; não representam uma operação ocorrida.' }, site);
  return parseLabCase(rows.join('\n'), { ...associated, fileName: 'Caminhão na fazenda.csv' });
}
