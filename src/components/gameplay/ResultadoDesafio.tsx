import { textoResultado, type ResultadoDesafio as Resultado } from './desafios';
import './painelCabine.css';

/**
 * Resultado do desafio: 10 s com três números e uma frase, sem ranking e sem
 * nome. Quem conta os 10 s e volta para a abertura é o desafio.
 */
export function ResultadoDesafio({ resultado, restanteS }: { resultado: Resultado; restanteS?: number }) {
  const texto = textoResultado(resultado);
  return (
    <section className="gameplay-resultado" data-desfecho={resultado.desfecho} aria-label="Resultado do desafio" aria-live="assertive">
      <span className="gameplay-painel-selo">SIMULADO</span>
      <h2>{texto.titulo}</h2>
      <ul>{texto.linhas.map((linha) => <li key={linha}>{linha}</li>)}</ul>
      <p>{texto.frase}</p>
      {restanteS !== undefined && <small>Recomeça em {Math.max(0, Math.ceil(restanteS))} s</small>}
    </section>
  );
}

/** Linha única dos 4 s de abertura. */
export function AberturaDesafio({ texto }: { texto: string }) {
  return (
    <section className="gameplay-abertura" aria-live="polite">
      <span className="gameplay-painel-selo">SIMULADO</span>
      <p>{texto}</p>
    </section>
  );
}
