import type { EyeReading, EyeSample } from '@/sonolencia/eye-state.js';
import type { MonitorSonolencia } from '@/sonolencia/monitor';
import type { SonoCabine } from '../gameplay/sonoCabine';
import { criarDetectorPresenca, linhaCamera, type Presenca } from '@/stand-voz/visao';
import type { CameraStand } from './cameraStand';
import type { Modo } from './modoStand';

/**
 * O olho do Totem: UM detector (o Face Landmarker da /sonolencia) sobre um
 * clone da câmera compartilhada (`cameraStand.ts`), ligado enquanto a câmera
 * estiver ligada, em todas as abas.
 *
 * - Em toda aba: presença de rosto (com histerese) vira a linha `Câmera do
 *   totem:` que a coruja recebe a cada pergunta. Só texto, nada de imagem.
 * - Na Simulação: a leitura dos olhos vai para `sonoCabine`, e o painel da
 *   cabine acende faixa, vinheta e bipe com olhos fechados por 1 s (o mesmo
 *   caminho do /gameplay?webcam=1). Fora dela o sono fica `null`.
 * - Fora da Simulação o detector olha 4 vezes por segundo (poupa CPU para a
 *   coruja 3D); na Simulação, 10 vezes (o alarme precisa do tempo exato).
 */
export const INTERVALO_FORA_DA_SIMULACAO_MS = 250;
export const RETENTATIVA_MS = 5000;

export interface OpcoesMonitorTotem {
  abrirCamera: () => Promise<MediaStream>;
  aoLer(leitura: EyeReading, amostra: EyeSample): void;
  aoFalhar(mensagem: string): void;
  intervaloMs: () => number;
}

export interface OpcoesVisaoTotem {
  camera: CameraStand;
  criarMonitor(op: OpcoesMonitorTotem): MonitorSonolencia;
  modo(): Modo;
  sono: { definir(valor: SonoCabine | null): void };
  aoMudar?(estado: { presenca: Presenca; linha: string }): void;
  agora?: () => number;
  esperar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
}

export function criarVisaoTotem(op: OpcoesVisaoTotem) {
  const agora = op.agora ?? (() => performance.now());
  const esperar = op.esperar ?? ((fn, ms) => window.setTimeout(fn, ms));
  const cancelar = op.cancelar ?? ((id) => window.clearTimeout(id as number));
  const presenca = criarDetectorPresenca();
  let monitor: MonitorSonolencia | null = null;
  let retentativa: unknown = null;
  let linha = '';
  let parado = true;
  let soltarCamera: (() => void) | null = null;

  const avisar = () => {
    const nova = linhaCamera(op.camera.ler().fase, presenca.ler());
    if (nova === linha) return;
    linha = nova;
    op.aoMudar?.({ presenca: presenca.ler(), linha });
  };

  const soltarMonitor = () => {
    monitor?.parar();
    monitor = null;
    presenca.zerar();
    op.sono.definir(null);
  };

  const agendarRetentativa = () => {
    if (parado || retentativa !== null) return;
    retentativa = esperar(() => { retentativa = null; abrirMonitor(); }, RETENTATIVA_MS);
  };

  function abrirMonitor() {
    if (parado || monitor || op.camera.ler().fase !== 'ligada') return;
    const atual: MonitorSonolencia = op.criarMonitor({
      abrirCamera: () => op.camera.emprestar(),
      intervaloMs: () => (op.modo() === 'simulacao' ? 0 : INTERVALO_FORA_DA_SIMULACAO_MS),
      aoLer: (leitura, amostra) => {
        if (monitor !== atual) return;
        presenca.observar(amostra !== null, agora());
        op.sono.definir(op.modo() === 'simulacao' ? { status: leitura.status, closedMs: leitura.closedMs } : null);
        avisar();
      },
      aoFalhar: () => {
        if (monitor !== atual) return;
        soltarMonitor();
        avisar();
        agendarRetentativa();
      },
    });
    monitor = atual;
    atual.iniciar().then((qualidade) => {
      if (monitor === atual && qualidade) op.sono.definir(op.modo() === 'simulacao' ? { status: 'unknown', closedMs: 0 } : null);
    }, () => {
      if (monitor !== atual) return;
      soltarMonitor();
      avisar();
      agendarRetentativa();
    });
  }

  const aoCamera = () => {
    if (op.camera.ler().fase === 'ligada') abrirMonitor();
    else if (monitor) soltarMonitor();
    avisar();
  };

  return {
    iniciar() {
      if (!parado) return;
      parado = false;
      soltarCamera = op.camera.assinar(aoCamera);
      void op.camera.ligar();
      aoCamera();
    },
    /** A aba do Totem mudou: fora da Simulação o sono some na hora (nada de bipe no vídeo). */
    aoMudarModo() {
      if (op.modo() !== 'simulacao') op.sono.definir(null);
      else if (monitor) op.sono.definir({ status: 'unknown', closedMs: 0 });
    },
    parar() {
      parado = true;
      soltarCamera?.();
      soltarCamera = null;
      if (retentativa !== null) { cancelar(retentativa); retentativa = null; }
      soltarMonitor();
    },
    linha: () => linha,
    presenca: () => presenca.ler(),
  };
}
