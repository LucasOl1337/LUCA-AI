import type { FimSessao } from '../../stand-voz/sessaoVoz';

/** Textos da Atração conforme o estado da sessão de voz (M1). Funções puras. */

type Fim = { motivo: FimSessao; detalhe?: string } | null;

/** Resposta de `GET /api/stand/status` que interessa à tela. */
export interface StatusStand { ligado: boolean; motivo?: string | null }

export type VozStand = 'carregando' | 'ligada' | 'desligada';

/**
 * A voz vale pro público? Segue o status do servidor (ligado + motivo, inclusive
 * `teto_diario`) e a última sessão: um 503 `stand_desligado` desliga até o próximo status.
 */
export function vozDoStand(status: StatusStand | null, fim: Fim): VozStand {
  if (fim?.motivo === 'desligado') return 'desligada';
  if (!status) return 'carregando';
  return status.ligado ? 'ligada' : 'desligada';
}

/** Chamada da Atração sem voz (grill r1, Q12): nada de microfone. */
export function chamadaSemVoz(controleConectado: boolean): { titulo: string; sub: string } {
  return controleConectado
    ? { titulo: 'Pega o controle e aperta R1', sub: 'ou toca aqui' }
    // U+2011 (hífen inseparável): "LUCA-" e "AI" não se separam na quebra de linha.
    : { titulo: 'Toca aqui pra ver o LUCA\u2011AI em ação', sub: '' };
}

/** Linha de baixo da chamada, para o público. Nunca mostra erro técnico. */
export function chamadaDeInicio(ativa: boolean, fim: Fim): string {
  if (ativa) return 'Ligando o microfone…';
  if (fim?.motivo === 'desligado') return 'Ele explica como a IA acompanha o trator no campo.';
  return 'Toca na tela pra começar a conversa.';
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
