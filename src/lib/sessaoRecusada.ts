/**
 * Sessão recusada no meio do uso (ensaio da feira, cenário 6): o /api/state
 * passa a responder 401 e quem sabe disso avisa o AuthProvider, que revalida e
 * leva para o login. Antes só o foco da janela revalidava, e tablet de quiosque
 * não ganha foco: a tela ficava em "SISTEMA OFFLINE" com o usuário antigo.
 */
type Ouvinte = () => void;

/** Close do /ws quando o servidor encerra a sessão (server/ws-sessao.js). */
export const WS_SESSAO_ENCERRADA = 4401;

export function criarSessaoRecusada() {
  const ouvintes = new Set<Ouvinte>();
  return {
    assinar(fn: Ouvinte) {
      ouvintes.add(fn);
      return () => { ouvintes.delete(fn); };
    },
    /** Só 401/403 contam; queda de rede e 5xx não derrubam a sessão. */
    avisar(status: number) {
      if (status !== 401 && status !== 403) return false;
      for (const fn of [...ouvintes]) fn();
      return true;
    },
    /**
     * O /ws fechou com 4401: a sessão caiu no servidor. Revalida já, sem esperar
     * os 3 s do religador e o 401 do /api/state. Outros códigos são queda comum.
     */
    avisarFechamentoWs(codigo: number) {
      return codigo === WS_SESSAO_ENCERRADA ? this.avisar(401) : false;
    },
  };
}

export const sessaoRecusada = criarSessaoRecusada();
