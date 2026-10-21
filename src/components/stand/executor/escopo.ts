/**
 * Escopo do canal `luca-stand` (Totem B, 21/10/2026). O BroadcastChannel alcança toda janela da mesma
 * origem: com duas abas de /stand abertas, o Executor do iframe da outra aba respondia ao ping e
 * executava a ação (prova em produção: `laboratorio_ver_demonstracao` falhou com "Página SOMPO",
 * retrato da outra aba). Cada janela de /stand tem um id; o iframe lê o id do pai (mesma origem) e
 * só atende mensagens com o id dele, e só a resposta com o mesmo id vale pro pai.
 */
const CHAVE = '__lucaStandId';

type ComId = Window & { [CHAVE]?: string };

/** Id desta janela de /stand (criado na primeira chamada). */
export function idDoStand(janela: Window = window): string {
  const alvo = janela as ComId;
  alvo[CHAVE] ??= `stand-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return alvo[CHAVE]!;
}

/** No iframe: id do /stand que o contém (cria no pai se ele ainda não pediu nada), ou null fora de frame/outra origem. */
export function idDoStandPai(janela: Window = window): string | null {
  if (janela.parent === janela) return null;
  try {
    return idDoStand(janela.parent);
  } catch {
    return null;
  }
}

/** Mensagem é pra este Executor? Sem `stand` (versão antiga do pai) continua valendo. */
export function mensagemDoMeuStand(data: unknown, meuStand: string | null): boolean {
  const stand = (data as { stand?: unknown } | null)?.stand;
  return stand === undefined || stand === meuStand;
}
