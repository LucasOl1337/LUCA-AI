import { useEffect, useState, type ReactNode } from 'react';
import { somCompartilhado } from '../gameplay/somCompartilhado';
import { COMANDOS_CABINE as C } from '../gameplay/comandosCabine';
import { useEntradaCabine } from '../gameplay/useEntradaCabine';
import { ComandosCabineVisual } from './ComandosCabineVisual';
import './guiaCabine.css';

/** Gesto explícito antes de começar: dá tempo para conhecer os comandos. */
export function GuiaSimulacao({ aoComecar, comVoz }: { aoComecar(): void; comVoz: boolean }) {
  const entrada = useEntradaCabine();
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((C.confirmar.teclas as readonly string[]).includes(e.key)) { e.preventDefault(); e.stopPropagation(); aoComecar(); }
    };
    let pressionado = false;
    const timer = window.setInterval(() => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.mapping === 'standard');
      const agora = !!pad?.buttons[C.confirmar.botao]?.pressed;
      if (agora && !pressionado) aoComecar();
      pressionado = agora;
    }, 100);
    window.addEventListener('keydown', tecla, true);
    return () => { window.clearInterval(timer); window.removeEventListener('keydown', tecla, true); };
  }, [aoComecar]);
  return <section className="stand-guia-simulacao" aria-label="Antes de dirigir">
    <header><span className="cabine-sobretitulo">SIMULAÇÃO · NO SEU RITMO</span>
      <h1>Antes de dirigir</h1>
      <p>Siga as estacas até a chegada, desviando do feno e da água.</p>
    </header>
    <div className="cabine-dispositivo">{entrada === 'teclado' ? 'TECLADO' : entrada === 'ps' ? 'CONTROLE PLAYSTATION' : 'CONTROLE XBOX'}<span>Troca automática ao usar os comandos</span></div>
    <ComandosCabineVisual entrada={entrada} />
    <footer><div><strong>Pronto para o talhão?</strong><p>A pausa reúne ajuda, saída e sonolência opcional.</p>
      {!comVoz && <small>Assistente de voz indisponível agora.</small>}</div>
      <button type="button" onClick={aoComecar}>Começar <kbd>{entrada === 'teclado' ? 'Enter' : C.confirmar[entrada]}</kbd></button>
    </footer>
  </section>;
}

export function SimulacaoComGuia({ children, comVoz }: { children: ReactNode; comVoz: boolean }) {
  const [pronto, setPronto] = useState(false);
  return <>{pronto ? children : <GuiaSimulacao comVoz={comVoz} aoComecar={() => { void somCompartilhado.destravar(); setPronto(true); }} />}

  </>;
}
