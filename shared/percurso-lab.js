// Registro do percurso guiado do totem no formato do Laboratório (shared/lab-telemetry.js).
// Só sai o que o simulador calcula de verdade: posição, velocidade, rumo, atitude,
// distância frontal, freio e os avisos. Motor, temperatura e carga ficam como
// colunas ausentes: o jogo não mede isso e o Laboratório mostra "indisponível".
// Sempre synthetic=true; a área é fictícia (talhão do simulador, sem lugar real).

/** Origem fictícia do talhão do simulador. Nenhuma propriedade real: só ancora metros em WGS84. */
export const PERCURSO_ORIGEM = Object.freeze([-47.0, -22.0]);
export const PERCURSO_MAQUINA = 'trator-simulador';
export const PERCURSO_HZ = 5;
/** Caminhão da serra (Pista): mesmo CSV, outro machine_id, rpm e carga do motor preenchidos. */
export const PERCURSO_CAMINHAO = 'caminhao-simulador';

const EARTH_RADIUS_M = 6378137;
const RAD = Math.PI / 180;
const COLUNAS = [
  'timestamp', 'machine_id', 'synthetic', 'latitude_deg', 'longitude_deg', 'gnss_fix',
  'gnss_horizontal_accuracy_m', 'ground_speed_kmh', 'heading_deg', 'roll_deg', 'pitch_deg',
  'yaw_rate_deg_s', 'engine_rpm', 'engine_load_pct', 'coolant_temp_c', 'oil_pressure_kpa',
  'fuel_rate_l_h', 'battery_voltage_v', 'ambient_temp_c', 'relative_humidity_pct',
  'brake_pressed', 'pto_engaged', 'coolant_warning_active',
  'obstacle_distance_cm', 'ultrasonic_echo_valid', 'collision_warning_active', 'inclination_warning_active',
];

/** Metros locais do simulador (x para frente da partida, z à direita) → [lon, lat] na origem fictícia. Inverso de toLocalCoordinate. */
export function percursoParaLonLat(x, z, origem = PERCURSO_ORIGEM) {
  const lon = origem[0] + x / (RAD * EARTH_RADIUS_M * Math.cos(origem[1] * RAD));
  const lat = origem[1] - z / (RAD * EARTH_RADIUS_M);
  return [lon, lat];
}

const num = (valor, casas) => (Number.isFinite(valor) ? Number(valor.toFixed(casas)).toString() : '');
const bool = (valor) => (valor === true ? 'true' : valor === false ? 'false' : '');

/**
 * Amostra do percurso: o que o simulador mostrou naquele instante. `tempoMs` conta
 * do início do percurso; o relógio do CSV parte de `inicioIso` (hora real do toque).
 */
export function amostraDoPercurso(estado, { inclinado = false } = {}) {
  return {
    tempoMs: estado.tempoMs,
    x: estado.maquina.x,
    z: estado.maquina.z,
    rumoGraus: estado.maquina.rumoGraus,
    kph: estado.maquina.velocidadeKph,
    rolagem: estado.atitude.rolagemGraus,
    arfagem: estado.atitude.arfagemGraus,
    distanciaCm: estado.sensor.distanciaCm,
    eco: estado.sensor.eco,
    alertaColisao: estado.sensor.alerta || estado.contato,
    alertaInclinacao: inclinado,
    freio: estado.comandos.freio >= 0.1,
  };
}

/** CSV no formato do Laboratório + quantas linhas e quanto tempo ele cobre (o manifesto confere os dois). */
export function registroDoPercurso(amostras, inicioIso, maquina = PERCURSO_MAQUINA) {
  const csv = csvDoPercurso(amostras, inicioIso, maquina);
  const linhas = csv.trim().split('\n').slice(1);
  const ms = (linha) => Date.parse(linha.slice(0, linha.indexOf(',')));
  return { csv, amostras: linhas.length, duracaoMs: linhas.length ? ms(linhas.at(-1)) - ms(linhas[0]) : 0 };
}

/** CSV no formato do Laboratório. Amostras em ordem de tempo; repetidas no mesmo ms são descartadas. */
export function csvDoPercurso(amostras, inicioIso, maquina = PERCURSO_MAQUINA) {
  const inicio = Date.parse(inicioIso);
  if (!Number.isFinite(inicio)) throw new Error('inicioIso inválido');
  const linhas = [COLUNAS.join(',')];
  let ultimoMs = -1;
  for (const a of amostras) {
    const ms = Math.round(a.tempoMs);
    if (ms <= ultimoMs) continue;
    ultimoMs = ms;
    const [lon, lat] = percursoParaLonLat(a.x, a.z);
    const rumo = ((90 - a.rumoGraus) % 360 + 360) % 360;
    const valores = {
      timestamp: new Date(inicio + ms).toISOString(),
      machine_id: maquina,
      synthetic: 'true',
      latitude_deg: num(lat, 8),
      longitude_deg: num(lon, 8),
      gnss_fix: '3d',
      gnss_horizontal_accuracy_m: '',
      ground_speed_kmh: num(a.kph, 2),
      heading_deg: num(rumo === 360 ? 0 : rumo, 1),
      roll_deg: num(a.rolagem, 1),
      pitch_deg: num(a.arfagem, 1),
      engine_rpm: num(a.rpm, 0),
      engine_load_pct: num(a.cargaMotor, 0),
      brake_pressed: bool(a.freio),
      obstacle_distance_cm: a.eco ? num(a.distanciaCm, 0) : '',
      ultrasonic_echo_valid: bool(a.eco),
      collision_warning_active: bool(a.alertaColisao),
      inclination_warning_active: bool(a.alertaInclinacao),
    };
    linhas.push(COLUNAS.map((c) => valores[c] ?? '').join(','));
  }
  return `${linhas.join('\n')}\n`;
}

const anelLonLat = (pontos) => {
  const anel = pontos.map((p) => percursoParaLonLat(p.x, p.z).map((v) => Number(v.toFixed(8))));
  const [a, b] = [anel[0], anel.at(-1)];
  if (a[0] !== b[0] || a[1] !== b[1]) anel.push([...a]);
  return anel;
};

/** Mapa fictício: limite do talhão (área permitida), área alagada (water) e encosta (hazard slope). */
export function mapaDoPercurso({ talhao, alagado, encosta }) {
  const feicao = (id, role, pontos, extra = {}) => ({
    type: 'Feature',
    properties: { id, role, ...extra },
    geometry: { type: 'Polygon', coordinates: [anelLonLat(pontos)] },
  });
  const retangulo = ({ x0, x1, z0, z1 }) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }, { x: x0, z: z0 }];
  return {
    type: 'FeatureCollection',
    features: [
      feicao('talhao', 'allowed_area', retangulo(talhao)),
      feicao('alagado', 'water', alagado),
      feicao('encosta', 'hazard', encosta, { category: 'slope' }),
    ],
  };
}

/** Manifesto do caso: fictício, sintético, regras do próprio simulador (água avisa a 0 m de margem extra: o geofence já projeta 3 s). */
export function manifestoDoPercurso({ amostras, duracaoMs }) {
  return {
    version: '1.0',
    coordinate_reference: 'WGS84 / GeoJSON longitude,latitude',
    local_origin: [...PERCURSO_ORIGEM],
    synthetic: true,
    site: {
      id: 'talhao-simulador-totem',
      name: 'Talhão do simulador (fictício)',
      boundary_kind: 'Talhão, área alagada e encosta fictícios do simulador do totem; não representam propriedade real.',
    },
    map_warning: 'Área fictícia do simulador do totem: coordenadas só ancoram os metros do jogo, sem lugar real.',
    machine: { id: PERCURSO_MAQUINA },
    duration_s: duracaoMs / 1000,
    export_rate_hz: PERCURSO_HZ,
    rules: { water_warning_distance_m: 8 },
    files: [{ file: 'percurso-totem.csv', samples: amostras }],
  };
}
