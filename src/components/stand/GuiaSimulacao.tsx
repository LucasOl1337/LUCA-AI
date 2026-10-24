import { useEffect, useRef, useState, type ReactNode } from 'react';
import { somCompartilhado } from '../gameplay/somCompartilhado';
import { COMANDOS_CABINE as C } from '../gameplay/comandosCabine';
import { useEntradaCabine } from '../gameplay/useEntradaCabine';
import { ComandosCabineVisual } from './ComandosCabineVisual';
import { criarContagemGuia, GUIA_AUTOINICIO_MS, type ContagemGuia } from './contagemGuia';
import './guiaCabine.css';
import { padConsumiuConfirmar } from './focoPadDom';

/**
 * Guia antes de dirigir: mostra os comandos e começa sozinha em 5 s (Lucas, 24/10).
 * Botão, Enter ou ✕/A começam antes; sair da Simulação desmonta e cancela.
 */
export function GuiaSimulacao({ aoComecar, comVoz, autoInicioMs = GUIA_AUTOINICIO_MS }: { aoComecar(): void; comVoz: boolean; autoInicioMs?: number }) {
  const entrada = useEntradaCabine();
  const [segundos, setSegundos] = useState(Math.ceil(autoInicioMs / 1000));
  const contagem = useRef<ContagemGuia | null>(null);
  const comecar = useRef(aoComecar);
  comecar.current = aoComecar;
  useEffect(() => {
    // Sem gesto: a captura (câmera/microfone do totem) já libera o som; tenta desde já.
    void somCompartilhado.destravar();
    const c = criarContagemGuia({ totalMs: autoInicioMs, aoMudar: setSegundos, aoComecar: () => comecar.current() });
    contagem.current = c;
    return () => c.parar();
  }, [autoInicioMs]);
  const agora = () => contagem.current?.comecarAgora();
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((C.confirmar.teclas as readonly string[]).includes(e.key)) { e.preventDefault(); e.stopPropagation(); contagem.current?.comecarAgora(); }
    };
    let pressionado = false;
    const timer = window.setInterval(() => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.mapping === 'standard');
      const agora = !!pad?.buttons[C.confirmar.botao]?.pressed;
      // ✕ que o foco do D-pad já usou (apertou o "Começar já") não conta duas vezes.
      if (agora && !pressionado && !padConsumiuConfirmar()) contagem.current?.comecarAgora();
      pressionado = agora;
    }, 100);
    window.addEventListener('keydown', tecla, true);
    return () => { window.clearInterval(timer); window.removeEventListener('keydown', tecla, true); };
  }, []);
  return <section className="stand-guia-simulacao" aria-label="Antes de dirigir" data-foco-escopo="">
    <header><span className="cabine-sobretitulo">SIMULAÇÃO · NO SEU RITMO</span>
      <h1>Antes de dirigir</h1>
      <p>Siga as estacas até a chegada, desviando dos obstáculos e da água.</p>
    </header>
    <div className="cabine-dispositivo">{entrada === 'teclado' ? 'TECLADO' : entrada === 'ps' ? 'CONTROLE PLAYSTATION' : 'CONTROLE XBOX'}<span>Troca automática ao usar os comandos</span></div>
    <ComandosCabineVisual entrada={entrada} />
    <footer><div><strong className="cabine-contagem" role="timer" aria-live="polite" data-segundos={segundos}>Começando em <b>{segundos}</b>…</strong><p>Começa sozinha. A pausa reúne ajuda, saída e sonolência opcional.</p>
      {!comVoz && <small>Assistente de voz indisponível agora.</small>}</div>
      <button type="button" onClick={agora}>Começar já <kbd>{entrada === 'teclado' ? 'Enter' : C.confirmar[entrada]}</kbd></button>
    </footer>
  </section>;
}

export function SimulacaoComGuia({ children, comVoz }: { children: ReactNode; comVoz: boolean }) {
  const [pronto, setPronto] = useState(false);
  return <>{pronto ? children : <GuiaSimulacao comVoz={comVoz} aoComecar={() => { void somCompartilhado.destravar(); setPronto(true); }} />}

  </>;
}
