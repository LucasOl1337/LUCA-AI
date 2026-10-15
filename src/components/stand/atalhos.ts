/** Atalhos de teclado da equipe do stand (teclado escondido atrás do monitor). */

export interface AtalhosStand {
  encerrar(): void;
  reiniciar(): void;
  pularVideo(): void;
  demonstrar(): void;
  alternarGrade(): void;
  alternarTelaCheia(): void;
  sair(): void;
}

type Tecla = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>;

/** Devolve true quando a tecla foi usada. */
export function tratarTecla(evento: Tecla, atalhos: AtalhosStand): boolean {
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return false;
  const tecla = evento.key.toLowerCase();
  if (tecla === 'escape') atalhos.encerrar();
  else if (tecla === 'q' && evento.shiftKey) atalhos.sair();
  else if (evento.shiftKey) return false;
  else if (tecla === 'r') atalhos.reiniciar();
  else if (tecla === 'n') atalhos.pularVideo();
  else if (tecla === 'd') atalhos.demonstrar();
  else if (tecla === 'g') atalhos.alternarGrade();
  else if (tecla === 'f') atalhos.alternarTelaCheia();
  else return false;
  return true;
}
