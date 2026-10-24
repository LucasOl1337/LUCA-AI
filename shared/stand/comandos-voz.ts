/**
 * Comandos de voz do stand: a lista única do que o visitante pode pedir ao LUCA.
 *
 * A mesma lista vai para dois lugares, para não divergirem:
 * - o painel "Experimente pedir" ao lado da coruja (`PainelComandos.tsx`);
 * - o prompt do cérebro (`montarPromptBase` em `server/stand/conhecimento.js`),
 *   com a ferramenta que atende cada pedido.
 * `tests/stand-comandos-voz.test.js` confere que toda ferramenta do stand aparece
 * aqui e que todo comando aponta para ferramenta que existe.
 *
 * Só sintaxe apagável (tipos + funções puras): o Node importa direto, sem build.
 */

export interface ComandoVoz {
  id: string;
  /** Nome curto do comando (2 a 4 palavras): rótulo acessível no painel e linha do prompt. */
  titulo: string;
  /** Frase de exemplo, do jeito que a pessoa fala. */
  exemplo: string;
  /** O que acontece, numa linha curta (até 42 caracteres: cabe no painel lido de longe). */
  faz: string;
  /** Ferramentas do cérebro que atendem o pedido (`FERRAMENTAS_STAND`). */
  ferramentas: readonly string[];
}

/**
 * As cinco experiências do Totem (pedido do Lucas, 24/10: "no máximo cinco,
 * bem feitas e completas"). Cada uma abre com fala pronta, anda sozinha e volta
 * pra Coruja convidando as outras. "Volta pra coruja" é controle, não cartão.
 */
export const COMANDOS_VOZ: readonly ComandoVoz[] = Object.freeze(([
  {
    id: 'simulacao',
    titulo: 'Dirigir o trator',
    exemplo: 'Quero dirigir o trator',
    faz: 'Você leva o trator até a chegada',
    ferramentas: ['abrir_simulacao'],
  },
  {
    id: 'sonolencia',
    titulo: 'Teste de sono',
    exemplo: 'Testa o alerta de sono',
    faz: 'Feche os olhos 1 s e o alarme toca',
    ferramentas: ['sono_iniciar'],
  },
  {
    id: 'tour',
    titulo: 'Ver tudo',
    exemplo: 'Me mostra tudo',
    faz: 'Tour guiado de 1 minuto',
    ferramentas: ['tour_iniciar'],
  },
  {
    id: 'vitrine',
    titulo: 'Ver como funciona',
    exemplo: 'Me mostra o vídeo',
    faz: 'Vídeo que explica o LUCA',
    ferramentas: ['tocar_video'],
  },
  {
    id: 'perguntar',
    titulo: 'Tirar dúvidas',
    exemplo: 'O que a seguradora ganha?',
    faz: 'Pergunte o que quiser sobre o LUCA',
    ferramentas: ['buscar_no_repo', 'pesquisar_web'],
  },
] as ComandoVoz[]).map((item) => Object.freeze(item)));

/** Controle (não é experiência): fecha o que estiver aberto. Fala pronta, sem modelo. */
export const CONTROLE_VOLTAR = Object.freeze({ id: 'voltar', exemplo: 'Volta pra coruja', ferramentas: ['voltar_coruja'] as readonly string[] });

/** Convite de fechamento: depois de uma experiência, as outras quatro. */
export function convite(feita: string): string {
  const nomes: Record<string, string> = {
    simulacao: 'dirigir o trator', sonolencia: 'testar o alerta de sono', tour: 'ver o tour',
    vitrine: 'ver o vídeo de como funciona', perguntar: 'me perguntar qualquer coisa',
  };
  const resto = COMANDOS_VOZ.filter((c) => c.id !== feita).map((c) => nomes[c.id]);
  return `Agora você pode ${resto.slice(0, -1).join(', ')} ou ${resto[resto.length - 1]}.`;
}

/** `sensor_pausar, sensor_ajustar...` → `sensor_*` (as descrições completas já vão nas ferramentas). */
function resumirFerramentas(nomes: readonly string[]): string {
  const prefixo = nomes[0]?.split('_')[0];
  return nomes.length > 1 && nomes.every((n) => n.startsWith(`${prefixo}_`)) ? `${prefixo}_*` : nomes.join(', ');
}

/** Seção do prompt do cérebro: o que o painel mostra e qual ferramenta atende cada pedido. */
export function comandosParaPrompt(comandos: readonly ComandoVoz[] = COMANDOS_VOZ): string {
  return [
    'As cinco experiências do Totem (o painel ao lado da coruja mostra só estas). Ofereça só estas cinco, cada uma com a ferramenta indicada; quem não sabe o que pedir, convide com uma delas.',
    ...comandos.map((c) => `- ${c.titulo} ("${c.exemplo}"): ${resumirFerramentas(c.ferramentas)}`),
    `- Controle, a qualquer momento ("${CONTROLE_VOLTAR.exemplo}"): voltar_coruja`,
  ].join('\n');
}

const normalizar = (texto: string) => String(texto || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** O que se pode jogar/dirigir no stand. */
const ALVO_SIMULACAO = /\b(simulador|simuladores|simulacao|gameplay|game ?play|game|jogo|joguinho)\b/;
/** Verbo de pedido: abrir, testar, jogar... ("quero", "bora" contam como pedido). */
const VERBO_SIMULACAO = /\b(testar|testa|teste|jogar|joga|dirigir|dirige|pilotar|abrir|abre|abra|ir|vai|vamos|bora|partiu|entrar|entra|ligar|liga|ver|mostrar|mostra|usar|experimentar|experimenta|comecar|comeca|bota|coloca|quero|queria|posso|deixa)\b/;
/** Pedido curto de jogar/dirigir sem nomear o simulador: "quero jogar", "posso dirigir o trator?". */
const JOGAR_DIRETO = /\b(quero|queria|posso|vamos|bora|deixa eu|me deixa|da pra|eu quero)( (jogar|dirigir|pilotar))\b|^(jogar|dirigir|pilotar)( o trator| um pouco| agora)?$|\b(dirigir|pilotar) (o|esse) trator\b/;
/** Pergunta sobre o simulador, não pedido de abrir; ou pedido de sair/de outra tela. */
const NAO_E_PEDIDO = /\b(como funciona|o que e|que e isso|explica|serve|pra que|para que|saber|entender|sair|sai|fecha|fechar|parar|para de|sompo|painel|video|grav\w*)\b/;

/**
 * Pedido direto que o servidor atende sem perguntar ao modelo. Hoje só a
 * Simulação ("testar o simulador", "quero jogar", "abre a simulação"): o modelo
 * escolhia a aba de telemetria do painel SOMPO ou só falava, e a Simulação
 * não abria (21/10). Devolve o id do comando ou null.
 */
export function comandoDireto(texto: string): 'simulacao' | null {
  const frase = normalizar(texto);
  if (!frase || frase.split(' ').length > 14) return null;
  if (NAO_E_PEDIDO.test(frase)) return null;
  // O verbo vem antes do alvo ("abre a simulação"); "o simulador mostra..." é pergunta.
  const alvo = frase.search(ALVO_SIMULACAO);
  const verbo = frase.search(VERBO_SIMULACAO);
  if (alvo >= 0 && verbo >= 0 && verbo < alvo) return 'simulacao';
  if (JOGAR_DIRETO.test(frase)) return 'simulacao';
  return null;
}

export type PedidoDireto = 'simulacao' | 'sonolencia' | 'tour' | 'vitrine' | 'animal' | 'obstaculo' | 'voltar' | 'ajuda';

/** ③ "Me mostra tudo", "o que tem aqui?", "faz o tour". */
const TOUR_DIRETO = /^(?:(?:me )?mostra(?:r)?|quero ver|ver|bora ver) tudo$|\b(?:faz|fazer|faca|comeca|comecar|quero|quero ver|bora|mostra|me mostra)(?: o| um)? tour\b|^(?:o que|que) (?:tem|da pra fazer|eu posso fazer) aqui$|^tour(?: guiado)?$/;
/** ② pedido de testar o alerta de sono (sem ser pergunta "como funciona"). */
const SONO_ALVO = /\b(sono|sonolencia|sonolento|dormir|dormindo|cochilo|olho fechado|olhos fechados|fadiga)\b/;
const SONO_VERBO = /\b(testa|testar|teste|quero|queria|mostra|mostrar|me mostra|faz|fazer|faca|bora|vamos|liga|ligar|ativa|ativar|experimentar|experimenta|posso|abre|abrir)\b/;
/** ④ o vídeo de como funciona / a vitrine. */
const VITRINE_DIRETO = /\b(video|videos|filme|vitrine)\b/;
const VITRINE_VERBO = /\b(quero|queria|abre|abrir|abra|mostra|mostrar|mostre|ver|veja|passa|passar|coloca|bota|toca|tocar|assistir|tem)\b/;

/** Nomes da navegação têm prioridade sobre a escolha probabilística do modelo. */
export function pedidoDireto(texto: string): PedidoDireto | null {
  const frase = normalizar(texto);
  if (!frase || frase.split(' ').length > 18 || /\b(nao|nunca)\b/.test(frase)) return null;
  if (/^(?:por favor )?(?:volta|voltar|volte|sair|sai)(?: pra| para| a| pro| para a| para o)?(?: coruja| inicio)?(?: por favor)?$/.test(frase)) return 'voltar';
  if (/^(como (?:eu )?(?:dirijo|dirige|acelero|freio)|como funciona o controle|(?:me )?ajuda(?: aqui| no simulador)?)$/.test(frase)) return 'ajuda';
  // "Como funciona..." e "o que é..." continuam sendo perguntas, sem navegação.
  if (TOUR_DIRETO.test(frase)) return 'tour';
  // "Tem um vídeo de como funciona?" e "quero ver como funciona" são o vídeo ④, não pergunta.
  if (VITRINE_VERBO.test(frase) && (VITRINE_DIRETO.test(frase) || /\b(ver|veja|mostra|me mostra) como (funciona|e)\b/.test(frase))) return 'vitrine';
  if (/\b(como|explica|saber|entender|o que|qual|por que|porque)\b/.test(frase)) return null;
  if (SONO_ALVO.test(frase) && SONO_VERBO.test(frase)) return 'sonolencia';
  const pede = /\b(quero|queria|abre|abrir|abra|mostra|mostrar|mostre|ver|veja|testa|testar)\b/.test(frase);
  if (pede && /\b(animal|animais|vaca|boi)\b/.test(frase) && /\b(pista|estrada)\b/.test(frase)) return 'animal';
  if (pede && /\b(fardo|obstaculo)\b/.test(frase)) return 'obstaculo';
  return comandoDireto(texto);
}

export function aceitaAlternativa(texto: string): boolean {
  return /^(sim|pode|pode mostrar|quero|quero ver|mostra|mostre|vamos|bora)( por favor)?$/.test(normalizar(texto));
}
