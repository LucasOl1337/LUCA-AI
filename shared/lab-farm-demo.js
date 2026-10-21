import { LAB_COLUMNS, associateLabSite, parseLabCase } from './lab-telemetry.js';

// Illustrative route only; never inferred from ESP32 readings or an operational boundary.
// Cada área conhecida tem um percurso escrito à mão. Fairfax (pacote local, redistribuição restrita)
// e Piracicaba · Artemis (limites fictícios + rio OSM/ODbL, publicado): o release público só tem esta.
export const FARM_DEMO_ROUTES = {
  'frying-pan-farm-fairfax-v1': { center: [-77.4077, 38.93645], eastM: 32, northM: 85, provenance: 'Percurso e atitudes sintéticos para demonstrar a navegação; não representam uma operação ocorrida.' },
  'piracicaba-artemis-demo-v1': { center: [-47.80385, -22.66812], eastM: 200, northM: 80, provenance: 'DEMONSTRAÇÃO: percurso e atitudes sintéticos dentro da área permitida fictícia da Artemis; não representam uma operação, fazenda ou máquina reais.' },
};

export function createFarmDemo(site) {
  const route = FARM_DEMO_ROUTES[site.manifest?.site?.id];
  if (!route) throw new Error('A demonstração é específica da fazenda de exemplo.');
  const duration = 90, count = duration * 10;
  const { center, eastM, northM } = route;
  const metersPerDegree = Math.PI / 180 * 6378137;
  const rows = [LAB_COLUMNS.join(',')];
  for (let i = 0; i <= count; i++) {
    const angle = i / count * Math.PI * 2;
    const dx = -eastM * Math.sin(angle), dz = northM * Math.cos(angle);
    const values = {
      timestamp: new Date(Date.UTC(2026, 8, 11) + i * 100).toISOString(),
      machine_id: 'CAMINHAO-DEMO', synthetic: true, gnss_fix: '3d',
      longitude_deg: center[0] + eastM * Math.cos(angle) / (metersPerDegree * Math.cos(center[1] * Math.PI / 180)),
      latitude_deg: center[1] - northM * Math.sin(angle) / metersPerDegree,
      heading_deg: (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360,
      ground_speed_kmh: Math.hypot(dx, dz) * 2 * Math.PI / duration * 3.6,
      pitch_deg: 0, roll_deg: 0,
    };
    rows.push(LAB_COLUMNS.map(key => values[key] ?? '').join(','));
  }
  const associated = associateLabSite({ version: '1.0', synthetic: true, demo: 'farm-truck-v1', machine: { id: 'CAMINHAO-DEMO', model: 'Caminhão SOMPO' }, provenance: route.provenance }, site);
  return parseLabCase(rows.join('\n'), { ...associated, fileName: 'Caminhão na fazenda.csv' });
}
