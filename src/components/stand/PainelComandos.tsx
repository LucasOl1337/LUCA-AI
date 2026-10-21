import type { PointerEvent } from 'react';
import { COMANDOS_VOZ } from '../../../shared/stand/comandos-voz.ts';
import { CATALOGO, type GrupoCatalogo } from '../../../shared/stand/catalogo.ts';

const EXEMPLO = Object.fromEntries(COMANDOS_VOZ.map((c) => [c.id, c.exemplo]));

/**
 * Painel ao lado da coruja: os grupos do catálogo comum, tocáveis (grill Totem
 * interativo r1, Q1). Os ids são os de `COMANDOS_VOZ` (mesma lista do prompt do
 * cérebro), então o que a pessoa toca é o que ela também pode pedir falando.
 * Um toque abre as opções do grupo no menu.
 */
export function PainelComandos({ grupos = CATALOGO, voz = true, aoEscolher }: { grupos?: readonly GrupoCatalogo[]; voz?: boolean; aoEscolher(id: string): void }) {
  const parar = (evento: PointerEvent) => evento.stopPropagation();
  return (
    <aside className="stand-comandos" aria-label="O que fazer no LUCA" onPointerDown={parar}>
      <p className="stand-comandos-titulo">{voz ? 'Toque ou peça' : 'Toque para ver'}</p>
      <ul className="stand-comandos-lista">
        {grupos.map((g) => (
          <li key={g.id}>
            <button type="button" className="stand-comando" data-comando={g.id} onClick={() => aoEscolher(g.id)}>
              <span className="stand-comando-exemplo">{g.titulo}</span>
              <span className="stand-comando-faz">{voz && EXEMPLO[g.id] ? `“${EXEMPLO[g.id]}”` : g.faz}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
