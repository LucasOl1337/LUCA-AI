import { amostraDoPercurso, manifestoDoPercurso, mapaDoPercurso, registroDoPercurso } from '../../../shared/percurso-lab.js';
import { ENCOSTA_TALHAO, TALHAO, ZONAS_TALHAO } from './geofenceTalhao';
import { criarCircuito, metricasCircuito, type RegistroCircuito } from './circuito';
import type { EstadoGameplay } from './estadoGameplay';
import type { CasoPercurso } from './analisePercurso';

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
