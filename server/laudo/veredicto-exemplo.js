// Veredicto de exemplo no contrato veredicto v1 (veredicto/CONTRATO.md da rodada 24/10).
// Só para o molde e os testes do laudo; o veredicto real vem de analysis.verdict.
export function veredictoExemplo({ culpado = 'operador', confianca = 0.72, elapsedMs = 61_000 } = {}) {
  return {
    versao: 1, status: 'concluido', culpado,
    culpadoRotulo: { operador: 'Operador humano', maquina: 'Máquina', manutencao: 'Manutenção', ambiente: 'Ambiente', terceiro: 'Terceiro', indeterminado: 'Indeterminado' }[culpado],
    confianca,
    porque: 'O aviso de obstáculo tocou 2,4 s antes do contato e a velocidade só caiu depois do contato; não há sinal de falha de freio na telemetria.',
    hipotese: 'O trator seguia a cerca de 9 km/h quando o sensor frontal avisou o fardo à frente. O operador manteve a velocidade por mais de dois segundos e só freou depois do contato. A leitura mais provável é distração ou demora na reação ao aviso, sem indício de defeito da máquina.',
    evidencias: [
      { descricao: 'Aviso de obstáculo a 2,1 m com o trator a 9 km/h.', elapsedMs: elapsedMs - 2400 },
      { descricao: 'Contato frontal com o fardo; velocidade ainda acima de 8 km/h.', elapsedMs },
      { descricao: 'Freio acionado só depois do contato.', elapsedMs: elapsedMs + 600 },
    ],
    fatores_contribuintes: ['Velocidade alta para manobra perto de fardos', 'Aviso sonoro ignorado por mais de 2 s'],
    prevencao: [
      { acao: 'Treino curto de reação ao aviso do sensor frontal (frear ao primeiro bipe).', responsavel: 'Operador', prazo: '30 dias' },
      { acao: 'Limitar a 5 km/h a velocidade na área de fardos.', responsavel: 'Gestor da fazenda' },
      { acao: 'Revisar os registros de aviso ignorado na reunião semanal.', responsavel: 'Supervisor' },
    ],
    impacto_financeiro: {
      faixa_min_brl: 8_150, faixa_max_brl: 32_400,
      componentes: [
        { chave: 'reparo_frontal_leve', item: 'Reparo frontal leve do trator', valor_min_brl: 8_000, valor_max_brl: 32_000, valor_brl: 20_000, base: '2%–8% do valor de referência do trator (R$ 400 mil, referência do app)' },
        { chave: 'fardo_perdido', item: 'Fardo de feno perdido (por unidade)', valor_min_brl: 150, valor_max_brl: 400, valor_brl: 275, base: 'estimativa ilustrativa, por fardo' },
      ],
      premissas: ['Corrida simulada: valores ilustrativos, não sinistro real.', 'Valores da tabela premissas-v1; trator de referência R$ 400 mil (referência do app). Demais itens são estimativas ilustrativas.', 'Danos pessoais não são estimados.'],
      rotulo: 'estimativa', tabela: 'premissas-v1',
    },
    aviso: 'Estimativa com confiança, não acusação nem laudo pericial.',
    geradoEm: '2026-10-24T11:40:00.000Z', modelo: 'exemplo',
  };
}
