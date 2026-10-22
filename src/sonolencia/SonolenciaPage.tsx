import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Eye, ShieldCheck, Square, Volume2 } from 'lucide-react';
import { DrowsinessAlarm } from './alarm';
import { formatCameraQuality } from './camera.js';
import { CLOSED_DURATION_MS, SENSITIVITY_THRESHOLDS, normalizeEyeClosure, type EyeReading, type EyeSample } from './eye-state.js';
import { cameraDoTotem } from './cameraDoTotem';
import { criarMonitorSonolencia, EMPTY_READING, faltaNoNavegador, mensagemErroCamera, type MonitorSonolencia } from './monitor';
import './sonolencia.css';

type Phase = 'idle' | 'starting' | 'running' | 'error';
type Sensitivity = keyof typeof SENSITIVITY_THRESHOLDS;
/** Sessão da página: o laço câmera → detector mora em `monitor.ts` (o mesmo do /gameplay?webcam=1). */
type Session = { disposed: boolean; alarm?: DrowsinessAlarm; monitor?: MonitorSonolencia; timeout?: number };
const EMPTY: EyeReading = EMPTY_READING;
const STATUS = { unknown: 'Posicione seu rosto', open: 'Olhos abertos', closed: 'Olhos fechados', alarm: 'Alerta de sonolência' };
const CLOSED_DURATION_SECONDS = CLOSED_DURATION_MS / 1000;

function release(session: Session) {
  session.disposed = true;
  clearTimeout(session.timeout);
  session.monitor?.parar();
  session.alarm?.close();
}

export default function SonolenciaPage() {
  const video = useRef<HTMLVideoElement>(null);
  const current = useRef<Session | null>(null);
  const testSound = useRef<Session | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('Ative a webcam para começar.');
  const [reading, setReading] = useState<EyeReading>(EMPTY);
  const [scores, setScores] = useState<EyeSample>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>('normal');
  const [soundTesting, setSoundTesting] = useState(false);

  function stop(detail = 'Monitor desligado. A webcam foi liberada.', error = false) {
    const session = current.current;
    current.current = null;
    if (session) release(session);
    if (video.current) video.current.srcObject = null;
    setPhase(error ? 'error' : 'idle'); setReading(EMPTY); setScores(null); setMessage(detail);
  }

  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        if (current.current) stop('Monitor pausado ao sair da aba. Ative a webcam novamente para continuar.');
        if (testSound.current) { release(testSound.current); testSound.current = null; setSoundTesting(false); }
      }
    };
    const leaving = () => {
      if (current.current) stop('Monitor desligado ao sair da página.');
      if (testSound.current) { release(testSound.current); testSound.current = null; }
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leaving);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leaving);
      if (current.current) release(current.current);
      current.current = null;
      if (testSound.current) release(testSound.current);
      testSound.current = null;
    };
  }, []);

  async function playTest() {
    if (testSound.current || current.current) return;
    const session: Session = { disposed: false };
    testSound.current = session; setSoundTesting(true);
    try {
      session.alarm = new DrowsinessAlarm();
      await session.alarm.unlock();
      if (session.disposed) return;
      session.alarm.start();
      session.timeout = window.setTimeout(() => {
        release(session); testSound.current = null; setSoundTesting(false);
      }, 1500);
    } catch {
      if (!session.disposed) {
        release(session); testSound.current = null; setSoundTesting(false);
        setMessage('Não foi possível tocar o som. Confira o volume e as permissões de áudio do navegador.');
      }
    }
  }

  async function start() {
    if (current.current) return;
    const falta = faltaNoNavegador();
    if (falta) { stop(falta, true); return; }
    if (testSound.current) { release(testSound.current); testSound.current = null; setSoundTesting(false); }
    const session: Session = { disposed: false };
    current.current = session;
    setPhase('starting'); setMessage('Preparando áudio e aguardando permissão da câmera…'); setReading(EMPTY); setScores(null);
    session.timeout = window.setTimeout(() => {
      if (current.current === session) stop('O monitor não ficou pronto em 30 segundos. Confira câmera, permissão e áudio; depois toque em Ativar webcam para tentar novamente.', true);
    }, 30_000);
    try {
      session.alarm = new DrowsinessAlarm();
      await session.alarm.unlock();
      if (session.disposed) return;
      const alarm = session.alarm;
      session.monitor = criarMonitorSonolencia({
        video: video.current!,
        limiar: SENSITIVITY_THRESHOLDS[sensitivity],
        // No Totem (iframe do /stand) usa a webcam que o Totem já mantém ligada.
        abrirCamera: cameraDoTotem(),
        aoEtapa: () => setMessage('Preparando detector de olhos. Na primeira vez, isso pode levar alguns segundos…'),
        verificar: () => (alarm.available ? null : 'O áudio foi interrompido. Ative o monitor novamente para rearmar o alarme.'),
        aoLer: (next, sample) => {
          setReading(next); setScores(sample);
          if (next.alarm) alarm.start(); else alarm.stop();
        },
        aoFalhar: (mensagem) => { if (!session.disposed) stop(mensagem, true); },
      });
      const cameraQuality = await session.monitor.iniciar();
      if (session.disposed || !cameraQuality) return;
      clearTimeout(session.timeout);
      setPhase('running'); setMessage(`Monitor pronto e som liberado. ${formatCameraQuality(cameraQuality)} Posicione o rosto iluminado; só teste quando houver leitura dos olhos.`);
    } catch (error) { if (!session.disposed) stop(mensagemErroCamera(error), true); }
  }

  const active = phase === 'running' || phase === 'starting';
  const label = phase === 'running' ? STATUS[reading.status] : phase === 'starting' ? 'Preparando monitor' : phase === 'error' ? 'Monitor indisponível' : 'Webcam desligada';
  const sensitivityThreshold = SENSITIVITY_THRESHOLDS[sensitivity];
  return (
    <div className="drowsiness-page" data-state={phase} data-ready={phase === 'running' ? 'true' : 'false'} data-eyes={reading.status}>
      <header className="drowsiness-heading">
        <div><span className="drowsiness-eyebrow">LUCA · VISÃO COMPUTACIONAL</span><h1>Monitor de sonolência</h1><p>Olhos fechados por 1 segundo. Um alerta para chamar sua atenção.</p></div>
        <span className="drowsiness-private"><ShieldCheck size={16} /> Processamento neste computador</span>
      </header>
      <div className="drowsiness-grid">
        <section className="drowsiness-camera" aria-label="Prévia da webcam">
          <video ref={video} muted playsInline autoPlay aria-label="Imagem ao vivo da webcam" />
          {!active && <div className="drowsiness-placeholder"><CameraOff size={42} strokeWidth={1} /><h2>Sua atenção em foco</h2><p>A câmera só liga quando você iniciar.<br />Nenhuma imagem é gravada ou enviada.</p></div>}
          <span className="drowsiness-camera-badge"><i />{phase === 'running' ? 'WEBCAM ATIVA' : phase === 'starting' ? 'PREPARANDO CÂMERA' : 'CÂMERA DESLIGADA'}</span>
          {phase === 'running' && <div className="drowsiness-overlay" role={reading.alarm ? 'alert' : undefined}><Eye size={20} /><strong>{STATUS[reading.status]}</strong>{reading.alarm && <span>Faça uma pausa em local seguro.</span>}</div>}
        </section>
        <section className="drowsiness-panel" aria-label="Controles do monitor">
          <span className="drowsiness-eyebrow">ESTADO DO MONITOR</span>
          <h2 role="status" aria-live="polite">{label}</h2>
          <p className="drowsiness-message" role={phase === 'error' ? 'alert' : undefined}>{message}</p>
          <div className="drowsiness-timer"><strong>{(Math.min(reading.closedMs, CLOSED_DURATION_MS) / 1000).toFixed(1).replace('.', ',')}<small> / {CLOSED_DURATION_SECONDS} s</small></strong><span>de olhos fechados continuamente</span></div>
          <progress value={Math.min(reading.closedMs, CLOSED_DURATION_MS)} max={CLOSED_DURATION_MS} aria-label="Tempo de olhos fechados" />
          <div className="drowsiness-eye-meters">
            {(['left', 'right'] as const).map((eye, index) => {
              const closure = scores ? normalizeEyeClosure(scores[eye], sensitivityThreshold) : 0;
              return <div key={eye}><span>Seu olho {index === 0 ? 'esquerdo' : 'direito'}</span><meter min="0" max="1" value={closure} aria-label={`Fechamento do seu olho ${index === 0 ? 'esquerdo' : 'direito'}`} /><small>{scores ? `${Math.round(closure * 100)}% fechado` : 'Sem leitura'}</small></div>;
            })}
          </div>
          <label className="drowsiness-sensitivity">Sensibilidade<select value={sensitivity} onChange={e => setSensitivity(e.target.value as Sensitivity)} disabled={active}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option></select></label>
          <div className="drowsiness-actions">
            {active ? <button className="drowsiness-stop" onClick={() => stop()}><Square size={16} />{phase === 'starting' ? 'Cancelar' : 'Parar monitor'}</button> : <button className="drowsiness-start" onClick={() => void start()}><Camera size={18} />Ativar webcam</button>}
            <button onClick={() => void playTest()} disabled={active || soundTesting}><Volume2 size={18} />{soundTesting ? 'Tocando alerta…' : 'Testar som'}</button>
          </div>
          <p className="drowsiness-hint">Confira o volume com “Testar som”. O alarme para ao abrir os olhos ou desligar o monitor.</p>
        </section>
      </div>
      <div className="drowsiness-guidance">
        <div><span>01</span><h3>Prepare a câmera</h3><p>Fique de frente e ilumine bem o rosto. Óculos escuros e reflexos podem impedir a leitura.</p></div>
        <div><span>02</span><h3>Experimente parado</h3><p>{phase === 'running' ? 'Monitor pronto e som liberado. Com leitura dos olhos, feche os dois por 1 segundo. Piscadas rápidas não completam a contagem.' : 'Primeiro ative a webcam e autorize a câmera. Espere “Monitor pronto e som liberado” e a leitura dos olhos antes de testar.'}</p></div>
        <div><span>03</span><h3>Mantenha a aba visível</h3><p>Trocar de aba pausa o monitor e libera a webcam. Sem rosto visível, a contagem é zerada.</p></div>
      </div>
      <p className="drowsiness-notice">Protótipo experimental: pode falhar e não substitui um sistema de segurança veicular. Faça testes somente com o veículo parado. Se sentir sono, pare em local seguro e descanse.</p>
    </div>
  );
}
