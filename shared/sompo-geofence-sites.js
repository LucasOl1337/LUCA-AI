export const SOMPO_GEOFENCE_SITE_VERSION = 1;

const justification = 'Valores sintéticos de demonstração; distâncias não calibradas em campo.';
const rect = (id, role, x0, x1, z0, z1, category) => ({
  id, role, ...(category ? { category } : {}), synthetic: true,
  rings: [[{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }, { x: x0, z: z0 }]],
});

/** Fazenda sintética de demonstração, no mesmo referencial em metros da máquina (x leste, z sul, origem no meio do percurso).
 * Talhão fixo de 180 × 140 m; só cresce se um percurso for mais longo que isso. Tudo aqui é inventado e marcado. */
export function getSompoGeofenceSite(environmentId, totalTravelMeters) {
  if (!Number.isFinite(totalTravelMeters)) throw new TypeError('Percurso deve ser finito.');
  const hx = Math.max(90, Math.abs(totalTravelMeters) / 2 + 30);
  const polygons = [rect('talhao-sintetico', 'allowed_area', -hx, hx, -70, 70)];
  const hazards = [];
  if (environmentId !== 'farm-barn') {
    // Córrego ao longo da borda sul (z alto) com um braço que sobe até 13 m do percurso, logo depois do meio do talhão.
    polygons.push({ id: 'corrego-sintetico', role: 'water', synthetic: true, rings: [[
      { x: -hx, z: 40 }, { x: 4, z: 40 }, { x: 4, z: 13 }, { x: 18, z: 13 }, { x: 18, z: 40 },
      { x: hx, z: 40 }, { x: hx, z: 46 }, { x: -hx, z: 46 }, { x: -hx, z: 40 },
    ]] });
    hazards.push({ role: 'water', label: 'Água sintética', synthetic: true, justification, bands_m: [
      { id: 'critica', label: 'Proximidade crítica', max_m: 5 },
      { id: 'elevada', label: 'Proximidade elevada', max_m: 15 },
      { id: 'atencao', label: 'Atenção', max_m: 35 },
    ] });
  }
  if (environmentId === 'row-crop-field' || environmentId === 'row-crop-field-night') {
    polygons.push(rect('lagoa-sintetica', 'water', -80, -50, -60, -36)); // canto noroeste
  }
  if (environmentId === 'muddy-field') {
    polygons.push(rect('alagado-sintetico', 'water', -10, 10, -23, -13));
  }
  if (environmentId === 'sloped-field') {
    // Mancha de declive que o percurso cruza a partir de x = 0: coincide com a subida do roll entre 4 e 10 s.
    polygons.push(rect('declive-sintetico', 'hazard', 0, 40, -22, 24, 'slope'));
    hazards.push({ role: 'hazard', category: 'slope', label: 'Declive sintético', synthetic: true, justification, bands_m: [
      { id: 'dentro', label: 'Dentro do declive', max_m: 0 },
      { id: 'borda', label: 'Borda do declive', max_m: 10 },
    ] });
  }
  if (['row-crop-field', 'row-crop-field-night', 'sloped-field'].includes(environmentId)) {
    polygons.push(rect('ribanceira-sintetica', 'hazard', hx - 10, hx, -70, 70, 'gully')); // borda leste inteira
    hazards.push({ role: 'hazard', category: 'gully', label: 'Ribanceira', synthetic: true, justification, bands_m: [
      { id: 'dentro', label: 'Dentro da ribanceira', max_m: 0 },
      { id: 'borda', label: 'Borda da ribanceira', max_m: 15 },
    ] });
  }
  // Perigo de máquina, por último: sem geometria; o limite vem de machine.profile.max_roll_deg em quem avalia (resolveHazards).
  hazards.push({ role: 'machine', metric: 'roll_deg', label: 'Limite de inclinação da máquina', synthetic: true,
    justification: 'Limite declarado no perfil do equipamento (demonstração); faixas em graus de margem até o limite.',
    bands_m: [{ id: 'acima', label: 'Acima do limite', max_m: 0 }, { id: 'proximo', label: 'Próximo do limite', max_m: 5 }] });
  return { manifestRules: { hazards, synthetic: true }, polygons, synthetic: true, label: 'Fazenda sintética · talhão de demonstração' };
}
