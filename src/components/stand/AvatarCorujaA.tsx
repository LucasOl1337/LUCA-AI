import { useEffect, useId, useRef } from 'react';
import type { EstadoVoz } from './canal';
import {
  FONES, IMAGEM_CORUJA_A, LADO, MICROFONE, OLHOS, POSE_REPOUSO, VISOR,
  geometriaPalpebra, memoriaInicial, passoCorujaA, transformCorpo, type PoseCorujaA,
} from './corujaARig';

/**
 * Coruja A: a arte aprovada (PNG recortado) animada em 2D por camadas no SVG.
 * O laço escreve atributos direto nos nós (sem re-render). Os ids vêm do
 * `useId`, então várias cópias convivem na mesma página.
 */

interface Props {
  voz: EstadoVoz;
  nivel: { current: number };
  parado: boolean;
  className?: string;
}

/** Deslocamento máximo da íris, em px da arte. */
const OLHAR_PX = { x: 7, y: 4 };
const ONDAS = 3;
const ONDA_MS = 1500;

function aplicarPose(svg: SVGSVGElement, p: PoseCorujaA, agora: number) {
  const q = (sel: string) => svg.querySelectorAll<SVGElement>(`[data-ca="${sel}"]`);
  const set = (sel: string, nome: string, valor: string) => q(sel).forEach((el) => el.setAttribute(nome, valor));

  set('corpo', 'transform', transformCorpo(p));
  set('iris', 'transform', `translate(${(p.olharX * OLHAR_PX.x).toFixed(2)} ${(p.olharY * OLHAR_PX.y).toFixed(2)})`);
  q('palpebra').forEach((el, i) => {
    const g = geometriaPalpebra(OLHOS[i], p.palpebra);
    el.setAttribute('visibility', g.visivel ? 'visible' : 'hidden');
    q('tampa')[i]?.setAttribute('cy', g.cy.toFixed(2));
    el.querySelector('[data-ca="pena"]')?.setAttribute('transform', `translate(0 ${g.desliza.toFixed(2)})`);
    const cilio = el.querySelector('[data-ca="cilio"]');
    cilio?.setAttribute('cy', g.cy.toFixed(2));
    cilio?.setAttribute('stroke-opacity', Math.min(0.75, p.palpebra * 3).toFixed(3));
  });

  const brilho = Math.min(1, p.brilho + p.voz * 0.6);
  set('visor', 'fill-opacity', (0.05 + brilho * 0.22).toFixed(3));
  set('visor-borda', 'stroke-opacity', (0.15 + brilho * 0.6).toFixed(3));
  set('varredura', 'visibility', p.varredura < 0 ? 'hidden' : 'visible');
  if (p.varredura >= 0) set('varredura', 'transform', `translate(${(160 + p.varredura * 720).toFixed(1)} 0)`);
  set('mic', 'fill-opacity', (0.2 + p.voz * 0.8).toFixed(3));
  set('mic', 'r', (22 + p.voz * 14).toFixed(2));
  set('fone', 'fill-opacity', (0.12 + brilho * 0.5).toFixed(3));

  // Halo e ondas: só a fala acende; respiram junto quando ociosa.
  set('halo', 'fill-opacity', (0.25 + p.brilho * 0.35 + p.voz * 0.5).toFixed(3));
  q('onda').forEach((el, i) => {
    const fase = ((agora / ONDA_MS) + i / ONDAS) % 1;
    el.setAttribute('r', (400 + fase * 140).toFixed(1));
    el.setAttribute('stroke-opacity', (p.voz * (1 - fase) * 0.9).toFixed(3));
  });
}

export default function AvatarCorujaA({ voz, nivel, parado, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const vozRef = useRef(voz);
  vozRef.current = voz;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const u = (nome: string) => `ca${id}-${nome}`;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    if (parado) { aplicarPose(svg, POSE_REPOUSO, 0); return undefined; }
    const memoria = memoriaInicial(performance.now());
    let quadro = 0;
    const passo = (agora: number) => {
      aplicarPose(svg, passoCorujaA(memoria, vozRef.current, nivel.current, agora), agora);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [parado, nivel]);

  const imagem = <image href={IMAGEM_CORUJA_A} x="0" y="0" width={LADO} height={LADO} />;

  return (
    <svg ref={svgRef} viewBox="-90 -60 1204 1104" className={className} role="img" aria-label="Avatar LUCA" data-variante="coruja-a" data-voz={voz} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={u('halo')}>
          <stop offset="0" stopColor="#64d2ff" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#0a84ff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#0a84ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={u('luz')}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="0.35" stopColor="#7fd8ff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#0a84ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={u('iris-m')}>
          <stop offset="0.72" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <linearGradient id={u('busto')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.66" stopColor="#fff" />
          <stop offset="0.97" stopColor="#000" />
        </linearGradient>
        <linearGradient id={u('pele')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.5" stopColor="#8aa3d2" />
          <stop offset="0.88" stopColor="#5f79b0" />
          <stop offset="0.97" stopColor="#1d3263" />
        </linearGradient>
        <filter id={u('borda')} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" /></filter>
        {/* Penugem: ruído alongado na vertical, só luz (canal alfa), para a pálpebra não parecer plástico. */}
        <filter id={u('penugem')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.35 0.06" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0.86  0 0 0 0 0.92  0 0 0 0 1  0 0 0 1.4 -0.55" />
        </filter>
        <linearGradient id={u('lados')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.07" stopColor="#000" />
          <stop offset="0.17" stopColor="#fff" />
          <stop offset="0.83" stopColor="#fff" />
          <stop offset="0.93" stopColor="#000" />
        </linearGradient>
        <linearGradient id={u('feixe')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#bfeaff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#e6f7ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#bfeaff" stopOpacity="0" />
        </linearGradient>
        <mask id={u('busto-m')} maskUnits="userSpaceOnUse" x="-90" y="-60" width="1204" height="1104">
          <rect x="-90" y="-60" width="1204" height="1104" fill={`url(#${u('busto')})`} />
        </mask>
        <mask id={u('lados-m')} maskUnits="userSpaceOnUse" x="-90" y="-60" width="1204" height="1104">
          <rect x="-90" y="-60" width="1204" height="1104" fill="#fff" />
          <rect x="-90" y="600" width="1204" height="504" fill="#000" />
          <rect x="-90" y="600" width="1204" height="504" fill={`url(#${u('lados')})`} />
        </mask>
        <clipPath id={u('visor-c')}><path d={VISOR} /></clipPath>
        {OLHOS.map((o, i) => (
          <g key={i}>
            <mask id={u(`olho${i}`)} maskUnits="userSpaceOnUse" x={o.cx - o.rx - 12} y={o.cy - o.ry - 12} width={o.rx * 2 + 24} height={o.ry * 2 + 24}>
              <ellipse cx={o.cx} cy={o.cy} rx={o.rx + 3} ry={o.ry + 3} fill="#fff" filter={`url(#${u('borda')})`} transform={`rotate(${o.rot} ${o.cx} ${o.cy})`} />
            </mask>
            <mask id={u(`iris${i}`)} maskUnits="userSpaceOnUse" x={o.cx - o.iris} y={o.cy - o.iris} width={o.iris * 2} height={o.iris * 2}>
              <circle cx={o.cx} cy={o.cy} r={o.iris} fill={`url(#${u('iris-m')})`} />
            </mask>
            <clipPath id={u(`tampa${i}`)}>
              <ellipse data-ca="tampa" cx={o.cx} cy={o.cy - o.ry * 2.7} rx={o.rx * 1.5} ry={o.ry * 1.7} transform={`rotate(${o.rot} ${o.cx} ${o.cy})`} />
            </clipPath>
          </g>
        ))}
      </defs>

      <circle data-ca="halo" cx="512" cy="430" r="560" fill={`url(#${u('halo')})`} fillOpacity="0.3" />
      {Array.from({ length: ONDAS }, (_, i) => (
        <circle key={i} data-ca="onda" cx="512" cy="430" r="400" fill="none" stroke="#64d2ff" strokeWidth="5" strokeOpacity="0" />
      ))}

      <g mask={`url(#${u('lados-m')})`}>
      <g data-ca="corpo" mask={`url(#${u('busto-m')})`}>
        {imagem}

        {OLHOS.map((o, i) => (
          <g key={`olho${i}`} mask={`url(#${u(`olho${i}`)})`}>
            <g mask={`url(#${u(`iris${i}`)})`}>
              <g data-ca="iris">{imagem}</g>
            </g>
            <g data-ca="palpebra" visibility="hidden">
              <g clipPath={`url(#${u(`tampa${i}`)})`}>
                <g data-ca="pena">
                  {/* Pele da pálpebra: base azul-acinzentada da pena, borda escura embaixo e a textura real por cima. */}
                  <rect x={o.cx - o.rx * 1.6} y={o.cy - o.ry * 4} width={o.rx * 3.2} height={o.ry * 3 + 2} fill={`url(#${u('pele')})`} />
                  <rect x={o.cx - o.rx * 1.6} y={o.cy - o.ry * 4} width={o.rx * 3.2} height={o.ry * 3 + 2} filter={`url(#${u('penugem')})`} opacity="0.35" />
                </g>
              </g>
              <ellipse data-ca="cilio" cx={o.cx} cy={o.cy - o.ry * 2.7} rx={o.rx * 1.5} ry={o.ry * 1.7} fill="none" stroke="#0b1f4d" strokeWidth="4" strokeOpacity="0" transform={`rotate(${o.rot} ${o.cx} ${o.cy})`} />
            </g>
          </g>
        ))}

        <path data-ca="visor" d={VISOR} fill="#9fdcff" fillOpacity="0.06" style={{ mixBlendMode: 'screen' }} />
        <path data-ca="visor-borda" d={VISOR} fill="none" stroke="#bfeaff" strokeWidth="3" strokeOpacity="0.2" />
        <g clipPath={`url(#${u('visor-c')})`}>
          <rect data-ca="varredura" x="-60" y="280" width="120" height="220" fill={`url(#${u('feixe')})`} visibility="hidden" style={{ mixBlendMode: 'screen' }} />
        </g>
        {FONES.map((f, i) => (
          <ellipse key={i} data-ca="fone" cx={f.cx} cy={f.cy} rx="34" ry="120" fill={`url(#${u('luz')})`} fillOpacity="0.15" style={{ mixBlendMode: 'screen' }} />
        ))}
        <circle data-ca="mic" cx={MICROFONE.cx} cy={MICROFONE.cy} r="22" fill={`url(#${u('luz')})`} fillOpacity="0.2" style={{ mixBlendMode: 'screen' }} />
      </g>
      </g>
    </svg>
  );
}
