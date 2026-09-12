export const SOMPO_GEOFENCE_SITE_VERSION = 1;

const justification = 'Valores de demonstração; não são distâncias de segurança calibradas.';
const rect = (id, role, x0, x1, z0, z1, category) => ({
  id, role, ...(category ? { category } : {}), synthetic: true,
  rings: [[{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }, { x: x0, z: z0 }]],
});

/** Talhão de demonstração, no mesmo referencial em metros da máquina. */
export function getSompoGeofenceSite(environmentId, totalTravelMeters) {
  if (!Number.isFinite(totalTravelMeters)) throw new TypeError('Percurso deve ser finito.');
  const half = Math.abs(totalTravelMeters) / 2;
  const polygons = [rect('talhao-sintetico', 'allowed_area', -half - 30, half + 30, -25, 25)];
  const hazards = [];
  if (environmentId !== 'farm-barn') {
    polygons.push(rect('corrego-sintetico', 'water', -half * 0.3, half * 0.5, 13, 17));
    hazards.push({ role: 'water', label: 'Córrego sintético', synthetic: true, justification, bands_m: [
      { id: 'critica', label: 'Proximidade crítica', max_m: 5 },
      { id: 'elevada', label: 'Proximidade elevada', max_m: 15 },
      { id: 'atencao', label: 'Atenção', max_m: 35 },
    ] });
  }
  if (environmentId === 'sloped-field') {
    // A metade final do percurso coincide com a subida do roll entre 4 e 10 s.
    polygons.push(rect('declive-sintetico', 'hazard', 0, half + 2, -6, 8, 'slope'));
    hazards.push({ role: 'hazard', category: 'slope', label: 'Declive sintético', synthetic: true, justification, bands_m: [
      { id: 'dentro', label: 'Dentro do declive', max_m: 0 },
      { id: 'borda', label: 'Borda do declive', max_m: 10 },
    ] });
  }
  return { manifestRules: { hazards, synthetic: true }, polygons, synthetic: true, label: 'Talhão sintético de demonstração' };
}
