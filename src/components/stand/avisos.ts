import type { FimSessao } from '../../stand-voz/sessaoVoz';

/** Textos da Atração conforme o estado da sessão de voz (M1). Funções puras. */

type Fim = { motivo: FimSessao; detalhe?: string } | null;

/** Linha de baixo da chamada, para o público. Nunca mostra erro técnico. */
export function chamadaDeInicio(ativa: boolean, fim: Fim): string {
  if (ativa) return 'Ligando o microfone…';
  if (fim?.motivo === 'desligado') return 'Ele explica como a IA acompanha o trator no campo.';
  return 'Toca na tela pra começar a conversa.';
}

/** Aviso pequeno no rodapé, para a equipe do stand. Vazio quando não há o que avisar. */
export function avisoParaEquipe(fim: Fim): string {
  if (!fim) return '';
  if (fim.motivo === 'desligado') return `voz desligada no servidor (${fim.detalhe || 'stand_desligado'})`;
  if (fim.motivo === 'erro') return `voz caiu: ${fim.detalhe || 'erro'} · espaço tenta de novo`;
  return '';
}
