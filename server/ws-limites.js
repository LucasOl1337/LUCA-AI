// Teto de sockets /ws por conta (B2 da revisão do trem). Sem teto, uma aba em
// loop ou um script com o cookie abria sockets sem fim, e cada um recebe o
// `state` inteiro a cada mudança. O padrão de 8 cobre totem + tablets + painel.

export const WS_MAX_POR_CONTA_PADRAO = 8;
/** 1013 "Try Again Later": recusa temporária, o cliente religa no ritmo normal. */
export const WS_LIMITE_CODIGO = 1013;

/** `LUCA_WS_MAX_POR_CONTA`: inteiro ≥ 1; vazio ou inválido cai no padrão. */
export function lerMaxPorConta(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 ? numero : WS_MAX_POR_CONTA_PADRAO;
}

export function motivoDoLimite(max) {
  return `limite de ${max} conexoes por conta`;
}

/**
 * Chamado no `connection`, quando `socket` já está em `clientes`. Conta só os
 * abertos da mesma conta (os que estão fechando já liberaram a vaga) e fecha o
 * novo com 1013 se passou do teto. Devolve true quando recusou.
 */
export function recusarAcimaDoLimite(socket, clientes, max) {
  let abertos = 0;
  for (const outro of clientes) {
    if (outro !== socket && outro.userId === socket.userId && outro.readyState === 1) abertos += 1;
  }
  if (abertos < max) return false;
  socket.close(WS_LIMITE_CODIGO, motivoDoLimite(max));
  return true;
}
