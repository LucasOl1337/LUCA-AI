/**
 * A webcam do Totem: um `getUserMedia` só para o /stand inteiro (Lucas, 21/10:
 * "webcam sempre ligada no Totem"). No Linux a câmera aceita um leitor por vez,
 * então ninguém mais abre a câmera: quem quer imagem pede `emprestar()` e
 * recebe um clone do stream (mesmo dispositivo, sem segunda abertura). Parar o
 * clone não desliga a câmera; pausar a câmera desliga todos os clones.
 *
 * O iframe do Site (mesma origem) pega a câmera daqui por
 * `window.parent.__lucaCameraStand` (ver `src/sonolencia/cameraDoTotem.ts`).
 *
 * Aba oculta e pagehide pausam (a luz da câmera apaga); a volta reabre uma vez
 * (`ligarCicloDaCamera`, o mesmo do /gameplay?webcam=1).
 */
import { ligarCicloDaCamera } from '../gameplay/cicloCamera';

export type FaseCamera = 'desligada' | 'abrindo' | 'ligada' | 'pausada' | 'erro';

export interface EstadoCamera {
  fase: FaseCamera;
  /** Mensagem para a equipe quando `fase === 'erro'`. */
  erro: string;
}

export interface CameraStand {
  /** Abre a câmera (uma vez; chamadas repetidas esperam a mesma abertura). */
  ligar(): Promise<MediaStream | null>;
  /** Clone do stream para um consumidor; abre a câmera se ainda não abriu. */
  emprestar(): Promise<MediaStream>;
  /** Para a câmera e todos os clones, marcando a pausa (volta com `retomar`). */
  pausar(): void;
  /** Reabre depois de uma pausa. */
  retomar(): Promise<MediaStream | null>;
  /** Para tudo de vez (saída do /stand). */
  desligar(): void;
  ler(): EstadoCamera;
  assinar(fn: () => void): () => void;
}

export interface OpcoesCameraStand {
  abrir: () => Promise<MediaStream>;
  mensagemErro?: (erro: unknown) => string;
}

const pararStream = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop());

export function criarCameraStand({ abrir, mensagemErro = (e) => (e instanceof Error ? e.message : 'Não foi possível abrir a webcam.') }: OpcoesCameraStand): CameraStand {
  let estado: EstadoCamera = { fase: 'desligada', erro: '' };
  let stream: MediaStream | null = null;
  let abrindo: Promise<MediaStream | null> | null = null;
  /** Sobe a cada pausa/desligamento: uma abertura que chega depois é descartada. */
  let geracao = 0;
  const clones = new Set<MediaStream>();
  const assinantes = new Set<() => void>();

  const definir = (fase: FaseCamera, erro = '') => {
    if (estado.fase === fase && estado.erro === erro) return;
    estado = { fase, erro };
    for (const fn of [...assinantes]) fn();
  };

  const soltarTudo = () => {
    for (const clone of clones) pararStream(clone);
    clones.clear();
    pararStream(stream);
    stream = null;
    abrindo = null;
  };

  const ligar = (): Promise<MediaStream | null> => {
    if (stream && stream.getVideoTracks().some((t) => t.readyState === 'live')) return Promise.resolve(stream);
    if (abrindo) return abrindo;
    const minha = ++geracao;
    definir('abrindo');
    abrindo = abrir().then((novo) => {
      if (minha !== geracao) { pararStream(novo); return null; }
      stream = novo;
      abrindo = null;
      for (const track of novo.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (stream !== novo) return;
          soltarTudo();
          definir('erro', 'A webcam foi desconectada.');
        });
      }
      definir('ligada');
      return novo;
    }, (falha) => {
      if (minha !== geracao) return null;
      abrindo = null;
      definir('erro', mensagemErro(falha));
      return null;
    });
    return abrindo;
  };

  const emprestar = async (): Promise<MediaStream> => {
    const fonte = await ligar();
    if (!fonte) throw Object.assign(new Error(estado.erro || 'A webcam do totem está desligada.'), { name: 'NotReadableError' });
    // `track.stop()` de quem devolveu não dispara 'ended': limpa aqui os clones já parados.
    for (const velho of clones) if (velho.getTracks().every((t) => t.readyState === 'ended')) clones.delete(velho);
    const clone = fonte.clone();
    clones.add(clone);
    return clone;
  };

  const pausar = () => {
    geracao += 1;
    soltarTudo();
    definir('pausada');
  };

  const desligar = () => {
    geracao += 1;
    soltarTudo();
    definir('desligada');
  };

  return {
    ligar,
    emprestar,
    pausar,
    retomar: ligar,
    desligar,
    ler: () => estado,
    assinar(fn) { assinantes.add(fn); return () => { assinantes.delete(fn); }; },
  };
}

type Alvo = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** Aba oculta/pagehide pausam a câmera; visível/pageshow do bfcache reabrem. */
export function ligarCicloCameraStand(camera: CameraStand, janela: Alvo, documento: Alvo & { hidden: boolean }) {
  return ligarCicloDaCamera(janela, documento, {
    ligada: () => camera.ler().fase === 'ligada' || camera.ler().fase === 'abrindo',
    pausada: () => camera.ler().fase === 'pausada',
    pausar: () => camera.pausar(),
    retomar: () => { void camera.retomar(); },
  });
}

/** Nome no `window` do /stand por onde o iframe do Site (mesma origem) pega a câmera. */
export const CHAVE_CAMERA_TOTEM = '__lucaCameraStand';

let unica: CameraStand | null = null;
/** A câmera da página (uma por documento). */
export function cameraDaPagina(abrir: () => Promise<MediaStream>, mensagemErro?: (erro: unknown) => string): CameraStand {
  unica ??= criarCameraStand({ abrir, mensagemErro });
  return unica;
}
