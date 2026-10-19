import { useEffect, useRef, useState } from 'react';
import { firstStandardPad } from '../sompo/gamepadLoop';
import type { GamepadLike } from '../sompo/gamepadMapping';
import { lerNavegacao, type AcaoNavegacao } from './navegacaoPad';
import type { Modo } from './modoStand';

/** Atividade do controle vira no máximo um aviso por segundo (evita render a cada quadro). */
const ATIVIDADE_MS = 1000;

/**
 * Lê o controle a cada quadro para navegar entre os modos do stand. Roda junto
 * com o laço do simulador (que lê os botões dele); cada um ignora os do outro.
 * Devolve se há controle com mapping standard conectado.
 */
export function usePadStand({ modo, aoAgir, aoMexer }: {
  modo: Modo;
  aoAgir: (acao: AcaoNavegacao) => void;
  aoMexer: () => void;
}) {
  const [conectado, setConectado] = useState(false);
  const ref = useRef({ modo, aoAgir, aoMexer });
  ref.current = { modo, aoAgir, aoMexer };

  useEffect(() => {
    let quadro = 0;
    let anterior = { pressed: [] as readonly number[] };
    let estava = false;
    let ultimaAtividade = -Infinity;
    const tick = (agora: number) => {
      const pad = firstStandardPad();
      if (!!pad !== estava) { estava = !!pad; setConectado(estava); }
      const leitura = lerNavegacao(pad as GamepadLike | null, anterior, ref.current.modo);
      anterior = leitura.next;
      if (leitura.ativo && agora - ultimaAtividade >= ATIVIDADE_MS) {
        ultimaAtividade = agora;
        ref.current.aoMexer();
      }
      for (const acao of leitura.acoes) ref.current.aoAgir(acao);
      quadro = window.requestAnimationFrame(tick);
    };
    quadro = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(quadro);
  }, []);

  return conectado;
}
