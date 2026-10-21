// Sockets /ws presos à sessão que os abriu (B1 da revisão do trem): quando a
// sessão deixa de valer no servidor (logout, saída do modo suporte, expiração,
// teto de sessões por conta), os sockets dela fecham na hora, e não só no
// próximo handshake. Sockets de outras sessões da mesma conta não mudam.

/** Faixa 4000–4999 é da aplicação; 4401 = "401 no meio da conexão". */
export const WS_SESSAO_ENCERRADA = 4401;
export const WS_SESSAO_ENCERRADA_MOTIVO = 'sessao_encerrada';
/** A expiração também fecha sockets, sem esperar alguém entrar para limpar. */
export const VARREDURA_EXPIRADAS_MS = 60_000;

/** Fecha os sockets cujas sessões saíram; devolve quantos fechou. */
export function fecharSocketsDasSessoes(clientes, idsDeSessao) {
  let fechados = 0;
  for (const socket of clientes) {
    if (!socket.sessionId || !idsDeSessao.has(socket.sessionId)) continue;
    if (socket.readyState !== 0 && socket.readyState !== 1) continue;
    socket.close(WS_SESSAO_ENCERRADA, WS_SESSAO_ENCERRADA_MOTIVO);
    fechados += 1;
  }
  return fechados;
}
