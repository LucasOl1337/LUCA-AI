// Fonte única dos dois roteiros M6 (missoes/stand-trator/roteiros/*.md):
// narração por bloco, selo de verdade e fonte do dado. A narração em
// OmniVoice, a legenda e o .srt saem desta lista.

import type { Verdade } from '../estilo.ts';

export type BlocoRoteiro = {
  id: string;
  narracao: string;
  verdade: Verdade;
  detalhe: string;
  /** Fonte de dado público citado no bloco (vai para a legenda de rodapé). */
  fonte?: string;
};

export type RoteiroId = 'painel-sompo' | 'painel-segurado';

export const ROTEIROS: Record<RoteiroId, BlocoRoteiro[]> = {
  'painel-sompo': [
    { id: 'b1', narracao: 'E se a seguradora enxergasse o risco antes do sinistro?', verdade: 'real', detalhe: 'tela do app' },
    {
      id: 'b2',
      narracao: 'No painel, a seguradora começa por casos de exemplo do campo, ao lado de dados públicos do setor.',
      verdade: 'demonstrativo',
      detalhe: 'casos de exemplo · dados públicos',
      fonte: 'Fontes: Globo Rural / Forbes Agro (2012–2023) · Embrapa · CNA e MAPA/ZARC',
    },
    {
      id: 'b3',
      narracao: 'Na safra, ela compara a frota. Esta frota é de demonstração: três máquinas, quatro meses, e o que foi prevenção ou dano em cada uma.',
      verdade: 'demonstrativo',
      detalhe: 'frota demonstrativa',
    },
    {
      id: 'b4',
      narracao: 'Cada episódio gravado chega com as imagens datadas do momento do risco. Este foi gravado agora, no simulador.',
      verdade: 'simulado',
      detalhe: 'episódio gravado do simulador',
    },
    {
      id: 'b5',
      narracao: 'Com um clique, as evidências vão para a bancada de agentes de IA, que discute e devolve uma recomendação para a próxima safra.',
      verdade: 'real',
      detalhe: 'bancada de agentes rodando',
    },
    {
      id: 'b6',
      narracao: 'Valores e apólices ainda não entram nesta versão. O que a seguradora vê é a evidência, organizada para decidir.',
      verdade: 'real',
      detalhe: 'pendência declarada no painel',
    },
  ],
  'painel-segurado': [
    { id: 'b1', narracao: 'O que o seu trator conta sobre você?', verdade: 'demonstrativo', detalhe: 'veículo de exemplo' },
    {
      id: 'b2',
      narracao: 'Hoje, dentro do painel, o produtor cadastra a máquina dele e abre no simulador.',
      verdade: 'real',
      detalhe: 'fluxo do painel · cadastro de exemplo',
    },
    {
      id: 'b3',
      narracao: 'Numa curva em ladeira, o sensor percebe a inclinação e o alerta acende antes do tombamento. O operador reduz e o trator estabiliza. Aqui, simulado.',
      verdade: 'simulado',
      detalhe: 'telemetria sintética',
    },
    {
      id: 'b4',
      narracao: 'Esse momento vira um episódio gravado, com imagens datadas de cada fase.',
      verdade: 'simulado',
      detalhe: 'gravação real · telemetria sintética',
    },
    {
      id: 'b5',
      narracao: 'A parada a tempo deixa de ser invisível: a boa prática vira evidência a favor do segurado.',
      verdade: 'real',
      detalhe: 'episódio gravado agora',
    },
    {
      id: 'b6',
      narracao: 'Uma tela só do produtor, ligada à apólice dele, ainda não existe. É o próximo passo.',
      verdade: 'esquema',
      detalhe: 'próximo passo, ainda não existe',
    },
  ],
};

/** Plano B do bloco 5 do painel-sompo: a bancada não devolveu entrega na captura. */
export const SOMPO_B5_SEM_ENTREGA = 'Com um clique, as evidências seguem para a bancada de agentes de IA analisar.';
