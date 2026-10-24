import { amostraDoPercurso, manifestoDoPercurso, mapaDoPercurso, registroDoPercurso } from '../../../shared/percurso-lab.js';
import { ENCOSTA_TALHAO, TALHAO, ZONAS_TALHAO } from './geofenceTalhao';
import { criarCircuito, INICIO_CIRCUITO, metricasCircuito, type RegistroCircuito } from './circuito';
import type { CanalGameplay, EstadoGameplay } from './estadoGameplay';
import type { CasoPercurso } from './analisePercurso';
import type { ContextoCorrida } from './contextoCorrida';

export interface RelatorioCircuito { registro: RegistroCircuito; caso: CasoPercurso }
export function criarSessaoCircuito(runId = crypto.randomUUID(), inicioIso = new Date().toISOString()) {
  const circuito = criarCircuito(runId, inicioIso);
  const amostras: ReturnType<typeof amostraDoPercurso>[] = [];
  let ultima = -Infinity;
  return {
    ...circuito,
    registrar(e: EstadoGameplay) {
      const t = Math.round(circuito.registro.elapsedMs);
      if (t - ultima < 200 && !circuito.registro.resultado) return;
      if (t === ultima) return;
      ultima = t;
      amostras.push({ ...amostraDoPercurso(e, { inclinado: Math.abs(e.atitude.rolagemGraus) >= 12 }), tempoMs: t });
    },
    relatorio(): RelatorioCircuito {
      const r = structuredClone(circuito.registro);
      const csv = registroDoPercurso(amostras, inicioIso);
      return { registro: r, caso: {
        rawCsv: csv.csv, sourceName: 'percurso-totem.csv', name: `Circuito · ${runId}`,
        metadata: { ...manifestoDoPercurso({ amostras: csv.amostras, duracaoMs: csv.duracaoMs }), circuito: r, metricas: metricasCircuito(r) },
        map: mapaDoPercurso({ talhao: TALHAO, alagado: ZONAS_TALHAO[0].poligono.rings[0], encosta: ENCOSTA_TALHAO.rings[0] }),
      } };
    },
  };
}
export type SessaoCircuito = ReturnType<typeof criarSessaoCircuito>;

/**
 * Largada de uma corrida no motor que segue vivo entre corridas: trator na
 * largada, parado, sem contato nem aviso, e a primeira amostra da sessão nova
 * já nessa pose (nada da corrida anterior entra no registro).
 */
export function largarCircuito(motor: Pick<CanalGameplay, 'reiniciar' | 'ler'>, sessao: SessaoCircuito) {
  motor.reiniciar(INICIO_CIRCUITO);
  sessao.registrar(motor.ler());
}

/** O que a Coruja lê da corrida: só o motor e a sessão desta corrida. */
export function contextoDoCircuito(motor: Pick<CanalGameplay, 'ler'>, sessao: SessaoCircuito, pausada: boolean): ContextoCorrida {
  const e = motor.ler();
  return { velocidadeKph: e.maquina.velocidadeKph, distanciaCm: e.sensor.distanciaCm,
    fase: sessao.registro.resultado ? 'fim' : pausada ? 'pausa' : 'dirigindo' };
}
