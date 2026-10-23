import { useEffect, useRef, useState, type ReactNode } from 'react';
import { somCompartilhado } from '../gameplay/somCompartilhado';
import { ComandosSimulacao } from '../gameplay/ComandosSimulacao';
import { firstStandardPad } from '../sompo/gamepadLoop';
import { BOTOES_NAVEGACAO } from './navegacaoPad';

/** Gesto explícito antes de começar: dá tempo para conhecer os comandos. */
export function GuiaSimulacao({ aoComecar, comVoz }: { aoComecar(): void; comVoz: boolean }) {
  // Ref: o relógio de 500 ms da página re-renderiza o guia; o poller do controle não pode ser recriado (perderia a borda do ✕).
  const comecar = useRef(aoComecar);
  comecar.current = aoComecar;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); comecar.current(); }
    };
    let pressionado = false;
    const timer = window.setInterval(() => {
      const agora = !!firstStandardPad()?.buttons[BOTOES_NAVEGACAO.cruz]?.pressed;
      if (agora && !pressionado) comecar.current();
      pressionado = agora;
    }, 100);
    window.addEventListener('keydown', tecla, true);
    return () => { window.clearInterval(timer); window.removeEventListener('keydown', tecla, true); };
  }, []);
  return <section className="stand-guia-simulacao" aria-label="Antes de dirigir">
    <h1>Antes de dirigir</h1>
    <p>Siga as estacas pelo talhão até a chegada. Desvie do feno e da água; reduza na encosta. Uma única run, até concluir, sofrer um sinistro ou abandonar conscientemente.</p>
    <ComandosSimulacao />
    <p>{comVoz ? 'Para pedir ajuda, fale com o LUCA.' : 'A voz está indisponível agora.'} Esc / Options abre pausa, ajuda, saída e a sonolência opcional, desligada por padrão. PS/Home retorna à Coruja.</p>
    <button type="button" onClick={aoComecar}>Começar · Enter / ✕ / A</button>
  </section>;
}

export function SimulacaoComGuia({ children, comVoz }: { children: ReactNode; comVoz: boolean }) {
  const [pronto, setPronto] = useState(false);
  return pronto ? <>{children}</> : <GuiaSimulacao comVoz={comVoz} aoComecar={() => { void somCompartilhado.destravar(); setPronto(true); }} />;
}
