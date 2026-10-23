import { ehEventoCerebro, ehEventoPagina, type EventoCerebro, type EventoPagina, type EventoStand } from '../../shared/stand/eventos.ts';

/**
 * Barramento local do stand: cérebro (M1) e página (M2) trocam eventos do
 * contrato `shared/stand/eventos.ts` num EventTarget da própria página.
 */
const alvo = new EventTarget();
const NOME = 'luca-stand';
let ultimaTela: Extract<EventoPagina, { tipo: 'tela' }> | null = null;

export function emitirEventoStand(evento: EventoStand): void {
  if (evento.tipo === 'tela') ultimaTela = evento;
  alvo.dispatchEvent(new CustomEvent(NOME, { detail: evento }));
}

function assinar<T extends EventoStand>(filtro: (valor: unknown) => valor is T, cb: (evento: T) => void): () => void {
  const ouvir = (ev: Event) => {
    const detalhe = (ev as CustomEvent).detail;
    if (filtro(detalhe)) cb(detalhe);
  };
  alvo.addEventListener(NOME, ouvir);
  return () => alvo.removeEventListener(NOME, ouvir);
}

/** A página ouve o cérebro: estado, nível de áudio, legenda, vídeo e ação no site. */
export function assinarEventosCerebro(cb: (evento: EventoCerebro) => void): () => void {
  return assinar(ehEventoCerebro, cb);
}

/** O cérebro ouve a página: fim de vídeo, reiniciar e encerrar. */
export function assinarEventosPagina(cb: (evento: EventoPagina) => void): () => void {
  const parar = assinar(ehEventoPagina, cb);
  if (ultimaTela) cb(ultimaTela);
  return parar;
}
