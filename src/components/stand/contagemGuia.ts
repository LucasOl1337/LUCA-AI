/**
 * Contagem da guia da Simulação (Lucas, 24/10: "deveria mostrar os controles,
 * mas após uns 5 segundos começar já, pois o sentido todo do totem é não
 * precisar ficar clicando").
 *
 * A guia mostra os comandos e conta 5…4…3…2…1; no zero a corrida começa
 * sozinha. Botão, Enter ou ✕/A começam antes; sair da Simulação durante a
 * contagem cancela (quem chama dá `parar()` ao desmontar). Puro sobre
 * `setInterval`, pra testar com relógio falso.
 */

export const GUIA_AUTOINICIO_MS = 5_000;
const PASSO_MS = 250;

export interface ContagemGuia {
  /** Segundos que faltam (arredondado pra cima), como mostra a tela. */
  restante(): number;
  /** Começa já (gesto). Só a primeira chamada (gesto ou zero) vale. */
  comecarAgora(): void;
  /** Cancela sem começar (saiu da Simulação). */
  parar(): void;
}

export function criarContagemGuia({ totalMs = GUIA_AUTOINICIO_MS, aoMudar, aoComecar, agora = () => Date.now() }: {
  totalMs?: number;
  aoMudar?(segundos: number): void;
  aoComecar(): void;
  agora?: () => number;
}): ContagemGuia {
  const inicio = agora();
  let feito = false;
  let ultimo = Math.ceil(totalMs / 1000);
  const restante = () => (feito ? 0 : Math.max(0, Math.ceil((totalMs - (agora() - inicio)) / 1000)));
  const encerrar = () => { feito = true; clearInterval(timer); };
  const comecarAgora = () => {
    if (feito) return;
    encerrar();
    aoComecar();
  };
  const timer = setInterval(() => {
    if (feito) return;
    if (agora() - inicio >= totalMs) { comecarAgora(); return; }
    const s = restante();
    if (s !== ultimo) { ultimo = s; aoMudar?.(s); }
  }, PASSO_MS);
  return { restante, comecarAgora, parar: encerrar };
}
