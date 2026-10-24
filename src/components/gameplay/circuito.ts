import type { EstadoGameplay, InicioGameplay } from './estadoGameplay';
import { geofenceTalhao } from './geofenceTalhao';
import { estacasCircuito } from './estacasCircuito';

/** Um mundo, uma partida. As estacas indicam uma rota, não reposicionam a máquina. */
export const ROTA_CIRCUITO = Object.freeze([
  { x: -12, z: 0 }, { x: 0, z: 0 }, { x: 8, z: -5 }, { x: 20, z: -7 },
  { x: 32, z: -14 }, { x: 48, z: -10 }, { x: 55, z: 4 }, { x: 65, z: 13 }, { x: 78, z: 13 },
]);
export const INICIO_CIRCUITO: InicioGameplay = {
  ...ROTA_CIRCUITO[0], rumoGraus: 0, tetoKph: 12,
  obstaculos: [{ x: 8, z: 0, raioM: 0.72 }, { x: 23, z: -3, raioM: 0.72 },
    { x: 37, z: -18, raioM: 0.72 }, { x: 49, z: 3, raioM: 0.72 }, { x: 65, z: 18, raioM: 0.72 },
    ...estacasCircuito(ROTA_CIRCUITO)],
};
export type SensorCircuito = 'feno' | 'agua' | 'encosta' | 'sonolencia';
/** Sensores do caminhão na serra (Pista): mesmo formato de episódio, para a Fila ler os dois. */
export type SensorPista = 'animal' | 'freio' | 'curva';
/** `saida_pista` e `area_escape` só acontecem no caminhão (`serra-sem-freio`). */
export type MotivoCircuito = 'chegada' | 'colisao' | 'atolamento' | 'tombamento' | 'abandono' | 'saida_pista' | 'area_escape';
export interface EpisodioCircuito {
  sensor: SensorCircuito | SensorPista; inicioMs: number; fimMs: number | null; gravidade: 'atencao' | 'critico';
  velocidadeKph: number; distanciaCm: number | null; rolagemGraus: number;
  comandoInicial: EstadoGameplay['comandos'];
  resposta: { tempoMs: number; latenciaMs: number; acao: 'frenagem' | 'esterco' | 'freio_motor' } | null;
  evitado: boolean;
}
export interface PausaCircuito { inicioMs: number; duracaoMs: number; motivo: 'aba oculta' | 'menu' }
export interface RegistroCircuito {
  versao: 1; runId: string; inicioIso: string; fimIso: string | null;
  elapsedMs: number; progresso: number; proximoMarco: number;
  resultado: { motivo: MotivoCircuito; tempoMs: number } | null;
  episodios: EpisodioCircuito[]; pausas: PausaCircuito[];
  origem: 'SIMULAÇÃO'; regras: string;
  /** Ausente = trator no circuito do talhão (registros antigos). */
  veiculo?: 'trator' | 'caminhao'; cenario?: 'circuito' | 'serra-sem-freio';
}
export const REGRAS_CIRCUITO = 'SIMULAÇÃO cinemática, não risco de seguro. Colisão: contato frontal ou corpo a menos de raio do fardo +1,05m. Atolamento: 2s dentro da água. Tombamento: rolagem≥30° ou ≥20° acima de 7km/h durante 1s. Evitado: exposição→nova frenagem/esterço após aviso→saída segura durante 1s. Antecipação não é reação. Tempo: relógio monotônico ativo; pausas explícitas excluídas.';
/** As mesmas regras de `REGRAS_CIRCUITO`, em frases para a tela. O registro e o relatório aos agentes seguem com o texto técnico. */
export const REGRAS_CIRCUITO_TELA = [
  'Colisão: encostar a frente no obstáculo ou passar a menos de 1,05 m dele.',
  'Atolamento: ficar 2 s dentro da área alagada.',
  'Tombamento: ficar 1 s inclinado 30° ou mais, ou 20° acima de 7 km/h.',
  'Risco evitado: depois do aviso, frear ou virar e sair da situação por 1 s. Frear antes do aviso não conta como reação.',
  'O tempo conta só com o trator andando; pausas ficam de fora.',
  'Simulação: não avalia risco de seguro nem máquina real.',
] as const;
export function novoRegistroCircuito(runId: string, inicioIso: string): RegistroCircuito {
  return { versao: 1, runId, inicioIso, fimIso: null, elapsedMs: 0, progresso: 0, proximoMarco: 1, resultado: null, episodios: [], pausas: [], origem: 'SIMULAÇÃO', regras: REGRAS_CIRCUITO };
}
export function riscosCircuito(e: EstadoGameplay, sono = false): Map<SensorCircuito, 'atencao' | 'critico'> {
  const riscos = new Map<SensorCircuito, 'atencao' | 'critico'>();
  if (e.sensor.eco && e.maquina.velocidadeKph > 0.5) riscos.set('feno', e.sensor.alerta ? 'critico' : 'atencao');
  const agua = geofenceTalhao(e.maquina);
  if (agua.nivel !== 'fora') riscos.set('agua', agua.nivel === 'dentro' ? 'critico' : 'atencao');
  if (Math.abs(e.atitude.rolagemGraus) >= 12) riscos.set('encosta', Math.abs(e.atitude.rolagemGraus) >= 20 ? 'critico' : 'atencao');
  if (sono) riscos.set('sonolencia', 'critico');
  return riscos;
}

/** Controlador do registro: chamado depois da física, sem React/Three, testável com os comandos reais. */
export function criarCircuito(runId: string, inicioIso: string) {
  const registro = novoRegistroCircuito(runId, inicioIso);
  let aguaMs = 0, tomboMs = 0;
  const saidas = new Map<EpisodioCircuito, number>();
  let anterior: EstadoGameplay['comandos'] = { acelerador: 0, freio: 0, esterco: 0 };
  const terminar = (motivo: MotivoCircuito, agoraIso: string) => {
    if (registro.resultado) return;
    registro.resultado = { motivo, tempoMs: registro.elapsedMs }; registro.fimIso = agoraIso;
    for (const ep of registro.episodios) if (ep.fimMs === null) ep.fimMs = registro.elapsedMs;
  };
  return {
    registro,
    terminar,
    pausa(inicioMs: number, duracaoMs: number, motivo: PausaCircuito['motivo']) { registro.pausas.push({ inicioMs, duracaoMs, motivo }); },
    quadro(e: EstadoGameplay, dtMs: number, agoraIso: string, sono = false) {
      if (registro.resultado || e.fase === 'fim') return;
      // Relógio da Corrida: só anda dirigindo (contrato do motor: 0 enquanto `pronto`); as regras valem sempre.
      if (e.fase === 'dirigindo') registro.elapsedMs += Math.max(0, dtMs);
      const t = registro.elapsedMs;
      const alvo = ROTA_CIRCUITO[registro.proximoMarco];
      // Marcos são áreas geométricas largas em sequência; nenhum marco teleporta ou troca o mundo.
      if (alvo && Math.hypot(e.maquina.x - alvo.x, e.maquina.z - alvo.z) < 3) registro.proximoMarco += 1;
      registro.progresso = Math.min(0.99, (registro.proximoMarco - 1) / (ROTA_CIRCUITO.length - 1));
      const riscos = riscosCircuito(e, sono);
      for (const [sensor, gravidade] of riscos) {
        let ep = [...registro.episodios].reverse().find((p) => p.sensor === sensor && p.fimMs === null);
        if (!ep) {
          ep = { sensor, inicioMs: t, fimMs: null, gravidade, velocidadeKph: e.maquina.velocidadeKph,
            distanciaCm: sensor === 'feno' ? e.sensor.distanciaCm : null, rolagemGraus: e.atitude.rolagemGraus,
            comandoInicial: { ...e.comandos }, resposta: null, evitado: false };
          registro.episodios.push(ep);
        }
        if (gravidade === 'critico') ep.gravidade = gravidade;
        saidas.delete(ep);
      }
      for (const ep of registro.episodios) {
        const sensor = ep.sensor as SensorCircuito;
        // Conta também o comando que removeu o risco neste mesmo quadro.
        const freou = e.comandos.freio >= 0.2 && anterior.freio < 0.2 && ep.comandoInicial.freio < 0.2;
        const virou = Math.abs(e.comandos.esterco - ep.comandoInicial.esterco) >= 0.25
          && Math.abs(anterior.esterco - ep.comandoInicial.esterco) < 0.25;
        if (ep.fimMs === null && (riscos.has(sensor) || !saidas.has(ep)) && t > ep.inicioMs && !ep.resposta && (freou || virou)) ep.resposta = { tempoMs: t, latenciaMs: t - ep.inicioMs, acao: freou ? 'frenagem' : 'esterco' };
        if (ep.fimMs !== null || riscos.has(sensor)) continue;
        if (!saidas.has(ep)) saidas.set(ep, t);
        if (t - (saidas.get(ep) ?? t) >= 1000) {
          ep.fimMs = t; ep.evitado = ep.sensor !== 'sonolencia' && ep.resposta !== null;
        }
      }
      anterior = { ...e.comandos };
      aguaMs = geofenceTalhao(e.maquina).nivel === 'dentro' ? aguaMs + dtMs : 0;
      const roll = Math.abs(e.atitude.rolagemGraus);
      tomboMs = roll >= 30 || (roll >= 20 && e.maquina.velocidadeKph > 7) ? tomboMs + dtMs : 0;
      const corpo = INICIO_CIRCUITO.obstaculos?.some((o) => Math.hypot(e.maquina.x - o.x, e.maquina.z - o.z) < o.raioM + 1.05);
      if (e.contato || corpo) terminar('colisao', agoraIso);
      else if (aguaMs >= 2000) terminar('atolamento', agoraIso);
      else if (tomboMs >= 1000) terminar('tombamento', agoraIso);
      else if (registro.proximoMarco >= ROTA_CIRCUITO.length && e.maquina.x >= ROTA_CIRCUITO[ROTA_CIRCUITO.length - 1].x && Math.abs(e.maquina.z - 13) <= 6) {
        registro.progresso = 1; terminar('chegada', agoraIso);
      }
    },
  };
}
const TITULOS_CORRIDA: Record<MotivoCircuito, string> = {
  chegada: 'Percurso concluído', colisao: 'Colisão com obstáculo', atolamento: 'Atolou na área alagada',
  tombamento: 'Tombou na encosta', abandono: 'Corrida abandonada',
  saida_pista: 'Saiu da pista', area_escape: 'Parou na área de escape',
};
/** Caminhão na serra: mesmos motivos, títulos do que aconteceu lá. */
const TITULOS_SERRA: Partial<Record<MotivoCircuito, string>> = {
  chegada: 'Desceu a serra inteiro', colisao: 'Atropelou o animal na pista', tombamento: 'Tombou na curva',
};
const decimal = (valor: number, casas = 1) => valor.toFixed(casas).replace('.', ',');
/** Texto do resultado da Corrida na tela; o relatório dos agentes segue com o registro cru. */
export function textoResultadoCircuito(r: RegistroCircuito) {
  const m = metricasCircuito(r);
  const avisos = r.episodios.length;
  return {
    titulo: r.resultado ? (r.veiculo === 'caminhao' && TITULOS_SERRA[r.resultado.motivo]) || TITULOS_CORRIDA[r.resultado.motivo] : 'Corrida em andamento',
    resumo: `Tempo: ${decimal(m.elapsedMs / 1000)} s · Avisos respondidos: ${avisos - m.semResposta} de ${avisos} · Reação média: ${m.reacaoMediaMs === null ? 'sem reação medida' : `${decimal(m.reacaoMediaMs / 1000, 2)} s`}`,
  };
}
export { decimal as decimalCircuito };
export function metricasCircuito(r: RegistroCircuito) {
  const respostas = r.episodios.flatMap((e) => e.resposta ? [e.resposta.latenciaMs] : []);
  return { elapsedMs: Math.round(r.elapsedMs), sinistrosEvitados: r.episodios.filter((e) => e.evitado).length,
    reacaoMediaMs: respostas.length ? Math.round(respostas.reduce((a, b) => a + b, 0) / respostas.length) : null,
    semResposta: r.episodios.filter((e) => !e.resposta).length };
}
