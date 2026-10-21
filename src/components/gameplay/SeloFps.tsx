import { useEffect, useState, type RefObject } from 'react';
import { PERFIL_GAMEPLAY } from '../sompo/qualidadeAdaptativa';

/** Janela do selo: o medidor do palco dá uma leitura por segundo. */
export const JANELA_SELO_MS = 5_000;

export interface LeituraPalco { em: number; fps: number }

export interface ResumoSelo { medio: number; minimo: number }

/** Média e mínimo das leituras dentro da janela que termina em `agora`. */
export function resumirLeituras(leituras: readonly LeituraPalco[], agora: number): ResumoSelo | null {
  const janela = leituras.filter((l) => agora - l.em <= JANELA_SELO_MS);
  if (!janela.length) return null;
  const soma = janela.reduce((total, l) => total + l.fps, 0);
  return { medio: Math.round(soma / janela.length), minimo: Math.min(...janela.map((l) => l.fps)) };
}

interface EstadoSelo { resumo: ResumoSelo | null; degrau: string; tela: string }

/**
 * /gameplay?fps=1 (pergunta 6, FPS no totem real): selo no canto com o que o
 * medidor do palco já escreve no DOM (`data-fps` a cada segundo, `data-qualidade`
 * ao trocar de degrau). Não mede nada novo; sem o parâmetro nem é montado.
 */
export default function SeloFps({ palcoRef }: { palcoRef: RefObject<HTMLDivElement | null> }) {
  const [estado, setEstado] = useState<EstadoSelo>({ resumo: null, degrau: '?', tela: '?' });

  useEffect(() => {
    const palco = palcoRef.current;
    if (!palco) return undefined;
    const leituras: LeituraPalco[] = [];
    // Cada escrita do medidor gera um registro, mesmo com o valor repetido.
    const observador = new MutationObserver((registros) => {
      const agora = performance.now();
      for (const r of registros) if (r.attributeName === 'data-fps') leituras.push({ em: agora, fps: Number(palco.dataset.fps) });
      while (leituras.length && agora - leituras[0].em > JANELA_SELO_MS) leituras.shift();
      const canvas = palco.querySelector('canvas');
      setEstado({
        resumo: resumirLeituras(leituras, agora),
        degrau: palco.dataset.qualidade ?? '?',
        tela: canvas ? `${canvas.width}×${canvas.height}` : '?',
      });
    });
    observador.observe(palco, { attributes: true, attributeFilter: ['data-fps', 'data-qualidade'] });
    return () => observador.disconnect();
  }, [palcoRef]);

  const { resumo, degrau, tela } = estado;
  return (
    <div className="gameplay-selo-fps" data-selo-fps="" aria-hidden="true">
      <span>{resumo ? `${resumo.medio} fps` : '… fps'}</span>
      <span>mín {resumo ? resumo.minimo : '…'}</span>
      <span>degrau {degrau}/{PERFIL_GAMEPLAY.degraus.length - 1}</span>
      <span>{tela}</span>
    </div>
  );
}
