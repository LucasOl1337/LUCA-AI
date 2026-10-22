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

export const COMANDOS_VOZ: readonly ComandoVoz[] = Object.freeze(([
  {
    id: 'vitrine',
    titulo: 'Ver a vitrine',
    exemplo: 'Quero ver a vitrine',
    faz: 'Abre a mesma Vitrine do botão',
    ferramentas: ['abrir_vitrine'],
  },
  {
    id: 'simulacao',
    titulo: 'Dirigir o trator',
    exemplo: 'Quero testar o simulador',
    faz: 'Abre a Simulação: você dirige o trator',
    ferramentas: ['abrir_simulacao'],
  },
  {
    id: 'tour',
    titulo: 'Ver tudo',
    exemplo: 'Me mostra tudo',
    faz: 'Tour guiado de 1 minuto pelo stand',
    ferramentas: ['tour_iniciar'],
  },
  {
    id: 'sonolencia',
    titulo: 'Teste de sono',
    exemplo: 'Testa o alerta de sonolência',
    faz: 'Webcam vê olho fechado e o alerta toca',
    ferramentas: ['sonolencia_ligar_camera', 'sonolencia_desligar_camera', 'sonolencia_testar_som', 'sonolencia_sensibilidade'],
  },
  {
    id: 'sensor',
    titulo: 'Sensor em ação',
    exemplo: 'Faz o trator numa curva',
    faz: 'Trator em curva, encosta, frenada, buraco',
    ferramentas: ['sensor_escolher_veiculo', 'sensor_rodar_ensaio', 'sensor_ajustar', 'sensor_pausar', 'sensor_continuar', 'sensor_mostrar_vista'],
  },
  {
    id: 'fazenda',
    titulo: 'Fazenda em 3D',
    exemplo: 'Mostra o caminhão na fazenda',
    faz: 'Caminhão rodando numa fazenda em 3D',
    ferramentas: ['laboratorio_ver_demonstracao', 'laboratorio_pausar', 'laboratorio_continuar', 'laboratorio_camera'],
  },
  {
    id: 'sompo',
    titulo: 'Painel da Sompo',
    exemplo: 'Roda um cenário de risco',
    faz: 'O que a seguradora vê: casos e riscos',
    ferramentas: ['sompo_abrir_aba', 'sompo_voltar_inicio', 'sompo_abrir_caso', 'sompo_rodar_cenario'],
  },
  {
    id: 'site',
    titulo: 'Abrir o site',
    exemplo: 'Abre a bancada de agentes',
    faz: 'Abre uma página do LUCA-AI na tela',
    ferramentas: ['abrir_pagina'],
  },
  {
    id: 'video',
    titulo: 'Ver um vídeo',
    exemplo: 'Tem um vídeo de como funciona?',
    faz: 'Toca o vídeo que explica o assunto',
    ferramentas: ['tocar_video'],
  },
  {
    id: 'perguntar',
    titulo: 'Tirar dúvidas',
    exemplo: 'O que a seguradora ganha com isso?',
    faz: 'Responde sobre o projeto e pesquisa na web',
    ferramentas: ['buscar_no_repo', 'pesquisar_web'],
  },
  {
    id: 'voltar',
    titulo: 'Voltar',
    exemplo: 'Volta pra coruja',
    faz: 'Fecha a página e volta pra coruja',
    ferramentas: ['voltar_coruja'],
  },
] as ComandoVoz[]).map((item) => Object.freeze(item)));

/** `sensor_pausar, sensor_ajustar...` → `sensor_*` (as descrições completas já vão nas ferramentas). */
function resumirFerramentas(nomes: readonly string[]): string {
  const prefixo = nomes[0]?.split('_')[0];
  return nomes.length > 1 && nomes.every((n) => n.startsWith(`${prefixo}_`)) ? `${prefixo}_*` : nomes.join(', ');
}

/** Seção do prompt do cérebro: o que o painel mostra e qual ferramenta atende cada pedido. */
export function comandosParaPrompt(comandos: readonly ComandoVoz[] = COMANDOS_VOZ): string {
  return [
    'Painel ao lado da coruja: a pessoa vê estes pedidos de exemplo, e todos precisam funcionar com a ferramenta indicada. Quem não sabe o que pedir, convide com um deles.',
    ...comandos.map((c) => `- ${c.titulo} ("${c.exemplo}"): ${resumirFerramentas(c.ferramentas)}`),
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

export type PedidoDireto = 'simulacao' | 'vitrine' | 'animal' | 'obstaculo' | 'voltar' | 'ajuda';

/** Nomes da navegação têm prioridade sobre a escolha probabilística do modelo. */
export function pedidoDireto(texto: string): PedidoDireto | null {
  const frase = normalizar(texto);
  if (!frase || frase.split(' ').length > 18 || /\b(nao|nunca)\b/.test(frase)) return null;
  if (/^(?:por favor )?(?:volta|voltar|volte|sair|sai)(?: pra| para| a| pro| para a| para o)?(?: coruja| inicio)?(?: por favor)?$/.test(frase)) return 'voltar';
  if (/^(como (?:eu )?(?:dirijo|dirige|acelero|freio)|como funciona o controle|(?:me )?ajuda(?: aqui| no simulador)?)$/.test(frase)) return 'ajuda';
  // "Como funciona..." e "o que é..." continuam sendo perguntas, sem navegação.
  if (/\b(como|explica|saber|entender|o que|qual)\b/.test(frase)) return null;
  const pede = /\b(quero|queria|abre|abrir|abra|mostra|mostrar|mostre|ver|veja|testa|testar)\b/.test(frase);
  if (pede && /\bvitrine\b/.test(frase)) return 'vitrine';
  if (pede && /\b(animal|animais|vaca|boi)\b/.test(frase) && /\b(pista|estrada)\b/.test(frase)) return 'animal';
  if (pede && /\b(fardo|obstaculo)\b/.test(frase)) return 'obstaculo';
  return comandoDireto(texto);
}

export function aceitaAlternativa(texto: string): boolean {
  return /^(sim|pode|pode mostrar|quero|quero ver|mostra|mostre|vamos|bora)( por favor)?$/.test(normalizar(texto));
}
