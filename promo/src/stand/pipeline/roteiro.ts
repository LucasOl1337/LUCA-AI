// Fonte única do roteiro pipeline-completo (missoes/stand-trator/roteiros/pipeline-completo.md):
// narração por bloco e selo de verdade. Narração, legenda e .srt saem daqui.

import type { Verdade } from '../estilo.ts';

export type BlocoPipeline = {
  id: string;
  narracao: string;
  verdade: Verdade;
  detalhe: string;
};

export const PIPELINE: BlocoPipeline[] = [
  {
    id: 'b1',
    narracao: 'No campo, um trator pode bater ou tombar em poucos segundos. Quase sempre ninguém vê o risco chegando. E se desse para enxergar o risco antes do acidente?',
    verdade: 'simulado',
    detalhe: 'simulador do painel',
  },
  {
    id: 'b2',
    narracao: 'Na frente do trator, um sensor mede a distância até o que vem pela frente. Uma placa pequena lê esse sensor e manda as leituras pela internet até o painel do LUCA.',
    verdade: 'esquema',
    detalhe: 'desenho explicativo',
  },
  {
    id: 'b3',
    narracao: 'No painel, o mesmo caso roda no simulador, com dados sintéticos. O fardo entra no alcance do sensor, o alerta acende a um metro e meio e o operador freia a tempo, sem encostar.',
    verdade: 'simulado',
    detalhe: 'telemetria sintética',
  },
  {
    id: 'b4',
    narracao: 'Esse momento vira um episódio gravado. Com um clique, o painel registra o roteiro inteiro, fase por fase, com imagens datadas de cada instante.',
    verdade: 'simulado',
    detalhe: 'gravação real · telemetria sintética',
  },
  {
    id: 'b5',
    narracao: 'Com mais um clique, o episódio inteiro vai para a bancada: uma equipe de agentes de IA que lê os dados e as imagens, cada um no seu papel.',
    verdade: 'real',
    detalhe: 'bancada de agentes rodando',
  },
  {
    id: 'b6',
    narracao: 'Minutos depois, a bancada devolve um veredito: o que aconteceu, qual a gravidade para a seguradora e o que fazer agora. Este parecer foi gerado de verdade, nesta gravação.',
    verdade: 'real',
    detalhe: 'veredito gerado na captura',
  },
  {
    id: 'b7',
    narracao: 'A seguradora e o segurado olham a mesma evidência: o episódio gravado, com as imagens de cada fase, no painel da safra. A parada a tempo deixa de ser invisível.',
    verdade: 'real',
    detalhe: 'episódio gravado agora',
  },
  {
    id: 'b8',
    narracao: 'Hoje, dentro do painel, isso já funciona com casos de exemplo. Quer ver um caso? Pergunta pro LUCA.',
    verdade: 'real',
    detalhe: 'LUCA-AI',
  },
];

/** Plano B (roteiro): a corrida real não entregou parecer. Nunca resposta inventada. */
export const PLANO_B: Record<string, string> = {
  b5: 'Com mais um clique, o episódio inteiro vai para a bancada: uma equipe de agentes de IA que lê os dados e as imagens.',
  b6: 'O parecer da bancada fica registrado na sessão, para quem precisa decidir.',
};
