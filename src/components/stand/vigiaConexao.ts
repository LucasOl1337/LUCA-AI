/**
 * Decide quando o stand está offline. Achado B1 (21/10/2026): com a cena 3D do SOMPO a thread
 * principal trava 1,5–2,5 s seguidos e um único `/api/health` passou de 4 s com status 200.
 * O timeout virava "offline", o app inteiro era trocado pela tela offline (a página e a ação
 * morriam) e a saúde seguinte disparava `location.reload()`. Regras:
 *  - evento `offline` do navegador: offline na hora;
 *  - falha de saúde com o navegador online: só depois de FALHAS_PARA_OFFLINE seguidas;
 *  - volta: recarrega só se a página nunca viu o servidor desde o boot (a casca offline
 *    pode não ter o app); quem caiu depois de ter subido online volta sem recarregar.
 */
export const FALHAS_PARA_OFFLINE = 3;
export const TIMEOUT_SAUDE_MS = 8000;

export type Decisao = 'nada' | 'offline' | 'online' | 'recarregar';

export function criarVigiaConexao(onLineInicial: boolean) {
  let offline = !onLineInicial;
  let falhas = 0;
  let jaViuServidor = false;
  return {
    get offline() { return offline; },
    eventoOffline(): Decisao {
      falhas = FALHAS_PARA_OFFLINE;
      if (offline) return 'nada';
      offline = true;
      return 'offline';
    },
    falhaSaude(navegadorOnline: boolean): Decisao {
      falhas += 1;
      if (offline) return 'nada';
      if (navegadorOnline && falhas < FALHAS_PARA_OFFLINE) return 'nada';
      offline = true;
      return 'offline';
    },
    saudeOk(): Decisao {
      falhas = 0;
      const estavaOffline = offline;
      const primeiraVez = !jaViuServidor;
      jaViuServidor = true;
      if (!estavaOffline) return 'nada';
      offline = false;
      return primeiraVez ? 'recarregar' : 'online';
    },
  };
}
