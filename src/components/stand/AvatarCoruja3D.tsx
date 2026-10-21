import { useEffect, useId, useRef, useState } from 'react';
import type { EstadoVoz } from './canal';
import AvatarCorujaA from './AvatarCorujaA';
import { CAIXA_A, ONDAS, haloCoruja3D } from './coruja3dRig';

/**
 * Variante `coruja-3d`: a coruja do Tripo em three.js, com um clipe por estado
 * de voz e o brilho do visor/fones seguindo o áudio. A cena vem num chunk
 * próprio (import dinâmico). Sem WebGL, ou se o GLB/texturas não carregarem,
 * mostra a Coruja A com as mesmas props; o motivo fica em `data-fallback`.
 *
 * Mesma moldura da Coruja A: SVG com o viewBox dela, halo e ondas atrás, e o
 * canvas no lugar da arte (0..1024) com o mesmo degradê embaixo e nas laterais.
 */

interface Props {
  voz: EstadoVoz;
  nivel: { current: number };
  parado: boolean;
  className?: string;
}

const LADO = 1024;
const { x: CX, y: CY, largura: CL, altura: CA } = CAIXA_A;

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
  const svgRef = useRef<SVGSVGElement>(null);
  const vozRef = useRef(voz);
  vozRef.current = voz;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const u = (nome: string) => `c3${id}-${nome}`;
  const [falha, setFalha] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!temWebGL()) { setFalha('webgl'); return undefined; }
    let vivo = true;
    let cena: { dispose(): void } | null = null;
    const halo = svgRef.current?.querySelector('[data-c3="halo"]');
    const ondas = [...(svgRef.current?.querySelectorAll('[data-c3="onda"]') ?? [])];
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
          aoQuadro: (v, fala, agora) => {
            const h = haloCoruja3D(v, fala, agora);
            halo?.setAttribute('fill-opacity', h.halo.toFixed(3));
            h.ondas.forEach((o, i) => {
              ondas[i]?.setAttribute('r', o.r.toFixed(1));
              ondas[i]?.setAttribute('stroke-opacity', o.opacidade.toFixed(3));
            });
          },
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
    <svg
      ref={svgRef}
      viewBox={`${CAIXA_A.x} ${CAIXA_A.y} ${CAIXA_A.largura} ${CAIXA_A.altura}`}
      className={className}
      role="img"
      aria-label="Avatar LUCA"
      data-variante="coruja-3d"
      data-voz={voz}
      data-pronto={pronto ? 'sim' : 'nao'}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={u('halo')}>
          <stop offset="0" stopColor="#64d2ff" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#0a84ff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#0a84ff" stopOpacity="0" />
        </radialGradient>
        {/* Mesmas máscaras da Coruja A: degradê embaixo (`busto-m`) e laterais do peito (`lados-m`). */}
        <linearGradient id={u('busto')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.66" stopColor="#fff" />
          <stop offset="0.97" stopColor="#000" />
        </linearGradient>
        <linearGradient id={u('lados')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.07" stopColor="#000" />
          <stop offset="0.17" stopColor="#fff" />
          <stop offset="0.83" stopColor="#fff" />
          <stop offset="0.93" stopColor="#000" />
        </linearGradient>
        <mask id={u('busto-m')} maskUnits="userSpaceOnUse" x={CX} y={CY} width={CL} height={CA}>
          <rect x={CX} y={CY} width={CL} height={CA} fill={`url(#${u('busto')})`} />
        </mask>
        <mask id={u('lados-m')} maskUnits="userSpaceOnUse" x={CX} y={CY} width={CL} height={CA}>
          <rect x={CX} y={CY} width={CL} height={CA} fill="#fff" />
          {/* Sem o retângulo preto da A embaixo: o degradê já é opaco, e a borda dupla
              suavizada deixava uma linha fina em y=600. */}
          <rect x={CX} y="600" width={CL} height={CY + CA - 600} fill={`url(#${u('lados')})`} />
        </mask>
      </defs>
      <circle data-c3="halo" cx={CAIXA_A.cx} cy={CAIXA_A.cy} r="560" fill={`url(#${u('halo')})`} fillOpacity="0.3" />
      {Array.from({ length: ONDAS }, (_, i) => (
        <circle key={i} data-c3="onda" cx={CAIXA_A.cx} cy={CAIXA_A.cy} r="400" fill="none" stroke="#64d2ff" strokeWidth="5" strokeOpacity="0" />
      ))}
      <g mask={`url(#${u('lados-m')})`}>
        <g mask={`url(#${u('busto-m')})`}>
          <foreignObject x="0" y="0" width={LADO} height={LADO}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </foreignObject>
        </g>
      </g>
    </svg>
  );
}
