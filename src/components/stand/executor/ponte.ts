/**
 * Ponte da página do stand para o Executor do stand (outra janela do app com `?stand=1`).
 * O cérebro de voz (M1) emite `acao_site` sem id no barramento local; esta função dá um id,
 * posta no BroadcastChannel `luca-stand` e resolve com o resultado que o executor devolver.
 * Uso na página do stand: `assinarEventosCerebro(ev => ev.tipo === 'acao_site' && enviarAcaoSite(ev.acao, ev.args))`.
 */
import { CANAL_STAND, type AcaoSiteResultado } from '../../../../shared/stand/acoes-site.ts';
import { idDoStand, mensagemDoMeuStand } from './escopo';

const PRAZO_MS = 90_000;

export function enviarAcaoSite(acao: string, args: Record<string, unknown> = {}): Promise<AcaoSiteResultado> {
  const id = `acao-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const stand = idDoStand();
  return new Promise((resolver) => {
    const canal = new BroadcastChannel(CANAL_STAND);
    const fim = (resultado: AcaoSiteResultado) => {
      window.clearTimeout(prazo);
      canal.close();
      resolver(resultado);
    };
    const prazo = window.setTimeout(() => fim({
      tipo: 'acao_site_resultado', id, ok: false,
      mensagem: 'O painel não respondeu. Confira se a janela do app está aberta com ?stand=1.',
    }), PRAZO_MS);
    canal.onmessage = ({ data }) => {
      if (data?.tipo === 'acao_site_resultado' && data.id === id && mensagemDoMeuStand(data, stand)) fim(data as AcaoSiteResultado);
    };
    canal.postMessage({ tipo: 'acao_site', id, acao, args, stand });
  });
}
