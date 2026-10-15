// Onde a captura mostra o que cada bloco narra. Função pura das marcas do
// timings.json (segundos da captura). `inicio: null` = quadro desenhado
// (esquema do b2 ou fechamento do b8). Sem entrega real, o b6 fica na sessão.

import type { PlanoCaptura } from '../sompo/linha-do-tempo.ts';

export function planosDoPipeline(m: Record<string, number>): Record<string, PlanoCaptura[]> {
  const marca = (nome: string, desloca = 0) => {
    if (m[nome] === undefined) throw new Error(`marca ${nome} ausente em timings.json`);
    return Math.max(0, m[nome] + desloca);
  };
  const alerta = m.b3_alerta !== undefined ? marca('b3_alerta', -0.6) : marca('b3_simulador', 2);
  const etapa = Object.keys(m).filter((k) => k.startsWith('b5_etapa_')).sort((a, b) => m[a] - m[b])[0];
  return {
    b1: [{ inicio: marca('b1_campo', -0.3) }],
    b2: [{ inicio: null }],
    b3: [{ inicio: marca('b3_simulador', -0.3), dur: 5 }, { inicio: alerta }],
    b4: [{ inicio: marca('b4_gravando', -1.2), dur: 6 }, { inicio: marca('b4_registrado', -1) }],
    b5: [
      { inicio: marca('b5_painel', -0.4), dur: 3.2 },
      { inicio: marca('b5_sessao', -0.6), dur: etapa ? 3.5 : undefined },
      ...(etapa ? [{ inicio: marca(etapa, -0.5) }] : []),
    ],
    b6: m.b6_entrega !== undefined
      ? [{ inicio: marca('b6_entrega', -0.8), dur: 4.5 }, { inicio: marca('b6_texto', -3.5) }]
      : [{ inicio: marca('b6_sem_entrega', -0.5) }],
    b7: [{ inicio: marca('b7_safra', -0.4), dur: 3.2 }, { inicio: marca('b7_frames', -1.5) }],
    b8: [{ inicio: null }],
  };
}
