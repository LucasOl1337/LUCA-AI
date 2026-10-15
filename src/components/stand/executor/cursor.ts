/**
 * Mão visível da IA: cursor grande, anel de destaque no Alvo e rótulo da Ação
 * do site. Tudo em `position: fixed` com `pointer-events: none`, por cima do app.
 */

export interface CursorElementos {
  cursor: HTMLElement;
  anel: HTMLElement;
  rotulo: HTMLElement;
}

const esperar = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function posicaoCursor(el: HTMLElement): { x: number; y: number } {
  return { x: Number(el.dataset.x ?? window.innerWidth / 2), y: Number(el.dataset.y ?? window.innerHeight / 2) };
}

function colocar(el: HTMLElement, x: number, y: number) {
  el.dataset.x = String(x);
  el.dataset.y = String(y);
  el.style.transform = `translate(${x}px, ${y}px)`;
}

/** Anda do ponto atual até (x, y). A duração cresce com a distância, entre 450 e 1100 ms. */
export function moverCursor(el: HTMLElement, x: number, y: number): Promise<void> {
  const de = posicaoCursor(el);
  const distancia = Math.hypot(x - de.x, y - de.y);
  const ms = Math.min(1100, 450 + distancia * 0.6);
  return new Promise((resolve) => {
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / ms);
      const k = suave(t);
      colocar(el, de.x + (x - de.x) * k, de.y + (y - de.y) * k);
      if (t < 1) requestAnimationFrame(passo);
      else resolve();
    };
    requestAnimationFrame(passo);
  });
}

export function destacar(anel: HTMLElement, alvo: Element | null) {
  if (!alvo) {
    anel.style.opacity = '0';
    return;
  }
  const r = alvo.getBoundingClientRect();
  const folga = 6;
  anel.style.opacity = '1';
  anel.style.transform = `translate(${r.left - folga}px, ${r.top - folga}px)`;
  anel.style.width = `${r.width + folga * 2}px`;
  anel.style.height = `${r.height + folga * 2}px`;
}

/** Rola o Alvo para a vista, leva o cursor ao centro dele e acende o anel. */
export async function apontar(els: CursorElementos, alvo: HTMLElement) {
  alvo.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  await esperar(350);
  const r = alvo.getBoundingClientRect();
  destacar(els.anel, alvo);
  await moverCursor(els.cursor, r.left + r.width / 2, r.top + r.height / 2);
  destacar(els.anel, alvo);
}

/** Pulso visual do clique; o clique de verdade é de quem chama. */
export async function pulsar(els: CursorElementos) {
  els.cursor.classList.add('is-clicking');
  await esperar(180);
  els.cursor.classList.remove('is-clicking');
}

export function mostrarRotulo(rotulo: HTMLElement, texto: string) {
  rotulo.textContent = texto;
  rotulo.style.opacity = texto ? '1' : '0';
}
