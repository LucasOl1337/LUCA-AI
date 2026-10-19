import type { FimSessao } from '../../stand-voz/sessaoVoz';
import type { EstadoEscuta } from '../../stand-voz/useEscuta';

/** Textos da Atração conforme o estado da sessão de voz (M1). Funções puras. */

type Fim = { motivo: FimSessao; detalhe?: string; em?: number; naAbertura?: boolean } | null;

/** Depois de a voz cair na abertura, o stand fica no modo sem voz por este tempo e tenta de novo. */
export const PAUSA_APOS_FALHA_MS = 60_000;

/** Resposta de `GET /api/stand/status` que interessa à tela. */
export interface StatusStand { ligado: boolean; motivo?: string | null; escuta?: boolean }

export type VozStand = 'carregando' | 'ligada' | 'desligada';

/**
 * A voz vale pro público? Segue o status do servidor (ligado + motivo, inclusive
 * `teto_diario`) e a última sessão: um 503 `stand_desligado` desliga até o próximo status.
 */
export function vozDoStand(status: StatusStand | null, fim: Fim, agora = Date.now()): VozStand {
  if (fim?.motivo === 'desligado') return 'desligada';
  if (caiuNaAbertura(fim, agora)) return 'desligada';
  if (!status) return 'carregando';
  return status.ligado ? 'ligada' : 'desligada';
}

function caiuNaAbertura(fim: Fim, agora: number): boolean {
  return Boolean(fim?.motivo === 'erro' && fim.naAbertura && agora - (fim.em ?? 0) < PAUSA_APOS_FALHA_MS);
}

/**
 * Escuta ligada no stand: voz ligada e `escuta` no status do servidor (`STAND_ESCUTA` ≠ 0).
 * Sinal único para a Escuta (Totem-Voz) e para a Vitrine muda (Totem-Tela). Nunca no stub.
 */
export function escutaNoStand(status: StatusStand | null, voz: VozStand, stub = false): boolean {
  return !stub && voz === 'ligada' && Boolean(status?.escuta);
}

/**
 * Motivo do modo sem voz, para a equipe e para os testes (`data-motivo` no
 * `<main>`): o motivo do servidor, `desligado:<detalhe>` ou `erro:<detalhe>`.
 * Vazio com voz.
 */
export function motivoSemVoz(status: StatusStand | null, fim: Fim, agora = Date.now()): string {
  if (fim?.motivo === 'desligado') return `desligado:${fim.detalhe || 'stand_desligado'}`;
  if (caiuNaAbertura(fim, agora)) return `erro:${fim?.detalhe || 'erro'}`;
  if (status && !status.ligado) return status.motivo || 'stand_desligado';
  return '';
}

/** Chamada da Atração sem voz (grill r1, Q12): nada de microfone. */
export function chamadaSemVoz(controleConectado: boolean): { titulo: string; sub: string } {
  return controleConectado
    ? { titulo: 'Pega o controle e aperta R1', sub: 'ou toca aqui' }
    // U+2011 (hífen inseparável): "LUCA-" e "AI" não se separam na quebra de linha.
    : { titulo: 'Toca aqui pra ver o LUCA\u2011AI em ação', sub: '' };
}

/**
 * Linha de baixo da chamada, para o público. Nunca mostra erro técnico.
 * O estado distingue a abertura automática do bloqueio que exige toque.
 */
export function chamadaDeInicio(ativa: boolean, fim: Fim, escuta: EstadoEscuta = 'desligada'): string {
  if (escuta === 'ajuda_microfone') return 'Permita o microfone pra conversar com o LUCA.';
  if (escuta === 'abrindo') return 'Ligando o microfone…';
  const escutando = escuta === 'ouvindo' || escuta === 'conversa';
  if (ativa) return escutando ? 'Pode falar, tô ouvindo.' : 'Ligando o microfone…';
  if (escutando) return 'É só falar que eu escuto.';
  if (fim?.motivo === 'desligado') return 'Ele explica como a IA acompanha o trator no campo.';
  return 'Toca na tela pra começar a conversa.';
}

/** Estados da Escuta com o microfone aberto (o público precisa saber). */
const ESCUTA_ABERTA = ['ouvindo', 'pausada', 'conversa'];

/**
 * Linha fixa do rodapé (r4 Q4): com a Escuta aberta, avisa que o LUCA só ouve quem fala com ele.
 * Some quando há conversa na tela, para não disputar com a legenda.
 */
export function linhaDaEscuta(estadoEscuta: string, tela: string): string {
  if (!ESCUTA_ABERTA.includes(estadoEscuta) || tela !== 'atracao') return '';
  return 'O LUCA só ouve quando você fala com ele.';
}

/** Aviso pequeno no rodapé, para a equipe do stand. Vazio quando não há o que avisar. */
export function avisoParaEquipe(fim: Fim, status: StatusStand | null = null): string {
  if (status && !status.ligado && fim?.motivo !== 'desligado') return `voz desligada no servidor (${status.motivo || 'stand_desligado'})`;
  if (!fim) return '';
  if (fim.motivo === 'desligado' && fim.detalhe === 'teto_diario') return 'voz pausada: teto diário de créditos atingido · volta à meia-noite';
  if (fim.motivo === 'desligado') return `voz desligada no servidor (${fim.detalhe || 'stand_desligado'})`;
  if (fim.motivo === 'erro') return `voz caiu: ${fim.detalhe || 'erro'} · espaço tenta de novo`;
  return '';
}

/**
 * Controle conectado sem mapping standard: o navegador não sabe onde está cada
 * botão e o stand ignora o controle. Diz à equipe o que fazer (cabo USB do DualSense).
 */
export function avisoDeControle(idDesconhecido: string | null): string {
  if (!idDesconhecido) return '';
  const nome = idDesconhecido.replace(/\s*\(.*$/, '').trim().slice(0, 40) || 'controle';
  return `controle não reconhecido (${nome}) · use o DualSense no cabo USB`;
}
