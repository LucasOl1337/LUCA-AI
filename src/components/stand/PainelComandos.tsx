import { COMANDOS_VOZ, type ComandoVoz } from '../../../shared/stand/comandos-voz.ts';

/**
 * Painel "Experimente pedir" ao lado da coruja: o que o visitante pode falar e
 * o que acontece. Vem da mesma lista que vai ao prompt do cérebro
 * (`shared/stand/comandos-voz.ts`), então só mostra pedido que funciona.
 */
export function PainelComandos({ comandos = COMANDOS_VOZ }: { comandos?: readonly ComandoVoz[] }) {
  return (
    <aside className="stand-comandos" aria-label="O que pedir ao LUCA">
      <p className="stand-comandos-titulo">Experimente pedir</p>
      <ul className="stand-comandos-lista">
        {comandos.map((c) => (
          <li key={c.id} className="stand-comando" data-comando={c.id} aria-label={c.titulo}>
            <span className="stand-comando-exemplo">“{c.exemplo}”</span>
            <span className="stand-comando-faz">{c.faz}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
