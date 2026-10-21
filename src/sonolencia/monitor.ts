import { describeCameraStream, openPreferredCamera, type CameraQuality } from './camera.js';
import { createEyeMonitor, SENSITIVITY_THRESHOLDS, type EyeReading, type EyeSample } from './eye-state.js';

/**
 * Laço do detector de sonolência: câmera → frame a cada 100 ms → worker do
 * Face Landmarker → `createEyeMonitor`. Fica fora da página para a /sonolencia
 * e o /gameplay?webcam=1 usarem o mesmo código (nada de segunda cópia das
 * regras de frescor, perda de rosto e worker travado).
 *
 * Quem chama cuida da tela e do som; o monitor só abre, lê e libera.
 */
export const EMPTY_READING: EyeReading = { status: 'unknown', closedMs: 0, alarm: false };
/** Resultado mais velho que isso não prova que os olhos continuaram fechados. */
export const RESULTADO_FRESCO_MS = 500;
/** Sem resposta do worker por esse tempo, o monitor desiste. */
export const WORKER_MUDO_MS = 8000;
export const INTERVALO_FRAME_MS = 100;

export interface OpcoesMonitor {
  video: HTMLVideoElement;
  limiar?: number;
  /** Cada observação do worker (ou o zeramento por falta delas). */
  aoLer(leitura: EyeReading, amostra: EyeSample): void;
  /** Falha depois de rodando; o monitor já se liberou. */
  aoFalhar(mensagem: string): void;
  /** Etapa intermediária da partida (câmera aberta, carregando o detector). */
  aoEtapa?(etapa: 'detector'): void;
  /** Consultado a cada frame: devolve uma mensagem para encerrar (ex.: áudio perdido). */
  verificar?(): string | null;
  /** Reduz o frame antes do worker (o gameplay usa 640 px para poupar CPU). */
  larguraAnalise?: number;
  // Injeção para teste; o padrão é o navegador.
  abrirCamera?: (mediaDevices: MediaDevices) => Promise<MediaStream>;
  mediaDevices?: MediaDevices;
  criarWorker?: () => Worker;
  capturar?: (video: HTMLVideoElement, largura?: number) => Promise<ImageBitmap>;
  agora?: () => number;
}

export interface MonitorSonolencia {
  /** Abre câmera e detector. Resolve com a qualidade negociada, ou `null` se foi parado no meio. */
  iniciar(): Promise<CameraQuality | null>;
  /** Libera câmera, worker e timers. Idempotente. */
  parar(): void;
}

const criarWorkerPadrao = () => new Worker(new URL('./drowsiness-worker.ts', import.meta.url));

function capturarPadrao(video: HTMLVideoElement, largura?: number) {
  if (!largura || !video.videoWidth || video.videoWidth <= largura) return createImageBitmap(video);
  const altura = Math.round(video.videoHeight * largura / video.videoWidth);
  return createImageBitmap(video, { resizeWidth: largura, resizeHeight: altura, resizeQuality: 'medium' });
}

/** Mensagem para quem não conseguiu abrir a câmera. */
export function mensagemErroCamera(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'A câmera foi bloqueada. Permita a webcam nas configurações deste site e tente novamente.';
  if (name === 'NotFoundError') return 'Nenhuma webcam encontrada. Conecte uma câmera e tente novamente.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'Não foi possível abrir a webcam. Feche outros aplicativos que usam a câmera e tente novamente.';
  return error instanceof Error ? error.message : 'Não foi possível iniciar o monitor. Tente novamente.';
}

/** O navegador tem o que o monitor precisa? Devolve a mensagem do que falta, ou `null`. */
export function faltaNoNavegador(): string | null {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return 'A webcam precisa de HTTPS e de um navegador compatível, como Chrome ou Edge atualizado.';
  if (!window.Worker || !window.createImageBitmap || !window.OffscreenCanvas) return 'Este navegador não oferece os recursos necessários. Abra no Chrome ou Edge atualizado.';
  return null;
}

export function criarMonitorSonolencia(op: OpcoesMonitor): MonitorSonolencia {
  const agora = op.agora ?? (() => performance.now());
  const s: {
    disposed: boolean; stream?: MediaStream; worker?: Worker;
    tick?: ReturnType<typeof setInterval>; timeout?: ReturnType<typeof setTimeout>; rejectInit?: () => void;
  } = { disposed: false };

  const parar = () => {
    if (s.disposed) return;
    s.disposed = true;
    clearInterval(s.tick);
    clearTimeout(s.timeout);
    s.rejectInit?.();
    s.worker?.terminate();
    s.stream?.getTracks().forEach(track => track.stop());
    if (op.video.srcObject === s.stream) op.video.srcObject = null;
  };
  const falhar = (mensagem: string) => {
    if (s.disposed) return;
    parar();
    op.aoFalhar(mensagem);
  };

  /** Falha na partida rejeita e já devolve a câmera e o worker abertos até ali. */
  async function iniciar(): Promise<CameraQuality | null> {
    try { return await partir(); } catch (erro) { parar(); throw erro; }
  }

  async function partir(): Promise<CameraQuality | null> {
    const abrir = op.abrirCamera ?? openPreferredCamera;
    const stream = await abrir(op.mediaDevices ?? navigator.mediaDevices);
    // Parado durante a permissão: o stream que chega atrasado também é fechado.
    if (s.disposed) { stream.getTracks().forEach(track => track.stop()); return null; }
    s.stream = stream;
    const qualidade = describeCameraStream(stream);
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => falhar('A webcam foi desconectada. Reconecte e ative o monitor novamente.'));
      track.addEventListener('mute', () => falhar('A webcam deixou de enviar imagens. Ative o monitor novamente.'));
    }
    const element = op.video;
    element.srcObject = stream;
    await element.play();
    if (s.disposed) return null;
    op.aoEtapa?.('detector');
    const worker = (op.criarWorker ?? criarWorkerPadrao)();
    s.worker = worker;
    await new Promise<void>((resolve, reject) => {
      s.rejectInit = () => reject(new Error('Inicialização cancelada.'));
      s.timeout = setTimeout(() => reject(new Error('O detector demorou a carregar. Confira sua conexão e tente novamente.')), 45000);
      worker.onerror = () => reject(new Error('Não foi possível carregar o detector. Atualize a página e tente novamente.'));
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') resolve();
        else if (data.type === 'error') reject(new Error('O detector não iniciou neste navegador. Tente no Chrome ou Edge atualizado.'));
      };
      worker.postMessage({ type: 'init' });
    }).catch((erro) => { if (s.disposed) return; throw erro; });
    clearTimeout(s.timeout); s.rejectInit = undefined;
    if (s.disposed) return null;

    const monitor = createEyeMonitor(op.limiar ?? SENSITIVITY_THRESHOLDS.normal);
    let inFlight = false;
    let lastVideoTime = -1;
    let lastResultAt = agora();
    worker.onerror = () => falhar('O detector foi interrompido. Ative o monitor novamente.');
    worker.onmessage = ({ data }) => {
      if (s.disposed) return;
      if (data.type === 'error') { falhar('Não foi possível analisar a imagem da webcam. Tente novamente.'); return; }
      if (data.type !== 'result') return;
      inFlight = false;
      const now = agora();
      lastResultAt = now;
      // A delayed inference cannot prove that the eyes remained closed.
      const sample: EyeSample = now - data.at <= RESULTADO_FRESCO_MS ? data.sample : null;
      op.aoLer(monitor.update(sample, data.at), sample);
    };
    s.tick = setInterval(async () => {
      if (s.disposed) return;
      const motivo = op.verificar?.();
      if (motivo) { falhar(motivo); return; }
      const now = agora();
      if (now - lastResultAt > RESULTADO_FRESCO_MS) { monitor.reset(); op.aoLer(EMPTY_READING, null); }
      if (now - lastResultAt > WORKER_MUDO_MS) { falhar('A análise da câmera parou de responder. Ative o monitor novamente.'); return; }
      if (inFlight || element.readyState < 2 || element.currentTime === lastVideoTime) return;
      inFlight = true; lastVideoTime = element.currentTime;
      try {
        const bitmap = await (op.capturar ?? capturarPadrao)(element, op.larguraAnalise);
        if (s.disposed) { bitmap.close(); return; }
        worker.postMessage({ type: 'frame', bitmap, at: now }, [bitmap]);
      } catch { falhar('Não foi possível ler a webcam. Ative o monitor novamente.'); }
    }, INTERVALO_FRAME_MS);
    return qualidade;
  }

  return { iniciar, parar };
}
