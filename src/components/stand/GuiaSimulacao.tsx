import { useEffect, useState, type ReactNode } from 'react';
import { ComandosSimulacao } from '../gameplay/ComandosSimulacao';

/** Gesto explícito antes de começar: dá tempo para conhecer os comandos. */
export function GuiaSimulacao({ aoComecar, comVoz }: { aoComecar(): void; comVoz: boolean }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); aoComecar(); }
    };
    let pressionado = false;
    const timer = window.setInterval(() => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.mapping === 'standard');
      const agora = !!pad?.buttons[0]?.pressed;
      if (agora && !pressionado) aoComecar();
      pressionado = agora;
    }, 100);
    window.addEventListener('keydown', tecla, true);
    return () => { window.clearInterval(timer); window.removeEventListener('keydown', tecla, true); };
  }, [aoComecar]);
  return <section className="stand-guia-simulacao" aria-label="Antes de dirigir">
    <h1>Antes de dirigir</h1>
    <p>Experimente os comandos com calma. Ao ver o alerta do sensor, freie.</p>
    <ComandosSimulacao />
    <p>{comVoz ? 'Para pedir ajuda, fale com o LUCA. Para voltar, diga “volta pra Coruja”, ou use os comandos abaixo.' : 'A voz está indisponível agora. Para voltar, use os comandos abaixo.'} PS/Home no controle ou Esc no teclado retornam à Coruja.</p>
    <button type="button" onClick={aoComecar}>Começar · Enter / ✕ / A</button>
  </section>;
}

export function SimulacaoComGuia({ children, comVoz }: { children: ReactNode; comVoz: boolean }) {
  const [pronto, setPronto] = useState(false);
  return <>{pronto ? children : <GuiaSimulacao comVoz={comVoz} aoComecar={() => setPronto(true)} />}
    {pronto && <button className="stand-ajuda-simulacao" type="button" onClick={() => setPronto(false)}>Ajuda · como dirigir</button>}
  </>;
}
