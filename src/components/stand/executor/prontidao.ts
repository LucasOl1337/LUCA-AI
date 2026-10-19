/**
 * O Executor do iframe nasce junto com a página; o BroadcastChannel não guarda
 * mensagem. Antes de mandar a ação, o `/stand` pergunta quem está pronto e em
 * qual caminho (`executor_ping` → `executor_pronto`), repetindo até o prazo.
 */
import { CANAL_STAND } from '../../../../shared/stand/acoes-site.ts';

export interface ExecutorPing { tipo: 'executor_ping' }
export interface ExecutorPronto { tipo: 'executor_pronto'; caminho: string }

const REPETIR_MS = 250;

export function aguardarExecutor(caminho: string, prazoMs = 20_000): Promise<boolean> {
  return new Promise((resolver) => {
    const canal = new BroadcastChannel(CANAL_STAND);
    let repetir = 0;
    const fim = (ok: boolean) => {
      clearInterval(repetir);
      clearTimeout(prazo);
      canal.close();
      resolver(ok);
    };
    const prazo = setTimeout(() => fim(false), prazoMs);
    canal.onmessage = ({ data }) => {
      if (data?.tipo === 'executor_pronto' && data.caminho === caminho) fim(true);
    };
    const perguntar = () => canal.postMessage({ tipo: 'executor_ping' } satisfies ExecutorPing);
    repetir = setInterval(perguntar, REPETIR_MS) as unknown as number;
    perguntar();
  });
}

/** Lado do Executor: responde ao ping com o caminho da página onde está. */
export function responderPing(canal: BroadcastChannel, data: unknown, caminho: string): boolean {
  if ((data as ExecutorPing | null)?.tipo !== 'executor_ping') return false;
  canal.postMessage({ tipo: 'executor_pronto', caminho } satisfies ExecutorPronto);
  return true;
}
