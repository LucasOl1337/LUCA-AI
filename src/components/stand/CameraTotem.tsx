import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { CLOSED_DURATION_MS } from '@/sonolencia/eye-state.js';
import { openPreferredCamera } from '@/sonolencia/camera.js';
import { criarMonitorSonolencia, faltaNoNavegador, mensagemErroCamera } from '@/sonolencia/monitor';
import { aoVivo } from '@/lib/gameplayAoVivo';
import { visaoTotem, type Presenca } from '@/stand-voz/visao';
import { somCompartilhado } from '../gameplay/somCompartilhado';
import { ROTULO_SONO, segundosSono, sonoCabine, useSonoCabine } from '../gameplay/sonoCabine';
import { cameraDaPagina, CHAVE_CAMERA_TOTEM, ligarCicloCameraStand, type CameraStand, type EstadoCamera } from './cameraStand';
import type { Modo } from './modoStand';
import { criarVisaoTotem } from './visaoTotem';
import '../gameplay/webcamSonoCabine.css';

const abrirWebcam = () => openPreferredCamera(navigator.mediaDevices);
const camera = (): CameraStand => cameraDaPagina(abrirWebcam, mensagemErroCamera);
const SEM_CAMERA: EstadoCamera = { fase: 'desligada', erro: '' };

/**
 * Webcam sempre ligada no Totem (Lucas, 21/10): abre ao entrar no /stand e
 * fica ligada em todas as abas, num stream só. Liga o olho do totem
 * (`visaoTotem.ts`: presença para a coruja, sono na Simulação), o ciclo da aba
 * (oculta = pausa) e o som: com a captura ativa o Chrome deixa o áudio da
 * página tocar sem gesto, então a câmera ligada também destrava o bipe.
 */
export function useCameraTotem(modo: Modo): { camera: EstadoCamera; presenca: Presenca } {
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const [presenca, setPresenca] = useState<Presenca>('desconhecida');
  const visao = useRef<ReturnType<typeof criarVisaoTotem> | null>(null);
  const estado = useSyncExternalStore((fn) => camera().assinar(fn), () => camera().ler(), () => SEM_CAMERA);

  useEffect(() => {
    const soltarSom = somCompartilhado.ligarDestravas(window, document);
    const cam = camera();
    const janela = window as unknown as Record<string, unknown>;
    // O iframe do Site (/sonolencia, mesma origem) pega a câmera daqui em vez de abrir outra.
    janela[CHAVE_CAMERA_TOTEM] = cam;
    const soltarDestravaPelaCamera = cam.assinar(() => { if (cam.ler().fase === 'ligada') void somCompartilhado.destravar(); });
    // Tablet do operador: só o status do sono, nunca a imagem (igual ao /gameplay?webcam=1).
    const soltarSono = sonoCabine.assinar(() => aoVivo.marcarSono(sonoCabine.ler()));
    if (faltaNoNavegador()) return () => { soltarSom(); soltarDestravaPelaCamera(); soltarSono(); };

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const atual = criarVisaoTotem({
      camera: cam,
      // Frame de 640 px, como no /gameplay?webcam=1 (~14 ms por inferência no worker).
      criarMonitor: (op) => criarMonitorSonolencia({ video, larguraAnalise: 640, ...op }),
      modo: () => modoRef.current,
      sono: sonoCabine,
      aoMudar: ({ presenca: p, linha }) => { visaoTotem.definir(linha); setPresenca(p); },
    });
    visao.current = atual;
    atual.iniciar();
    const soltarCiclo = ligarCicloCameraStand(cam, window, document);
    return () => {
      soltarCiclo();
      atual.parar();
      visao.current = null;
      cam.desligar();
      if (janela[CHAVE_CAMERA_TOTEM] === cam) delete janela[CHAVE_CAMERA_TOTEM];
      visaoTotem.definir('');
      soltarSom();
      soltarDestravaPelaCamera();
      soltarSono();
      aoVivo.marcarSono(null);
    };
  }, []);

  useEffect(() => { visao.current?.aoMudarModo(); }, [modo]);

  return { camera: estado, presenca };
}

/** Mostra um clone da câmera do Totem num `<video>` enquanto ela estiver ligada (não abre câmera própria). */
function useCloneNoVideo(video: RefObject<HTMLVideoElement | null>, ligada: boolean) {
  useEffect(() => {
    if (!ligada || !video.current) return undefined;
    const el = video.current;
    let clone: MediaStream | null = null;
    let vivo = true;
    camera().emprestar().then((s) => {
      if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
      clone = s;
      el.srcObject = s;
      void el.play().catch(() => undefined);
    }, () => undefined);
    return () => {
      vivo = false;
      clone?.getTracks().forEach((t) => t.stop());
      if (el.srcObject === clone) el.srcObject = null;
    };
  }, [ligada]);
}

/**
 * Quadro da webcam na Simulação do Totem (canto de cima à direita, o mesmo
 * desenho do /gameplay?webcam=1): mostra a pessoa ao volante e o estado dos
 * olhos. O alarme é o da cabine (faixa, vinheta e bipe do `PainelCabine`).
 * Usa um clone da câmera do Totem; não abre câmera própria.
 */
export function WebcamSimulacao() {
  const video = useRef<HTMLVideoElement>(null);
  const estado = useSyncExternalStore((fn) => camera().assinar(fn), () => camera().ler(), () => SEM_CAMERA);
  const ligada = estado.fase === 'ligada';
  const sono = useSonoCabine();

  useCloneNoVideo(video, ligada);

  const status = ligada ? sono?.status ?? 'unknown' : 'unknown';
  const fechado = status === 'closed' || status === 'alarm';
  const progresso = Math.min(1, (sono?.closedMs ?? 0) / CLOSED_DURATION_MS);
  const fase = ligada ? 'rodando' : estado.fase === 'erro' ? 'erro' : estado.fase === 'pausada' ? 'pausada' : 'abrindo';
  // Navegador sem câmera (ou fora do Totem): nada de quadro preso em "Abrindo".
  if (estado.fase === 'desligada') return null;
  return (
    <aside className="gameplay-webcam stand-webcam-simulacao" data-fase={fase} data-sono={ligada ? status : undefined} aria-label="Webcam de sonolência">
      <div className="gameplay-webcam-quadro">
        <video ref={video} muted playsInline aria-hidden="true" />
        {!ligada && (
          <p className="gameplay-webcam-aviso" role={fase === 'erro' ? 'alert' : 'status'}>
            {fase === 'erro' ? estado.erro : fase === 'pausada' ? 'Webcam pausada com a aba oculta.' : 'Abrindo a webcam…'}
          </p>
        )}
      </div>
      <div className="gameplay-webcam-linha">
        <span className="gameplay-webcam-ponto" aria-hidden="true" />
        <strong>{ligada ? ROTULO_SONO[status] : 'Sonolência'}</strong>
        {fechado && <small>{segundosSono(sono?.closedMs ?? 0)}</small>}
      </div>
      {fechado && <progress max={1} value={progresso} aria-label="Tempo de olhos fechados até o alerta" />}
    </aside>
  );
}

const ROTULO_PRESENCA: Record<Presenca, string> = {
  desconhecida: 'Olhando…',
  rosto: 'Estou te vendo',
  ninguem: 'Chegue mais perto',
};

/**
 * Quadro da webcam na tela da coruja (Lucas, 21/10: "precisa aparecer a cam da
 * pessoa que tá falando com ela"): canto inferior esquerdo, porque a coluna da
 * direita é o "Experimente pedir". Mesmo stream único (um clone), espelhado
 * como um espelho, com a presença que a coruja recebe por texto.
 */
export function WebcamCoruja({ presenca }: { presenca: Presenca }) {
  const video = useRef<HTMLVideoElement>(null);
  const estado = useSyncExternalStore((fn) => camera().assinar(fn), () => camera().ler(), () => SEM_CAMERA);
  const ligada = estado.fase === 'ligada';
  useCloneNoVideo(video, ligada);
  if (estado.fase === 'desligada') return null;
  const fase = ligada ? 'rodando' : estado.fase === 'erro' ? 'erro' : estado.fase === 'pausada' ? 'pausada' : 'abrindo';
  return (
    <aside className="gameplay-webcam stand-webcam-coruja" data-fase={fase} data-presenca={ligada ? presenca : undefined} aria-label="Sua imagem na câmera do totem">
      <div className="gameplay-webcam-quadro">
        <video ref={video} muted playsInline aria-hidden="true" />
        {!ligada && (
          <p className="gameplay-webcam-aviso" role={fase === 'erro' ? 'alert' : 'status'}>
            {fase === 'erro' ? estado.erro : fase === 'pausada' ? 'Webcam pausada com a aba oculta.' : 'Abrindo a webcam…'}
          </p>
        )}
      </div>
      <div className="gameplay-webcam-linha">
        <span className="gameplay-webcam-ponto" aria-hidden="true" />
        <strong>{ligada ? ROTULO_PRESENCA[presenca] : 'Câmera'}</strong>
      </div>
    </aside>
  );
}

/** Selo discreto de câmera para a equipe e para quem está na frente (transparência). */
export function SeloCamera({ estado }: { estado: EstadoCamera }) {
  if (estado.fase !== 'ligada') return null;
  return <p className="stand-selo-camera" aria-label="Webcam ligada">● câmera ligada · processada neste computador</p>;
}
