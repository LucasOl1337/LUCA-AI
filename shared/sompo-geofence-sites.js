export const SOMPO_GEOFENCE_SITE_VERSION = 2;

const justification = 'Distâncias sintéticas de demonstração; não são distâncias de segurança certificadas.';
const closed = (points) => [...points, points[0]];
// Elipse discretizada (lagoa, mancha de declive): sem cantos retos.
const ellipse = (id, role, cx, cz, rx, rz, category, n = 28) => ({
  id, role, ...(category ? { category } : {}), synthetic: true,
  rings: [closed(Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: +(cx + Math.cos(a) * rx).toFixed(2), z: +(cz + Math.sin(a) * rz).toFixed(2) };
  }))],
});
// Faixa em torno de uma linha central (córrego, ribanceira): meia largura em z para curvas suaves em x,
// em x para curvas suaves em z. ponytail: offset por eixo, não perpendicular; basta para meandros suaves.
const band = (id, role, line, half, axis, category) => ({
  id, role, ...(category ? { category } : {}), synthetic: true,
  rings: [closed([
    ...line.map(p => axis === 'z' ? { x: p.x, z: p.z - half } : { x: p.x - half, z: p.z }),
    ...[...line].reverse().map(p => axis === 'z' ? { x: p.x, z: p.z + half } : { x: p.x + half, z: p.z }),
  ])],
});

const WATER_RULE = { role: 'water', label: 'Córrego sintético', synthetic: true, justification, bands_m: [
  { id: 'critica', label: 'Proximidade crítica', max_m: 5 },
  { id: 'elevada', label: 'Proximidade elevada', max_m: 15 },
  { id: 'atencao', label: 'Atenção', max_m: 35 },
] };
const SLOPE_RULE = { role: 'hazard', category: 'slope', label: 'Declive mapeado', synthetic: true, justification, bands_m: [
  { id: 'dentro', label: 'Dentro do declive', max_m: 0 },
  { id: 'borda', label: 'Borda do declive', max_m: 6 },
] };
const GULLY_RULE = { role: 'hazard', category: 'gully', label: 'Ribanceira', synthetic: true, justification, bands_m: [
  { id: 'dentro', label: 'Dentro da ribanceira', max_m: 0 },
  { id: 'borda', label: 'Borda da ribanceira', max_m: 15 },
] };
const MACHINE_RULE = { role: 'machine', metric: 'roll_deg', label: 'Limite de inclinação da máquina', synthetic: true,
  justification: 'Limite declarado no perfil do equipamento (demonstração); faixas em graus de margem até o limite.',
  bands_m: [{ id: 'acima', label: 'No limite ou acima', max_m: 0 }, { id: 'proximo', label: 'Próximo do limite', max_m: 5 }] };

/** Fazenda sintética do cenário "Operação com geofencing" (ambiente geofence-field), em metros da cena
 * (x leste, z sul, origem no meio do percurso). Só esse ambiente tem geofencing; os demais devolvem null,
 * para os cenários originais do simulador continuarem exatamente como estavam. Tudo aqui é inventado e marcado.
 * Desenhada para a colheitadeira (percurso de até ~47 m em z ≈ 0, centrado em x = 0 por desfecho): começa sem
 * perigo no alcance, atravessa a mancha de declive no centro e termina perto da curva do córrego. */
export function getSompoGeofenceSite(environmentId, totalTravelMeters) {
  if (!Number.isFinite(totalTravelMeters)) throw new TypeError('Percurso deve ser finito.');
  if (environmentId !== 'geofence-field') return null;
  const polygons = [
    { id: 'talhao-sintetico', role: 'allowed_area', synthetic: true, rings: [closed([
      { x: -76, z: -70 }, { x: 76, z: -70 }, { x: 90, z: -56 }, { x: 90, z: 56 },
      { x: 76, z: 70 }, { x: -76, z: 70 }, { x: -90, z: 56 }, { x: -90, z: -56 },
    ])] },
    band('corrego-sintetico', 'water', [
      { x: -90, z: 50 }, { x: -40, z: 46 }, { x: -10, z: 44 }, { x: 3, z: 42 }, { x: 12, z: 32 },
      { x: 20, z: 19 }, { x: 24, z: 15 }, { x: 42, z: 28 }, { x: 60, z: 42 }, { x: 90, z: 48 },
    ], 2.5, 'z'),
    ellipse('lagoa-sintetica', 'water', -60, -48, 16, 10),
    ellipse('declive-sintetico', 'hazard', 0, 0, 8, 14, 'slope'),
    band('ribanceira-sintetica', 'hazard', [
      { x: 84, z: -70 }, { x: 80, z: -30 }, { x: 86, z: 10 }, { x: 82, z: 50 }, { x: 84, z: 70 },
    ], 3, 'x', 'gully'),
  ];
  return {
    manifestRules: { hazards: [WATER_RULE, SLOPE_RULE, GULLY_RULE, MACHINE_RULE], synthetic: true },
    polygons, synthetic: true, label: 'Fazenda sintética · Operação com geofencing',
  };
}
