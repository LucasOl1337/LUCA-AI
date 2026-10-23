/** Contrato do input da cabine, compartilhado pelo leitor e pela apresentação. */
export const COMANDOS_CABINE = {
  acelerar: { botao: 7, ps: 'R2', xbox: 'RT', teclas: ['w', 'ArrowUp'] },
  frear: { botao: 6, ps: 'L2', xbox: 'LT', teclas: ['s', 'ArrowDown', ' '] },
  esquerda: { eixo: 0, teclas: ['a', 'ArrowLeft'] },
  direita: { eixo: 0, teclas: ['d', 'ArrowRight'] },
  pausa: { botao: 9, ps: 'Options', xbox: 'Menu', teclas: ['Escape', 'F1'] },
  confirmar: { botao: 0, ps: '✕', xbox: 'A', teclas: ['Enter'] },
  coruja: { botao: 16, ps: 'PS', xbox: 'Guia', teclas: [] },
  camera: { disponivel: false, botao: 0, ps: '✕', xbox: 'A', teclas: ['c'] },
  falar: { disponivel: true, botao: 4, ps: 'L1', xbox: 'LB', teclas: ['v'] },
} as const;

export type EntradaCabine = 'teclado' | 'ps' | 'xbox';
export function familiaControle(id: string): Exclude<EntradaCabine, 'teclado'> {
  return /dualsense|dualshock|playstation|sony|054c/i.test(id) ? 'ps' : 'xbox';
}
export function setaDoComando(tecla: string): 'cima' | 'baixo' | 'esquerda' | 'direita' | null {
  const k = tecla.toLowerCase();
  const inclui = (teclas: readonly string[]) => teclas.some(t => t.toLowerCase() === k);
  if (inclui(COMANDOS_CABINE.acelerar.teclas)) return 'cima';
  if (inclui(COMANDOS_CABINE.frear.teclas)) return 'baixo';
  if (inclui(COMANDOS_CABINE.esquerda.teclas)) return 'esquerda';
  if (inclui(COMANDOS_CABINE.direita.teclas)) return 'direita';
  return null;
}
export function atalhoFalaCabine(entrada: EntradaCabine) {
  return entrada === 'teclado' ? COMANDOS_CABINE.falar.teclas[0].toUpperCase() : COMANDOS_CABINE.falar[entrada];
}
export function rotuloTecla(tecla: string) {
  return ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ' ': 'Espaço', Escape: 'Esc' } as Record<string, string>)[tecla] ?? tecla.toUpperCase();
}
