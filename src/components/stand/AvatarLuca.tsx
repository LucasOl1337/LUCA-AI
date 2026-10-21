import { useEffect, useRef, type ReactNode } from 'react';
import type { EstadoVoz } from './canal';
import { RIG_PARADO, animarAvatar, rigTransform } from './avatarRig';
import AvatarCorujaA from './AvatarCorujaA';
import AvatarCoruja3D from './AvatarCoruja3D';

/**
 * Avatar LUCA. Padrão: a coruja 3D (`AvatarCoruja3D`, three.js; sem WebGL cai
 * na coruja A). A coruja A (arte animada em camadas, `?variante=coruja-a`) e as
 * três variações vetoriais antigas seguem por `?variante=`.
 * Sem defs/ids nas vetoriais: várias cópias convivem e o SVG exporta limpo.
 */

export type VarianteAvatar = 'coruja-a' | 'coruja-3d' | 'coruja' | 'operario' | 'robo';
export const VARIANTES_AVATAR: readonly VarianteAvatar[] = ['coruja-a', 'coruja-3d', 'coruja', 'operario', 'robo'];
export const VARIANTE_PADRAO: VarianteAvatar = 'coruja-3d';

const COR = {
  navy: '#0a84ff', ceu: '#64d2ff', verde: '#43d18a', fundo: '#0b1624', corpo: '#14263f',
  capacete: '#ffc93c', capaceteSombra: '#e0a91f', colete: '#ff9f0a', faixa: '#e9eef5',
};

type ParamRig = { cx?: number; cy?: number; k?: number; min?: number };

/** Props de uma peça animada: parâmetros em data-* e a pose de repouso já no transform. */
function rig(tipo: string, p: ParamRig = {}) {
  return {
    'data-rig': tipo,
    'data-cx': p.cx, 'data-cy': p.cy, 'data-k': p.k, 'data-min': p.min,
    transform: rigTransform(tipo, p, RIG_PARADO),
  };
}

function Capacete({ y = 0 }: { y?: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <path d="M112 150 C112 92 152 64 200 64 C248 64 288 92 288 150 Z" fill={COR.capacete} />
      <rect x="189" y="66" width="22" height="82" rx="9" fill={COR.capaceteSombra} />
      <rect x="92" y="142" width="216" height="22" rx="11" fill={COR.capacete} stroke={COR.capaceteSombra} strokeWidth="3" />
      <circle cx="200" cy="114" r="19" fill={COR.fundo} stroke={COR.verde} strokeWidth="3" />
      <path d="M184 114 h7 l4 -9 l6 18 l4 -9 h7" fill="none" stroke={COR.verde} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
}

function Colete({ topo, largura }: { topo: number; largura: number }) {
  const esq = 200 - largura / 2;
  return (
    <g>
      <path d={`M${esq} 400 L${esq + 6} ${topo + 22} Q${esq + 14} ${topo} ${esq + 40} ${topo} L175 ${topo} L175 400 Z`} fill={COR.colete} />
      <path d={`M${400 - esq} 400 L${400 - esq - 6} ${topo + 22} Q${400 - esq - 14} ${topo} ${400 - esq - 40} ${topo} L225 ${topo} L225 400 Z`} fill={COR.colete} />
      <rect x={esq + 3} y={topo + 48} width={172 - esq} height="13" fill={COR.faixa} opacity="0.92" />
      <rect x="225" y={topo + 48} width={172 - esq} height="13" fill={COR.faixa} opacity="0.92" />
    </g>
  );
}

function Coruja() {
  return (
    <g {...rig('respira', { k: 3 })}>
      <path d="M96 182 L80 120 L142 160 Z" fill={COR.corpo} stroke={COR.ceu} strokeWidth="3" strokeLinejoin="round" />
      <path d="M304 182 L320 120 L258 160 Z" fill={COR.corpo} stroke={COR.ceu} strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="200" cy="262" rx="128" ry="132" fill={COR.corpo} stroke={COR.ceu} strokeWidth="4" />
      <ellipse cx="86" cy="290" rx="26" ry="70" fill="#102036" transform="rotate(14 86 290)" />
      <ellipse cx="314" cy="290" rx="26" ry="70" fill="#102036" transform="rotate(-14 314 290)" />
      <Colete topo={322} largura={230} />
      <ellipse cx="200" cy="350" rx="54" ry="56" fill="#1c3656" />
      <path d="M180 338 l8 8 l8 -8 M204 338 l8 8 l8 -8 M192 360 l8 8 l8 -8" fill="none" stroke={COR.ceu} strokeWidth="3" opacity="0.5" strokeLinecap="round" />
      <path d="M200 266 C170 210 108 210 104 240 C100 276 140 290 200 280 C260 290 300 276 296 240 C292 210 230 210 200 266 Z" fill="#0c1828" />
      {[156, 244].map((cx) => (
        <g key={cx} {...rig('pisca', { cx, cy: 234 })}>
          <circle cx={cx} cy="234" r="38" fill={COR.fundo} stroke={COR.ceu} strokeWidth="5" />
          <g {...rig('olhar', { k: 9 })}>
            <circle cx={cx} cy="234" r="25" fill={COR.verde} opacity="0.28" />
            <circle cx={cx} cy="234" r="19" fill={COR.verde} />
            <circle cx={cx} cy="234" r="9" fill="#03110b" />
            <circle cx={cx - 7} cy="226" r="5.5" fill="#ffffff" opacity="0.9" />
          </g>
        </g>
      ))}
      <g {...rig('abre', { cx: 200, cy: 282, min: 0 })}>
        <ellipse cx="200" cy="306" rx="36" ry="30" fill="#4a1018" stroke="#b86a0a" strokeWidth="2" />
        <ellipse cx="200" cy="324" rx="20" ry="8" fill="#e0606a" />
      </g>
      <path d="M190 290 Q200 295 210 290 L200 306 Z" fill="#d98612" stroke="#b86a0a" strokeWidth="2" strokeLinejoin="round" {...rig('desce', { k: 12 })} />
      <path d="M176 270 Q200 260 224 270 L200 298 Z" fill="#f5a524" stroke="#b86a0a" strokeWidth="2" strokeLinejoin="round" />
      <Capacete y={8} />
    </g>
  );
}

function Operario() {
  return (
    <g {...rig('respira', { k: 3 })}>
      <path d="M70 400 Q72 318 150 300 L250 300 Q328 318 330 400 Z" fill={COR.corpo} stroke={COR.ceu} strokeWidth="4" />
      <Colete topo={306} largura={250} />
      <rect x="176" y="268" width="48" height="42" rx="12" fill="#c98d68" />
      <ellipse cx="114" cy="220" rx="16" ry="24" fill="#c98d68" />
      <ellipse cx="286" cy="220" rx="16" ry="24" fill="#c98d68" />
      <ellipse cx="200" cy="214" rx="86" ry="96" fill="#d9a07a" />
      <g {...rig('desce', { k: 5 })}><path d="M140 262 Q200 330 260 262" fill="#d9a07a" /></g>
      <path d="M142 172 q20 -12 40 0 M218 172 q20 -12 40 0" fill="none" stroke="#3b2618" strokeWidth="8" strokeLinecap="round" />
      {[162, 238].map((cx) => (
        <g key={cx} {...rig('pisca', { cx, cy: 200 })}>
          <ellipse cx={cx} cy="200" rx="20" ry="23" fill="#ffffff" />
          <g {...rig('olhar', { k: 6 })}>
            <circle cx={cx} cy="202" r="12" fill="#1d3a5c" />
            <circle cx={cx} cy="202" r="6" fill="#050a12" />
            <circle cx={cx - 4} cy="197" r="3.5" fill="#ffffff" />
          </g>
        </g>
      ))}
      <path d="M196 214 q4 16 -6 22" fill="none" stroke="#b07a58" strokeWidth="4" strokeLinecap="round" />
      <g {...rig('abre', { cx: 200, cy: 256, min: 0.14 })}>
        <ellipse cx="200" cy="268" rx="30" ry="20" fill="#4a1418" />
        <ellipse cx="200" cy="278" rx="16" ry="7" fill="#d9555e" />
      </g>
      <path d="M170 256 Q200 266 230 256" fill="none" stroke="#7a3a2a" strokeWidth="4" strokeLinecap="round" />
      <Capacete y={-6} />
    </g>
  );
}

function Robo() {
  return (
    <g {...rig('respira', { k: 3 })}>
      <path d="M78 400 Q80 330 150 316 L250 316 Q320 330 322 400 Z" fill={COR.corpo} stroke={COR.ceu} strokeWidth="4" />
      <Colete topo={322} largura={240} />
      <rect x="182" y="292" width="36" height="30" rx="8" fill="#22395a" />
      <rect x="70" y="178" width="30" height="70" rx="12" fill="#22395a" stroke={COR.ceu} strokeWidth="3" />
      <rect x="300" y="178" width="30" height="70" rx="12" fill="#22395a" stroke={COR.ceu} strokeWidth="3" />
      <rect x="92" y="128" width="216" height="174" rx="52" fill={COR.corpo} stroke={COR.ceu} strokeWidth="5" />
      <rect x="116" y="158" width="168" height="118" rx="34" fill="#050b14" stroke={COR.navy} strokeWidth="4" />
      {[166, 234].map((cx) => (
        <g key={cx} {...rig('pisca', { cx, cy: 196 })}>
          <g {...rig('olhar', { k: 7 })}>
            <rect x={cx - 20} y="178" width="40" height="36" rx="16" fill={COR.ceu} opacity="0.25" />
            <rect x={cx - 14} y="182" width="28" height="28" rx="12" fill={COR.ceu} />
          </g>
        </g>
      ))}
      <line x1="138" y1="246" x2="262" y2="246" stroke={COR.verde} strokeWidth="2" opacity="0.25" />
      <g {...rig('abre', { cx: 200, cy: 246, min: 0.12 })}>
        <path d="M138 246 H168 L176 232 L186 266 L198 220 L210 270 L220 238 L228 246 H262" fill="none" stroke={COR.verde} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      <Capacete y={-8} />
    </g>
  );
}

type VarianteVetorial = Exclude<VarianteAvatar, 'coruja-a' | 'coruja-3d'>;
const DESENHOS: Record<VarianteVetorial, () => ReactNode> = { coruja: Coruja, operario: Operario, robo: Robo };

export interface AvatarLucaProps {
  variante?: VarianteAvatar;
  voz?: EstadoVoz;
  /** Nível de áudio 0..1 lido a cada quadro (ref para não re-renderizar). */
  nivel?: { current: number };
  /** Desliga o laço (export estático e print comparativo). */
  parado?: boolean;
  className?: string;
}

export default function AvatarLuca(props: AvatarLucaProps) {
  const { variante = VARIANTE_PADRAO, voz = 'ocioso', nivel, parado = false, className } = props;
  const nivelInterno = useRef(0);
  if (variante === 'coruja-a') return <AvatarCorujaA voz={voz} nivel={nivel ?? nivelInterno} parado={parado} className={className} />;
  if (variante === 'coruja-3d') return <AvatarCoruja3D voz={voz} nivel={nivel ?? nivelInterno} parado={parado} className={className} />;
  return <AvatarVetorial {...props} variante={variante} />;
}

function AvatarVetorial({ variante, voz = 'ocioso', nivel, parado = false, className }: AvatarLucaProps & { variante: VarianteVetorial }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const vozRef = useRef(voz);
  vozRef.current = voz;
  const nivelInterno = useRef(0);
  const nivelRef = nivel ?? nivelInterno;

  useEffect(() => {
    if (parado || !svgRef.current) return undefined;
    return animarAvatar(svgRef.current, () => vozRef.current, nivelRef);
  }, [parado, variante, nivelRef]);

  const Desenho = DESENHOS[variante];
  return (
    <svg ref={svgRef} viewBox="0 0 400 400" className={className} role="img" aria-label="Avatar LUCA" data-variante={variante} data-voz={voz} xmlns="http://www.w3.org/2000/svg">
      <Desenho />
    </svg>
  );
}
