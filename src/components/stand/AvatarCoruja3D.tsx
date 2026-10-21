import { useEffect, useRef, useState } from 'react';
import type { EstadoVoz } from './canal';
import AvatarCorujaA from './AvatarCorujaA';

/**
 * Variante `coruja-3d`: a coruja do Tripo em three.js, com um clipe por estado
 * de voz e o brilho do visor/fones seguindo o áudio. A cena vem num chunk
 * próprio (import dinâmico). Sem WebGL, ou se o GLB/texturas não carregarem,
 * mostra a Coruja A com as mesmas props; o motivo fica em `data-fallback`.
 */

interface Props {
  voz: EstadoVoz;
  nivel: { current: number };
  parado: boolean;
  className?: string;
}

export function temWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

export default function AvatarCoruja3D({ voz, nivel, parado, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vozRef = useRef(voz);
  vozRef.current = voz;
  const [falha, setFalha] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!temWebGL()) { setFalha('webgl'); return undefined; }
    let vivo = true;
    let cena: { dispose(): void } | null = null;
    const falhar = (erro: unknown) => {
      if (!vivo) return;
      console.warn('[coruja-3d] voltando para a Coruja A:', erro);
      setFalha('carga');
    };
    import('./criarCenaCoruja3D').then(({ criarCenaCoruja3D }) => {
      if (!vivo) return;
      try {
        cena = criarCenaCoruja3D({
          canvas, voz: () => vozRef.current, nivel, parado,
          aoPronto: () => { if (vivo) setPronto(true); },
          aoFalhar: falhar,
        });
      } catch (erro) {
        falhar(erro);
      }
    }, falhar);
    return () => { vivo = false; cena?.dispose(); };
  }, [nivel, parado]);

  if (falha) {
    return (
      <div data-variante="coruja-3d" data-fallback={falha} style={{ display: 'contents' }}>
        <AvatarCorujaA voz={voz} nivel={nivel} parado={parado} className={className} />
      </div>
    );
  }
  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="Avatar LUCA"
      data-variante="coruja-3d"
      data-voz={voz}
      data-pronto={pronto ? 'sim' : 'nao'}
      style={{ aspectRatio: '1 / 1' }}
    />
  );
}
