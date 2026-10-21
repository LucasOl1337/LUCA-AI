// Heartbeat do /ws (A1 da revisão do item 1, noite 20/10). Sem ele, um socket
// meio-aberto (tablet ou totem que perdeu o Wi-Fi sem FIN, notebook que
// hibernou) segue OPEN no servidor, ocupa vaga do teto por conta (ws-limites.js)
// e o aparelho que volta leva 1013 em loop até o TCP morrer sozinho.
//
// Padrão do `ws`: a cada intervalo, quem não respondeu ao ping anterior leva
// terminate() e os outros recebem ping novo. O navegador responde pong sozinho.

export const WS_PULSO_MS_PADRAO = 30_000;

/** `LUCA_WS_PULSO_MS`: só para teste (intervalo curto); vazio ou inválido usa 30 s. */
export function lerPulsoMs(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 50 ? numero : WS_PULSO_MS_PADRAO;
}

/** No `connection`: o socket nasce vivo e cada pong o marca vivo de novo. */
export function marcarVivo(socket) {
  socket.vivo = true;
  socket.on('pong', () => { socket.vivo = true; });
}

/** Um tique: derruba quem não respondeu desde o último ping e pinga os demais. Devolve quantos caíram. */
export function varrerPulso(clientes) {
  let derrubados = 0;
  for (const socket of clientes) {
    if (socket.vivo === false) {
      socket.terminate();
      derrubados += 1;
      continue;
    }
    socket.vivo = false;
    try { socket.ping(); } catch { /* socket fechando: o próximo tique resolve */ }
  }
  return derrubados;
}

/** Liga o tique no servidor; o intervalo some no `close` do WebSocketServer. */
export function ligarPulso(wss, intervaloMs = WS_PULSO_MS_PADRAO) {
  const tique = setInterval(() => varrerPulso(wss.clients), intervaloMs);
  tique.unref?.();
  wss.on('close', () => clearInterval(tique));
  return tique;
}
