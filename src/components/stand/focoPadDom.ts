import { primeiroItem, proximoNaDirecao, type Caixa, type Direcao } from './focoPad';

/**
 * Foco do DualSense na página do Totem (o puro está em `focoPad.ts`).
 *
 * Escopo: o diálogo de cima (menu do Totem, pausa e resultado da corrida, chat da
 * corrida: `[aria-modal]`, `[role=dialog]` ou `[data-foco-escopo]`); sem diálogo,
 * a tela inteira do stand, incluindo a página do Site no iframe (mesma origem).
 * Na Simulação, sem diálogo não há foco: o D-pad e o ✕ ficam com o jogo.
 *
 * Marcações nos componentes:
 * - `data-pad-voltar`: o que ○ aperta naquele escopo (fechar, voltar, continuar);
 * - `data-pad-pointer`: botão que age no pointerdown (a barra), não no click;
 * - `data-foco-pular`: fora da navegação (setas de toque da cabine).
 */

const SELETOR = 'button, a[href], [role="button"], select, summary, input[type="checkbox"], input[type="radio"], [tabindex]';
const ESCOPOS = '[aria-modal="true"], [role="dialog"], [data-foco-escopo]';
const MARCA = 'data-foco-pad';
const ESTILO = `[${MARCA}]{outline:4px solid #ffd21f!important;outline-offset:3px!important;box-shadow:0 0 0 9px rgba(255,210,31,.28)!important;border-radius:10px}`;

let atual: HTMLElement | null = null;
/** Último ✕ que o foco consumiu: o laço do simulador não repete a ação no mesmo aperto. */
let consumiuEm = -Infinity;

function visivel(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  if (el.closest('[aria-hidden="true"], [inert], [data-foco-pular]')) return false;
  const estilo = el.ownerDocument.defaultView?.getComputedStyle(el);
  return !estilo || (estilo.visibility !== 'hidden' && estilo.display !== 'none' && Number(estilo.opacity) > 0.05);
}

function usavel(el: Element): el is HTMLElement {
  const h = el as HTMLElement;
  if (h.getAttribute('tabindex') === '-1' || h.hasAttribute('disabled') || h.getAttribute('aria-disabled') === 'true') return false;
  return visivel(el);
}

function escopoDe(doc: Document): Element | null {
  const abertos = [...doc.querySelectorAll(ESCOPOS)].filter(visivel);
  return abertos.find((el) => el.getAttribute('aria-modal') === 'true') ?? abertos[abertos.length - 1] ?? null;
}

interface Item { el: HTMLElement; caixa: Caixa }

function itensDe(raiz: ParentNode, deslocamento = { x: 0, y: 0 }): Item[] {
  return [...raiz.querySelectorAll(SELETOR)].filter(usavel).map((el) => {
    const r = el.getBoundingClientRect();
    return { el, caixa: { x: r.left + deslocamento.x, y: r.top + deslocamento.y, w: r.width, h: r.height } };
  });
}

/** O iframe do Site (mesma origem) entra na navegação; o escopo de dentro dele também manda. */
function itensDoSite(frame: HTMLIFrameElement): Item[] {
  let doc: Document | null = null;
  try { doc = frame.contentDocument; } catch { return []; }
  if (!doc) return [];
  const r = frame.getBoundingClientRect();
  return itensDe(escopoDe(doc) ?? doc, { x: r.left, y: r.top });
}

/** Itens navegáveis agora; `null` = não há o que focar (Simulação sem diálogo). */
export function itensDoFoco(doc: Document = document, exigeDialogo = false): Item[] | null {
  const escopo = escopoDe(doc);
  if (escopo) return itensDe(escopo);
  if (exigeDialogo) return null;
  const raiz = doc.querySelector('.stand') ?? doc.body;
  const frames = [...raiz.querySelectorAll('iframe')].filter(visivel);
  return [...itensDe(raiz), ...frames.flatMap(itensDoSite)];
}

function garantirEstilo(doc: Document) {
  if (doc.querySelector('style[data-foco-pad-estilo]')) return;
  const estilo = doc.createElement('style');
  estilo.setAttribute('data-foco-pad-estilo', '');
  estilo.textContent = ESTILO;
  doc.head.appendChild(estilo);
}

function marcar(el: HTMLElement | null) {
  if (atual && atual !== el) atual.removeAttribute(MARCA);
  atual = el;
  if (!el) return;
  garantirEstilo(el.ownerDocument);
  el.setAttribute(MARCA, '');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function limparFocoPad() { marcar(null); }

/** O foco que a pessoa levou com o D-pad ainda está na tela (e no escopo de agora). */
export function focoPadExplicito(doc: Document = document, exigeDialogo = false): boolean {
  if (!atual || !atual.isConnected || !usavel(atual)) return false;
  const itens = itensDoFoco(doc, exigeDialogo);
  return !!itens?.some((i) => i.el === atual);
}

/** ✕ consumido pelo foco agora há pouco (o simulador ignora o mesmo aperto). */
export function padConsumiuConfirmar(agora = performance.now()) { return agora - consumiuEm < 350; }

/** Rola a lista longa (chat da corrida) quando não há mais item naquela direção. */
function rolar(direcao: Direcao, base: Element | null) {
  if (direcao !== 'cima' && direcao !== 'baixo') return;
  let el: Element | null = base;
  while (el && el instanceof HTMLElement) {
    if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) break;
    el = el.parentElement;
  }
  const alvo = el instanceof HTMLElement ? el : document.scrollingElement;
  alvo?.scrollBy({ top: (direcao === 'baixo' ? 1 : -1) * window.innerHeight * 0.4, behavior: 'smooth' });
}

/** D-pad: primeiro aperto acende o item de cima (ou o já focado); os seguintes andam na direção. */
export function moverFocoPad(direcao: Direcao, doc: Document = document, exigeDialogo = false): boolean {
  const itens = itensDoFoco(doc, exigeDialogo);
  if (!itens?.length) { limparFocoPad(); return false; }
  const caixas = itens.map((i) => i.caixa);
  let indice = itens.findIndex((i) => i.el === atual);
  if (indice < 0) {
    const ativo = itens.findIndex((i) => i.el === doc.activeElement);
    marcar(itens[ativo >= 0 ? ativo : primeiroItem(caixas) ?? 0].el);
    return true;
  }
  const proximo = proximoNaDirecao(caixas, indice, direcao);
  if (proximo === null) { rolar(direcao, escopoDe(doc) ?? atual); return true; }
  indice = proximo;
  marcar(itens[indice].el);
  return true;
}

function apertar(el: HTMLElement) {
  consumiuEm = performance.now();
  if (el.hasAttribute('data-pad-pointer')) {
    const Evento = el.ownerDocument.defaultView?.PointerEvent ?? PointerEvent;
    el.dispatchEvent(new Evento('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true }));
    return;
  }
  el.click();
}

/**
 * Acende o item com foco do diálogo, ou o primeiro que não seja o voltar/fechar (menu aberto pelo △,
 * grupo novo do menu): quem chega pelo controle já cai na primeira opção.
 */
export function acenderPrimeiroPad(doc: Document = document, exigeDialogo = false): boolean {
  const itens = itensDoFoco(doc, exigeDialogo)?.filter((i) => !i.el.hasAttribute('data-pad-voltar'));
  if (!itens?.length) return false;
  // O diálogo que já escolheu o próprio foco (autoFocus: "Sim, sair") manda.
  const ativo = itens.findIndex((i) => i.el === doc.activeElement);
  const primeiro = ativo >= 0 ? ativo : primeiroItem(itens.map((i) => i.caixa));
  marcar(itens[primeiro ?? 0].el);
  return true;
}

/** ✕ com foco do D-pad: aperta o item focado. Sem foco explícito, devolve false (o modo decide). */
export function confirmarFocoPad(doc: Document = document, exigeDialogo = false): boolean {
  if (!atual || !focoPadExplicito(doc, exigeDialogo)) return false;
  const apertado = atual;
  apertar(apertado);
  // O item sumiu e o diálogo ficou (entrou num grupo, trocou de passo): o foco segue no primeiro item novo.
  const view = doc.defaultView ?? window;
  view.requestAnimationFrame(() => view.requestAnimationFrame(() => {
    if (atual === apertado && !apertado.isConnected && escopoDe(doc)) acenderPrimeiroPad(doc, exigeDialogo);
  }));
  return true;
}

/** ○: aperta o `[data-pad-voltar]` do escopo de cima, se houver. */
export function voltarNoEscopoPad(doc: Document = document): boolean {
  const escopo = escopoDe(doc);
  const alvo = [...(escopo ?? doc).querySelectorAll('[data-pad-voltar]')].find(usavel);
  if (!alvo) return false;
  limparFocoPad();
  apertar(alvo);
  return true;
}
