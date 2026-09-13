export const SOMPO_GEOFENCE_SITE_VERSION = 3;

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

// Relevo sintético da fazenda (metros), marcado como simulado: morro sob a mancha de declive (o "declive mapeado"
// é o morro, não um desenho), lagoa e córrego em depressão, ribanceira como degrau na borda leste.
// ponytail: formas analíticas; um heightfield real (MDE) entra pelo mesmo contrato quando houver fazenda de verdade.
const STREAM_LINE = [
  { x: -90, z: 50 }, { x: -40, z: 46 }, { x: -10, z: 44 }, { x: 3, z: 42 }, { x: 12, z: 32 },
  { x: 20, z: 19 }, { x: 24, z: 15 }, { x: 42, z: 28 }, { x: 60, z: 42 }, { x: 90, z: 48 },
];
const RAVINE_LINE = [{ x: 84, z: -70 }, { x: 80, z: -30 }, { x: 86, z: 10 }, { x: 82, z: 50 }, { x: 84, z: 70 }];
function distanceToLine(x, z, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz;
    const t = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len)) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)));
  }
  return best;
}
export function geofenceFieldRelief(x, z) {
  const hill = 3.4 * Math.exp(-(((x / 8) ** 2) + ((z / 14) ** 2)) * 1.1);            // crista ≈ 3,4 m, encosta até ~22°
  const pond = -1.2 * Math.exp(-((((x + 60) / 16) ** 2) + (((z + 48) / 10) ** 2)) * 1.4);
  const stream = -0.9 * Math.max(0, 1 - distanceToLine(x, z, STREAM_LINE) / 4.5);
  const ravineSide = x - (RAVINE_LINE[Math.min(RAVINE_LINE.length - 1, Math.max(0, Math.round((z + 70) / 35)))].x - 3);
  const ravine = ravineSide > 0 ? -Math.min(6, ravineSide * 0.9) : 0;                  // degrau para leste da crista da ribanceira
  return hill + pond + stream + ravine;
}

const WATER_RULE = { role: 'water', label: 'Córrego sintético', synthetic: true, justification, bands_m: [
  { id: 'critica', label: 'Proximidade crítica', max_m: 5 },
  { id: 'elevada', label: 'Proximidade elevada', max_m: 15 },
  { id: 'atencao', label: 'Atenção', max_m: 35 },
] };
// Declive é contexto, não alerta: terreno irregular é a condição normal da lavoura. O alerta vem do limite de inclinação
// da própria máquina (MACHINE_RULE); a mesma encosta alerta uma colheitadeira de 15° e não um trator de 25°.
const SLOPE_RULE = { role: 'hazard', category: 'slope', label: 'Declive mapeado', synthetic: true, alertable: false,
  justification: `${justification} O declive por si não acende alerta: o alerta vem do limite de inclinação da máquina.`, bands_m: [
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

const OPERACAO_STREAM_LINE = [
  { x: -84, z: 51 }, { x: -55, z: 59 }, { x: -20, z: 60 }, { x: 10, z: 52 },
  { x: 30, z: 43 }, { x: 50, z: 53 }, { x: 70, z: 59 }, { x: 84, z: 51 },
];
const OPERACAO_GULLY_LINE = [
  { x: 87, z: -62 }, { x: 85, z: -35 }, { x: 88, z: 0 }, { x: 85, z: 35 }, { x: 87, z: 62 },
];
// Relevo sintético de demonstração: morro de 4 m e degrau de 6 m na borda leste.
export function geofenceOperacaoRelief(x, z) {
  const hill = 4 * Math.exp(-(((x + 45) / 18) ** 2 + ((z + 20) / 10) ** 2));
  const stream = -0.9 * Math.max(0, 1 - distanceToLine(x, z, OPERACAO_STREAM_LINE) / 4.5);
  const index = Math.max(1, OPERACAO_GULLY_LINE.findIndex(p => p.z >= z));
  const a = OPERACAO_GULLY_LINE[z > 62 ? 3 : index - 1];
  const b = OPERACAO_GULLY_LINE[z > 62 ? 4 : index];
  const edge = a.x + (b.x - a.x) * Math.max(0, Math.min(1, (z - a.z) / (b.z - a.z))) - 3;
  return hill + stream - Math.min(6, Math.max(0, x - edge));
}

/** Fazendas sintéticas em metros da cena.
 * (x leste, z sul, origem no meio do percurso). geofence-field e geofence-operacao têm talhão; os demais devolvem null,
 * para os cenários originais do simulador continuarem exatamente como estavam. Tudo aqui é inventado e marcado.
 * Desenhada para a colheitadeira (percurso de até ~47 m em z ≈ 0, centrado em x = 0 por desfecho): começa sem
 * perigo no alcance, atravessa a mancha de declive no centro e termina perto da curva do córrego. */
export function getSompoGeofenceSite(environmentId, totalTravelMeters) {
  if (!Number.isFinite(totalTravelMeters)) throw new TypeError('Percurso deve ser finito.');
  if (environmentId === 'geofence-operacao') return {
    synthetic: true, label: 'Talhão 2 sintético · Operação real · demonstração',
    manifestRules: { synthetic: true, hazards: [WATER_RULE, SLOPE_RULE, GULLY_RULE, {
      role: 'hazard', category: 'structure', label: 'Galpão', synthetic: true, justification,
      bands_m: [{ id: 'dentro', label: 'Dentro do galpão', max_m: 0 }, { id: 'manobra', label: 'Manobra', max_m: 10 }],
    }, MACHINE_RULE] },
    polygons: [
      { id: 'talhao-operacao', role: 'allowed_area', synthetic: true, rings: [closed([
        { x: -76, z: -70 }, { x: 76, z: -70 }, { x: 90, z: -56 }, { x: 90, z: 56 },
        { x: 76, z: 70 }, { x: -76, z: 70 }, { x: -90, z: 56 }, { x: -90, z: -56 },
      ])] },
      band('corrego-operacao', 'water', OPERACAO_STREAM_LINE, 2.5, 'z'),
      ellipse('declive-operacao', 'hazard', -45, -20, 25, 15, 'slope'),
      band('ribanceira-operacao', 'hazard', OPERACAO_GULLY_LINE, 3, 'x', 'gully'),
      { id: 'galpao-operacao', role: 'hazard', category: 'structure', synthetic: true, rings: [closed([
        { x: 53, z: -59 }, { x: 67, z: -59 }, { x: 67, z: -51 }, { x: 53, z: -51 },
      ])] },
    ],
  };
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
