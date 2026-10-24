// Veredicto de exemplo no contrato veredicto v1 (veredicto/CONTRATO.md da rodada 24/10).
// Só para o molde e os testes do laudo; o veredicto real vem de analysis.verdict.
// `tema: 'agua'` casa com o caso 02-cerca-e-agua (título, evidências e gráfico do mesmo caso).
export function veredictoExemplo({ culpado = 'operador', confianca = 0.72, elapsedMs = 61_000, tema = 'fardo' } = {}) {
  if (tema === 'agua') return veredictoAgua({ confianca, elapsedMs });
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

function veredictoAgua({ confianca, elapsedMs }) {
  const base = veredictoExemplo({ confianca, elapsedMs });
  return {
    ...base, culpado: 'operador', culpadoRotulo: 'Operador humano',
    porque: 'A rota saiu da cerca e chegou a 20 m da água várias vezes, sempre no mesmo trecho; a velocidade subiu antes de cada aproximação e não há falha de GPS ou de máquina registrada.',
    hipotese: 'O trator deixou a área permitida no início e voltou a encostar no limite de 20 m da água em ciclos repetidos, acelerando antes de cada aproximação. O padrão aponta trajeto planejado rente demais à borda, não defeito: a máquina respondeu normal e o GPS manteve fix 3D. Não há indício de entrada na água.',
    evidencias: [
      { descricao: 'Distância até a água chegou a 20,0 m (limite de aviso); não comprova entrada.', elapsedMs },
      { descricao: 'Posição fora do polígono permitido logo no início da operação.', elapsedMs: 0 },
      { descricao: 'Nova saída da cerca 6 s depois do aviso de água.', elapsedMs: elapsedMs + 6_400 },
    ],
    fatores_contribuintes: ['Rota planejada rente à borda da área', 'Velocidade crescente perto do limite'],
    prevencao: [
      { acao: 'Afastar a rota planejada 10 m da borda da água.', responsavel: 'Gestor da fazenda', prazo: '7 dias' },
      { acao: 'Alerta sonoro na cabine a 30 m da água.', responsavel: 'Manutenção' },
      { acao: 'Revisar as saídas de cerca do turno com o operador.', responsavel: 'Supervisor' },
    ],
    impacto_financeiro: {
      faixa_min_brl: 0, faixa_max_brl: 2_000,
      componentes: [{ chave: 'parada_operacional', item: 'Parada para reposicionar a máquina', valor_min_brl: 0, valor_max_brl: 2_000, valor_brl: 800, base: 'até 2 h de operação parada (estimativa ilustrativa)' }],
      premissas: ['Caso sintético: valores ilustrativos, não sinistro real.', 'Sem entrada na água e sem dano registrado.', 'Danos pessoais não são estimados.'],
      rotulo: 'estimativa', tabela: 'premissas-v1',
    },
  };
}
