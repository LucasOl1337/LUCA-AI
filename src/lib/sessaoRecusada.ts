/**
 * Sessão recusada no meio do uso (ensaio da feira, cenário 6): o /api/state
 * passa a responder 401 e quem sabe disso avisa o AuthProvider, que revalida e
 * leva para o login. Antes só o foco da janela revalidava, e tablet de quiosque
 * não ganha foco: a tela ficava em "SISTEMA OFFLINE" com o usuário antigo.
 */
type Ouvinte = () => void;

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
  };
}

export const sessaoRecusada = criarSessaoRecusada();
