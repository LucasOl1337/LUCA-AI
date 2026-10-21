/**
 * O Executor do iframe nasce junto com a página; o BroadcastChannel não guarda
 * mensagem. Antes de mandar a ação, o `/stand` pergunta quem está pronto e em
 * qual caminho (`executor_ping` → `executor_pronto`), repetindo até o prazo.
 */
import { CANAL_STAND } from '../../../../shared/stand/acoes-site.ts';
import { idDoStand, mensagemDoMeuStand } from './escopo';

export interface ExecutorPing { tipo: 'executor_ping'; stand?: string }
export interface ExecutorPronto { tipo: 'executor_pronto'; caminho: string; retrato?: string; stand?: string }
/** Executor achado no caminho: o retrato da página quando ele mandou (Totem B3). */
export interface Pronto { retrato?: string }

const REPETIR_MS = 250;

export function aguardarExecutor(caminho: string, prazoMs = 20_000): Promise<false | Pronto> {
  const stand = idDoStand();
  return new Promise((resolver) => {
    const canal = new BroadcastChannel(CANAL_STAND);
    let repetir = 0;
    const fim = (pronto: false | Pronto) => {
      clearInterval(repetir);
      clearTimeout(prazo);
      canal.close();
      resolver(pronto);
    };
    const prazo = setTimeout(() => fim(false), prazoMs);
    canal.onmessage = ({ data }) => {
      if (data?.tipo !== 'executor_pronto' || data.caminho !== caminho || !mensagemDoMeuStand(data, stand)) return;
      fim(typeof data.retrato === 'string' && data.retrato ? { retrato: data.retrato } : {});
    };
    const perguntar = () => canal.postMessage({ tipo: 'executor_ping', stand } satisfies ExecutorPing);
    repetir = setInterval(perguntar, REPETIR_MS) as unknown as number;
    perguntar();
  });
}

/** Lado do Executor: responde ao ping com o caminho da página onde está e o retrato dela. */
export function responderPing(canal: BroadcastChannel, data: unknown, caminho: string, retrato?: () => string, meuStand: string | null = null): boolean {
  if ((data as ExecutorPing | null)?.tipo !== 'executor_ping') return false;
  // Ping de outra janela de /stand: é ping (não é ação), mas não é pra mim.
  if (!mensagemDoMeuStand(data, meuStand)) return true;
  const texto = retrato?.() || undefined;
  canal.postMessage({ tipo: 'executor_pronto', caminho, ...(texto ? { retrato: texto } : {}), ...(meuStand ? { stand: meuStand } : {}) } satisfies ExecutorPronto);
  return true;
}
