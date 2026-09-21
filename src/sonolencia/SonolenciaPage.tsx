import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Eye, ShieldCheck, Square, Volume2 } from 'lucide-react';
import { DrowsinessAlarm } from './alarm';
import { describeCameraStream, formatCameraQuality, openPreferredCamera } from './camera.js';
import { CLOSED_DURATION_MS, SENSITIVITY_THRESHOLDS, createEyeMonitor, normalizeEyeClosure, type EyeReading, type EyeSample } from './eye-state.js';
import './sonolencia.css';

type Phase = 'idle' | 'starting' | 'running' | 'error';
type Sensitivity = keyof typeof SENSITIVITY_THRESHOLDS;
type Session = {
  disposed: boolean; alarm?: DrowsinessAlarm; stream?: MediaStream; worker?: Worker;
  tick?: number; timeout?: number; rejectInit?: () => void;
};
const EMPTY: EyeReading = { status: 'unknown', closedMs: 0, alarm: false };
const STATUS = { unknown: 'Posicione seu rosto', open: 'Olhos abertos', closed: 'Olhos fechados', alarm: 'Alerta de sonolência' };
const CLOSED_DURATION_SECONDS = CLOSED_DURATION_MS / 1000;

function release(session: Session) {
  session.disposed = true;
  clearInterval(session.tick);
  clearTimeout(session.timeout);
  session.rejectInit?.();
  session.worker?.terminate();
  session.stream?.getTracks().forEach(track => track.stop());
  session.alarm?.close();
}

function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'A câmera foi bloqueada. Permita a webcam nas configurações deste site e tente novamente.';
  if (name === 'NotFoundError') return 'Nenhuma webcam encontrada. Conecte uma câmera e tente novamente.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'Não foi possível abrir a webcam. Feche outros aplicativos que usam a câmera e tente novamente.';
  return error instanceof Error ? error.message : 'Não foi possível iniciar o monitor. Tente novamente.';
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
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      stop('A webcam precisa de HTTPS e de um navegador compatível, como Chrome ou Edge atualizado.', true); return;
    }
    if (!window.Worker || !window.createImageBitmap || !window.OffscreenCanvas) {
      stop('Este navegador não oferece os recursos necessários. Abra no Chrome ou Edge atualizado.', true); return;
    }
    if (testSound.current) { release(testSound.current); testSound.current = null; setSoundTesting(false); }
    const session: Session = { disposed: false };
    current.current = session;
    setPhase('starting'); setMessage('Aguardando permissão da câmera…'); setReading(EMPTY); setScores(null);
    try {
      session.alarm = new DrowsinessAlarm();
      await session.alarm.unlock();
      if (session.disposed) return;
      const stream = await openPreferredCamera(navigator.mediaDevices);
      if (session.disposed) { stream.getTracks().forEach(track => track.stop()); return; }
      session.stream = stream;
      const cameraQuality = describeCameraStream(stream);
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => { if (!session.disposed) stop('A webcam foi desconectada. Reconecte e ative o monitor novamente.', true); });
        track.addEventListener('mute', () => { if (!session.disposed) stop('A webcam deixou de enviar imagens. Ative o monitor novamente.', true); });
      }
      const element = video.current!;
      element.srcObject = stream;
      await element.play();
      if (session.disposed) return;
      setMessage('Preparando detector de olhos. Na primeira vez, isso pode levar alguns segundos…');
      const worker = new Worker(new URL('./drowsiness-worker.ts', import.meta.url));
      session.worker = worker;
      await new Promise<void>((resolve, reject) => {
        session.rejectInit = () => reject(new Error('Inicialização cancelada.'));
        session.timeout = window.setTimeout(() => reject(new Error('O detector demorou a carregar. Confira sua conexão e tente novamente.')), 45000);
        worker.onerror = () => reject(new Error('Não foi possível carregar o detector. Atualize a página e tente novamente.'));
        worker.onmessage = ({ data }) => {
          if (data.type === 'ready') resolve();
          else if (data.type === 'error') reject(new Error('O detector não iniciou neste navegador. Tente no Chrome ou Edge atualizado.'));
        };
        worker.postMessage({ type: 'init' });
      });
      clearTimeout(session.timeout); session.rejectInit = undefined;
      if (session.disposed) return;
      const monitor = createEyeMonitor(SENSITIVITY_THRESHOLDS[sensitivity]);
      let inFlight = false;
      let lastVideoTime = -1;
      let lastResultAt = performance.now();
      worker.onerror = () => { if (!session.disposed) stop('O detector foi interrompido. Ative o monitor novamente.', true); };
      worker.onmessage = ({ data }) => {
        if (session.disposed) return;
        if (data.type === 'error') { stop('Não foi possível analisar a imagem da webcam. Tente novamente.', true); return; }
        if (data.type !== 'result') return;
        inFlight = false;
        const now = performance.now();
        lastResultAt = now;
        // A delayed inference cannot prove that the eyes remained closed.
        const fresh = now - data.at <= 500;
        const sample: EyeSample = fresh ? data.sample : null;
        const next = monitor.update(sample, data.at);
        setReading(next); setScores(sample);
        if (next.alarm) session.alarm!.start(); else session.alarm!.stop();
      };
      setPhase('running'); setMessage(`${formatCameraQuality(cameraQuality)} Mantenha seu rosto de frente para a câmera, com boa iluminação.`);
      session.tick = window.setInterval(async () => {
        if (session.disposed) return;
        if (!session.alarm!.available) { stop('O áudio foi interrompido. Ative o monitor novamente para rearmar o alarme.', true); return; }
        const now = performance.now();
        if (now - lastResultAt > 500) {
          monitor.reset(); session.alarm!.stop(); setReading(EMPTY); setScores(null);
        }
        if (now - lastResultAt > 8000) { stop('A análise da câmera parou de responder. Ative o monitor novamente.', true); return; }
        if (inFlight || element.readyState < 2 || element.currentTime === lastVideoTime) return;
        inFlight = true; lastVideoTime = element.currentTime;
        try {
          const bitmap = await createImageBitmap(element);
          if (session.disposed) { bitmap.close(); return; }
          worker.postMessage({ type: 'frame', bitmap, at: now }, [bitmap]);
        } catch { if (!session.disposed) stop('Não foi possível ler a webcam. Ative o monitor novamente.', true); }
      }, 100);
    } catch (error) { if (!session.disposed) stop(cameraError(error), true); }
  }

  const active = phase === 'running' || phase === 'starting';
  const label = phase === 'running' ? STATUS[reading.status] : phase === 'starting' ? 'Preparando monitor' : phase === 'error' ? 'Monitor indisponível' : 'Webcam desligada';
  const sensitivityThreshold = SENSITIVITY_THRESHOLDS[sensitivity];
  return (
    <div className="drowsiness-page" data-state={phase} data-eyes={reading.status}>
      <header className="drowsiness-heading">
        <div><span className="drowsiness-eyebrow">LUCA · VISÃO COMPUTACIONAL</span><h1>Monitor de sonolência</h1><p>Olhos fechados por 1 segundo. Um alerta para chamar sua atenção.</p></div>
        <span className="drowsiness-private"><ShieldCheck size={16} /> Processamento neste computador</span>
      </header>
      <div className="drowsiness-grid">
        <section className="drowsiness-camera" aria-label="Prévia da webcam">
          <video ref={video} muted playsInline autoPlay aria-label="Imagem ao vivo da webcam" />
          {!active && <div className="drowsiness-placeholder"><CameraOff size={42} strokeWidth={1} /><h2>Sua atenção em foco</h2><p>A câmera só liga quando você iniciar.<br />Nenhuma imagem é gravada ou enviada.</p></div>}
          <span className="drowsiness-camera-badge"><i />{active ? 'WEBCAM ATIVA' : 'CÂMERA DESLIGADA'}</span>
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
        <div><span>02</span><h3>Experimente parado</h3><p>Feche os dois olhos por 1 segundo. Piscadas rápidas não completam a contagem.</p></div>
        <div><span>03</span><h3>Mantenha a aba visível</h3><p>Trocar de aba pausa o monitor e libera a webcam. Sem rosto visível, a contagem é zerada.</p></div>
      </div>
      <p className="drowsiness-notice">Protótipo experimental: pode falhar e não substitui um sistema de segurança veicular. Faça testes somente com o veículo parado. Se sentir sono, pare em local seguro e descanse.</p>
    </div>
  );
}
