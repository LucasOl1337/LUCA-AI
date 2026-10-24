/**
 * Sessão de uma corrida do caminhão: registro no mesmo formato do circuito do
 * trator (`RegistroCircuito` v1 + veiculo/cenario) e o caso do Laboratório
 * (CSV a 5 Hz, manifesto e mapa fictício da serra). A Fila e o chat leem igual.
 */
import { percursoParaLonLat, PERCURSO_CAMINHAO, PERCURSO_HZ, PERCURSO_ORIGEM, registroDoPercurso } from '../../../shared/percurso-lab.js';
import { metricasCircuito, novoRegistroCircuito, type EpisodioCircuito, type MotivoCircuito, type PausaCircuito, type SensorPista } from '../gameplay/circuito';
import type { RelatorioCircuito } from '../gameplay/sessaoCircuito';
import { PISTA_SERRA, pontoLateral, SERRA, GUARD_RAIL_M, type PistaSerra } from './pistaSerra';
import type { RetratoPista } from './corridaPista';

export const REGRAS_PISTA = 'SIMULAÇÃO cinemática do caminhão na serra (serra-sem-freio), não risco de seguro. Freio de serviço falha em s=620 m (eficiência 1→0 em 1,5 s); freio-motor e área de escape seguem funcionando. Animal: radar frontal 70 m, aviso com TTC<4,5 s, crítico <2,2 s. Curva: aceleração lateral ≥0,28 g aviso, ≥0,40 g ou derrapagem crítico, ≥0,52 g por 0,5 s tomba; aderência 0,62 g no asfalto e 0,35 g no cascalho (acima, a frente escorrega e a lateral não passa daí). Saída de pista: rompe o guard-rail (>4,5 m/s normal). Evitado: exposição→nova resposta (frenagem, esterço ou freio-motor) após aviso→saída durante 1 s. Tempo: relógio ativo; pausas excluídas.';
export const REGRAS_PISTA_TELA = [
  'O freio falha no início da descida forte: o pedal deixa de funcionar.',
  'Saída: segure o freio-motor (○/B, R1/RB ou E) e entre na área de escape à direita.',
  'Animal na pista: o radar avisa; desvie ou reduza antes de chegar nele.',
  'Curva rápida demais tomba o caminhão; romper o guard-rail é saída de pista.',
  'O tempo conta só com o caminhão andando; pausas ficam de fora.',
  'Simulação: não avalia risco de seguro nem veículo real.',
] as const;

export const FONTE_PISTA = 'serra-sem-freio.csv';

interface AmostraPista { tempoMs: number; x: number; z: number; rumoGraus: number; kph: number; rolagem: number; arfagem: number; distanciaCm: number | null; eco: boolean; alertaColisao: boolean; alertaInclinacao: boolean; freio: boolean; rpm: number; cargaMotor: number }

export function amostraDaPista(r: RetratoPista): AmostraPista {
  const c = r.caminhao;
  return {
    tempoMs: r.tempoMs, x: c.x, z: c.z, rumoGraus: c.rumo * 180 / Math.PI, kph: c.velocidade * 3.6,
    // Rolagem da carroceria na suspensão (fisicaCaminhao); arfagem = rampa da pista.
    rolagem: c.rolagem * 180 / Math.PI, arfagem: Math.atan(c.rampa) * 180 / Math.PI,
    distanciaCm: r.radar ? Math.round(r.radar.distanciaM * 100) : null, eco: !!r.radar,
    alertaColisao: r.riscos.has('animal'), alertaInclinacao: r.riscos.has('curva'),
    freio: r.comandos.freio >= 0.1, rpm: c.rpm, cargaMotor: Math.round(100 * r.comandos.acelerador),
  };
}

/** Mapa fictício da serra: pista + acostamento (allowed_area), área de escape (allowed_area) e descida forte (hazard slope). */
export function mapaDaSerra(pista: PistaSerra = PISTA_SERRA) {
  const corredor = (s0: number, s1: number, l0: number, l1: number) => {
    const ida: [number, number][] = [], volta: [number, number][] = [];
    for (let s = s0; s <= s1 + 1e-6; s += Math.max(4, (s1 - s0) / 120)) {
      const a = pontoLateral(pista, s, l0), b = pontoLateral(pista, s, l1);
      ida.push(percursoParaLonLat(a.x, a.z) as [number, number]); volta.unshift(percursoParaLonLat(b.x, b.z) as [number, number]);
    }
    const anel = [...ida, ...volta].map((p) => p.map((v) => Number(v.toFixed(8))));
    anel.push([...anel[0]]);
    return anel;
  };
  const feicao = (id: string, role: string, anel: number[][], extra = {}) => ({ type: 'Feature', properties: { id, role, ...extra }, geometry: { type: 'Polygon', coordinates: [anel] } });
  const e = SERRA.escape;
  return {
    type: 'FeatureCollection',
    features: [
      feicao('serra-pista', 'allowed_area', corredor(0, pista.comprimentoM, -GUARD_RAIL_M, GUARD_RAIL_M)),
      feicao('serra-area-escape', 'allowed_area', corredor(e.s0, e.s1, e.lateral0 - 0.5, e.lateral1)),
      feicao('serra-descida', 'hazard', corredor(SERRA.descida.s0, SERRA.descida.s1, -GUARD_RAIL_M, GUARD_RAIL_M), { category: 'slope' }),
    ],
  };
}

export function manifestoDaSerra({ amostras, duracaoMs }: { amostras: number; duracaoMs: number }) {
  return {
    version: '1.0', coordinate_reference: 'WGS84 / GeoJSON longitude,latitude', local_origin: [...PERCURSO_ORIGEM], synthetic: true,
    site: { id: 'serra-sem-freio-totem', name: 'Serra do simulador (fictícia)', boundary_kind: 'Rodovia de serra fictícia do simulador do totem; não representa estrada real.' },
    map_warning: 'Área fictícia do simulador do totem: coordenadas só ancoram os metros do jogo, sem lugar real.',
    machine: { id: PERCURSO_CAMINHAO },
    duration_s: duracaoMs / 1000, export_rate_hz: PERCURSO_HZ,
    rules: { water_warning_distance_m: 8 },
    files: [{ file: FONTE_PISTA, samples: amostras }],
  };
}

export function criarSessaoPista(runId = crypto.randomUUID(), inicioIso = new Date().toISOString()) {
  const registro = { ...novoRegistroCircuito(runId, inicioIso), regras: REGRAS_PISTA, veiculo: 'caminhao' as const, cenario: 'serra-sem-freio' as const };
  const amostras: AmostraPista[] = [];
  const saidas = new Map<EpisodioCircuito, number>();
  let ultima = -Infinity;
  let anterior = { freio: 0, esterco: 0, freioMotor: false };
  const terminar = (motivo: MotivoCircuito, agoraIso: string) => {
    if (registro.resultado) return;
    registro.resultado = { motivo, tempoMs: registro.elapsedMs }; registro.fimIso = agoraIso;
    for (const ep of registro.episodios) if (ep.fimMs === null) ep.fimMs = registro.elapsedMs;
    if (motivo === 'chegada' || motivo === 'area_escape') registro.progresso = 1;
  };
  return {
    registro,
    terminar,
    pausa(inicioMs: number, duracaoMs: number, motivo: PausaCircuito['motivo']) { registro.pausas.push({ inicioMs, duracaoMs, motivo }); },
    quadro(r: RetratoPista, agoraIso: string) {
      if (registro.resultado) return;
      registro.elapsedMs = r.tempoMs;
      registro.progresso = Math.min(0.99, r.caminhao.s / SERRA.chegadaS);
      const t = registro.elapsedMs, c = r.comandos, fm = r.caminhao.freioMotor;
      for (const [sensor, gravidade] of r.riscos) {
        let ep = [...registro.episodios].reverse().find((p) => p.sensor === sensor && p.fimMs === null);
        if (!ep) {
          ep = { sensor, inicioMs: t, fimMs: null, gravidade, velocidadeKph: r.caminhao.velocidade * 3.6,
            distanciaCm: sensor === 'animal' && r.radar ? Math.round(r.radar.distanciaM * 100) : null,
            rolagemGraus: Math.abs(r.caminhao.rolagem) * 180 / Math.PI, comandoInicial: { ...c }, resposta: null, evitado: false };
          registro.episodios.push(ep);
        }
        if (gravidade === 'critico') ep.gravidade = gravidade;
        saidas.delete(ep);
      }
      for (const ep of registro.episodios) {
        const freou = c.freio >= 0.2 && anterior.freio < 0.2 && ep.comandoInicial.freio < 0.2;
        const virou = Math.abs(c.esterco - ep.comandoInicial.esterco) >= 0.25 && Math.abs(anterior.esterco - ep.comandoInicial.esterco) < 0.25;
        const reduziu = fm && !anterior.freioMotor;
        if (ep.fimMs === null && t > ep.inicioMs && !ep.resposta && (freou || virou || reduziu)) {
          ep.resposta = { tempoMs: t, latenciaMs: t - ep.inicioMs, acao: reduziu ? 'freio_motor' : freou ? 'frenagem' : 'esterco' };
        }
        if (ep.fimMs !== null || r.riscos.has(ep.sensor as SensorPista)) continue;
        if (!saidas.has(ep)) saidas.set(ep, t);
        if (t - (saidas.get(ep) ?? t) >= 1000) { ep.fimMs = t; ep.evitado = ep.sensor !== 'sonolencia' && ep.resposta !== null; }
      }
      anterior = { freio: c.freio, esterco: c.esterco, freioMotor: fm };
      if (r.fim) terminar(r.fim, agoraIso);
    },
    registrar(r: RetratoPista) {
      const t = Math.round(r.tempoMs);
      if ((t - ultima < 200 && !registro.resultado) || t === ultima) return;
      ultima = t; amostras.push(amostraDaPista(r));
    },
    relatorio(): RelatorioCircuito {
      const reg = structuredClone(registro);
      const csv = registroDoPercurso(amostras, inicioIso, PERCURSO_CAMINHAO);
      return { registro: reg, caso: {
        rawCsv: csv.csv, sourceName: FONTE_PISTA, name: `Serra sem freio · ${runId}`,
        metadata: { ...manifestoDaSerra({ amostras: csv.amostras, duracaoMs: csv.duracaoMs }), circuito: reg, metricas: metricasCircuito(reg) },
        map: mapaDaSerra(),
      } };
    },
  };
}
export type SessaoPista = ReturnType<typeof criarSessaoPista>;
