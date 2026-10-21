import { useCallback, useEffect, useRef, useState } from 'react';
import { CLOSED_DURATION_MS } from '@/sonolencia/eye-state.js';
import { criarMonitorSonolencia, faltaNoNavegador, mensagemErroCamera, type MonitorSonolencia } from '@/sonolencia/monitor';
import { aoVivo } from '@/lib/gameplayAoVivo';
import { ROTULO_SONO, segundosSono, sonoCabine, useSonoCabine } from './sonoCabine';
import './webcamSonoCabine.css';

type Fase = 'abrindo' | 'rodando' | 'pausada' | 'erro';

/**
 * Quadro da webcam de sonolência no canto de cima à direita da cabine
 * (`/gameplay?webcam=1`). Mesmo detector da /sonolencia (`monitor.ts`):
 * olhos fechados por 1 s acendem a faixa, a vinheta e o bipe da cabine e
 * vão ao tablet do operador. Abre sozinho (o parâmetro já é o opt-in, e o F5
 * do totem volta com a câmera); com a aba oculta, libera a câmera e reabre
 * na volta. A imagem não sai do navegador: só o status vai ao tablet.
 */
export default function WebcamSonoCabine() {
  const video = useRef<HTMLVideoElement>(null);
  const monitor = useRef<MonitorSonolencia | null>(null);
  const [fase, setFaseEstado] = useState<Fase>('abrindo');
  const faseRef = useRef<Fase>('abrindo');
  const setFase = useCallback((f: Fase) => { faseRef.current = f; setFaseEstado(f); }, []);
  const [erro, setErro] = useState('');
  const sono = useSonoCabine();

  const parar = useCallback(() => {
    monitor.current?.parar();
    monitor.current = null;
    sonoCabine.definir(null);
  }, []);

  const abrir = useCallback(async () => {
    parar();
    const falta = faltaNoNavegador();
    if (falta) { setErro(falta); setFase('erro'); return; }
    if (!video.current) return;
    setFase('abrindo'); setErro('');
    const atual = criarMonitorSonolencia({
      video: video.current,
      // Frame de 640 px para o worker: a cabine 3D já disputa a CPU do totem.
      larguraAnalise: 640,
      aoLer: (leitura) => { if (monitor.current === atual) sonoCabine.definir({ status: leitura.status, closedMs: leitura.closedMs }); },
      aoFalhar: (mensagem) => {
        if (monitor.current !== atual) return;
        monitor.current = null; sonoCabine.definir(null); setErro(mensagem); setFase('erro');
      },
    });
    monitor.current = atual;
    try {
      const qualidade = await atual.iniciar();
      if (monitor.current !== atual || !qualidade) return;
      sonoCabine.definir({ status: 'unknown', closedMs: 0 });
      setFase('rodando');
    } catch (falha) {
      if (monitor.current !== atual) return;
      monitor.current = null; sonoCabine.definir(null); setErro(mensagemErroCamera(falha)); setFase('erro');
    }
  }, [parar, setFase]);

  useEffect(() => {
    // Tablet do operador: a leitura vai junto do retrato (só o status, nunca a imagem).
    const semSono = sonoCabine.assinar(() => aoVivo.marcarSono(sonoCabine.ler()));
    void abrir();
    const trocar = () => {
      if (document.hidden) { if (monitor.current) { parar(); setFase('pausada'); } }
      else if (faseRef.current === 'pausada') void abrir();
    };
    document.addEventListener('visibilitychange', trocar);
    window.addEventListener('pagehide', parar);
    return () => {
      document.removeEventListener('visibilitychange', trocar);
      window.removeEventListener('pagehide', parar);
      parar();
      semSono();
      aoVivo.marcarSono(null);
    };
  }, [abrir, parar, setFase]);

  const status = fase === 'rodando' ? sono?.status ?? 'unknown' : 'unknown';
  const fechado = status === 'closed' || status === 'alarm';
  const progresso = Math.min(1, (sono?.closedMs ?? 0) / CLOSED_DURATION_MS);
  return (
    <aside className="gameplay-webcam" data-fase={fase} data-sono={fase === 'rodando' ? status : undefined} aria-label="Webcam de sonolência">
      <div className="gameplay-webcam-quadro">
        <video ref={video} muted playsInline aria-hidden="true" />
        {fase !== 'rodando' && (
          <p className="gameplay-webcam-aviso" role={fase === 'erro' ? 'alert' : 'status'}>
            {fase === 'erro' ? erro : fase === 'pausada' ? 'Webcam pausada com a aba oculta.' : 'Abrindo a webcam…'}
          </p>
        )}
      </div>
      <div className="gameplay-webcam-linha">
        <span className="gameplay-webcam-ponto" aria-hidden="true" />
        <strong>{fase === 'rodando' ? ROTULO_SONO[status] : 'Sonolência'}</strong>
        {fechado && <small>{segundosSono(sono?.closedMs ?? 0)}</small>}
      </div>
      {fechado && <progress max={1} value={progresso} aria-label="Tempo de olhos fechados até o alerta" />}
      {fase === 'erro' && <button type="button" onClick={() => void abrir()}>Tentar de novo</button>}
    </aside>
  );
}
