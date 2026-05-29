import { useMemo } from 'react';

/**
 * LucaOwl — a peça central da LUC.AI, no estilo "Wild Lotus".
 *
 * Um medalhão de laca navy (como as partes azuis da AK) suspenso sobre a
 * porcelana, com a coruja-marca em marfim, contorno navy e filigrana dourada.
 * Embaixo, o pulso ECG verde — o sinal de vida do sistema.
 *
 * Camadas (modelo KamuiVoid):
 *  - bloom dourado respirando;
 *  - anéis de filigrana girando devagar;
 *  - medalhão navy lacado (o "scope");
 *  - coruja marfim com contorno navy + ornamento dourado;
 *  - olhos que piscam;
 *  - pulso ECG varrendo;
 *  - partículas douradas flutuando.
 *
 * Respeita prefers-reduced-motion via regra global em index.css.
 */

interface LucaOwlProps {
  size?: number;
  alive?: boolean;
}

const VB = 200;
const C = VB / 2; // 100

// paleta Wild Lotus
const IVORY = '#F5F1E8';
const IVORY_HI = '#fffdf7';
const NAVY = '#1E3A6C';
const NAVY_DEEP = '#0F2849';
const GOLD = '#D4AF37';
const GOLD_HI = '#F4D03F';

export default function LucaOwl({ size = 300, alive = true }: LucaOwlProps) {
  const particles = useMemo(() => {
    return Array.from({ length: 18 }).map((_, i) => {
      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 84 + Math.random() * 22;
      const x = C + Math.cos(angle) * radius;
      const y = C + Math.sin(angle) * radius;
      const delay = Math.random() * 12;
      const dur = 16 + Math.random() * 16;
      const op = 0.2 + Math.random() * 0.4;
      const r = 0.5 + Math.random() * 1.0;
      return { x, y, delay, dur, op, r, id: i };
    });
  }, []);

  const pulse = alive ? '#2f9e6a' : GOLD;

  return (
    <div className="relative select-none pointer-events-none" style={{ width: size, height: size }}>
      {/* bloom dourado respirando */}
      <div
        className="absolute rounded-full animate-breathe"
        style={{
          inset: '-10%',
          background:
            'radial-gradient(circle at 50% 50%, rgba(212,175,55,0.30) 0%, rgba(46,90,160,0.12) 40%, rgba(47,158,106,0.05) 60%, transparent 75%)',
          filter: 'blur(26px)',
        }}
      />

      {/* anéis de filigrana — girando devagar */}
      <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 w-full h-full animate-spiral-slow overflow-visible">
        {[96, 90, 84].map((r, i) => (
          <circle
            key={r}
            cx={C}
            cy={C}
            r={r}
            fill="none"
            stroke={GOLD}
            strokeWidth="0.6"
            strokeDasharray={`${20 - i * 4} ${6 + i * 2}`}
            opacity={0.5 - i * 0.12}
          />
        ))}
      </svg>
      <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 w-full h-full animate-spiral-reverse overflow-visible">
        {[100, 92].map((r, i) => (
          <circle
            key={r}
            cx={C}
            cy={C}
            r={r}
            fill="none"
            stroke={NAVY}
            strokeWidth="0.4"
            strokeDasharray={`${6 + i * 3} ${12 + i * 4}`}
            opacity={0.3 - i * 0.1}
          />
        ))}
      </svg>

      {/* medalhão + coruja */}
      <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          {/* laca navy do medalhão */}
          <radialGradient id="luca-medal" cx="50%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#27508f" />
            <stop offset="55%" stopColor={NAVY} />
            <stop offset="100%" stopColor={NAVY_DEEP} />
          </radialGradient>
          {/* corpo marfim da coruja */}
          <radialGradient id="luca-ivory" cx="44%" cy="30%" r="78%">
            <stop offset="0%" stopColor={IVORY_HI} />
            <stop offset="70%" stopColor={IVORY} />
            <stop offset="100%" stopColor="#e6ddc9" />
          </radialGradient>
          {/* ouro filigrana */}
          <linearGradient id="luca-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={GOLD_HI} />
            <stop offset="100%" stopColor={GOLD} />
          </linearGradient>
          <linearGradient id="luca-ecg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={pulse} stopOpacity="0" />
            <stop offset="50%" stopColor={pulse} />
            <stop offset="100%" stopColor={pulse} stopOpacity="0" />
          </linearGradient>
          <filter id="luca-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
        </defs>

        {/* medalhão navy lacado */}
        <circle cx={C} cy={C} r={78} fill="url(#luca-medal)" />
        <circle cx={C} cy={C} r={78} fill="none" stroke={GOLD} strokeWidth="1.4" opacity="0.8" />
        <circle cx={C} cy={C} r={72} fill="none" stroke={GOLD} strokeWidth="0.5" opacity="0.4" />
        {/* brilho especular do verniz */}
        <ellipse cx={C - 22} cy={C - 30} rx={26} ry={16} fill="#ffffff" opacity="0.06" transform={`rotate(-28 ${C - 22} ${C - 30})`} />

        {/* ─── coruja marfim ─── */}
        <g>
          {/* tufos de orelha */}
          <path d="M 74 56 L 84 33 L 96 58 Z" fill="url(#luca-ivory)" stroke={NAVY} strokeWidth="2" strokeLinejoin="round" />
          <path d="M 126 56 L 116 33 L 104 58 Z" fill="url(#luca-ivory)" stroke={NAVY} strokeWidth="2" strokeLinejoin="round" />

          {/* corpo/cabeça */}
          <ellipse cx={C} cy={104} rx={46} ry={54} fill="url(#luca-ivory)" stroke={NAVY} strokeWidth="2.4" />

          {/* filigrana dourada nas asas */}
          <path d="M 60 84 Q 50 116 66 148" fill="none" stroke="url(#luca-gold)" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M 140 84 Q 150 116 134 148" fill="none" stroke="url(#luca-gold)" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M 64 96 q 8 4 6 14" fill="none" stroke="url(#luca-gold)" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
          <path d="M 136 96 q -8 4 -6 14" fill="none" stroke="url(#luca-gold)" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />

          {/* disco facial */}
          <path
            d="M 100 70 Q 70 70 70 98 Q 70 122 100 122 Q 130 122 130 98 Q 130 70 100 70 Z"
            fill="rgba(30,58,108,0.05)"
            stroke="rgba(168,128,26,0.4)"
            strokeWidth="0.8"
          />

          {/* olhos navy com íris dourada — piscam */}
          <g className="animate-blink" style={{ transformOrigin: `82px 92px` }}>
            <circle cx={82} cy={92} r={15} fill={IVORY_HI} stroke={NAVY} strokeWidth="2" />
            <circle cx={82} cy={92} r={9} fill="url(#luca-gold)" />
            <circle cx={82} cy={92} r={4.5} fill={NAVY_DEEP} />
            <circle cx={79.5} cy={89.5} r={1.8} fill={IVORY_HI} opacity="0.95" />
          </g>
          <g className="animate-blink" style={{ transformOrigin: `118px 92px`, animationDelay: '0.1s' }}>
            <circle cx={118} cy={92} r={15} fill={IVORY_HI} stroke={NAVY} strokeWidth="2" />
            <circle cx={118} cy={92} r={9} fill="url(#luca-gold)" />
            <circle cx={118} cy={92} r={4.5} fill={NAVY_DEEP} />
            <circle cx={115.5} cy={89.5} r={1.8} fill={IVORY_HI} opacity="0.95" />
          </g>

          {/* bico dourado */}
          <path d="M 100 100 L 93 109 L 100 117 L 107 109 Z" fill="url(#luca-gold)" stroke={NAVY} strokeWidth="0.8" />

          {/* filigrana de lótus no peito */}
          <g stroke="url(#luca-gold)" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 100 128 q -7 6 0 13 q 7 -7 0 -13 Z" strokeWidth="1.3" />
            <path d="M 100 128 q -13 3 -16 11" strokeWidth="1" opacity="0.8" />
            <path d="M 100 128 q 13 3 16 11" strokeWidth="1" opacity="0.8" />
            <circle cx={100} cy={126} r={1.6} fill="url(#luca-gold)" stroke="none" />
          </g>

          {/* pés */}
          <path d="M 90 156 l -4 6 m 4 -6 l 0 7 m 0 -7 l 4 6" stroke={NAVY} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M 110 156 l -4 6 m 4 -6 l 0 7 m 0 -7 l 4 6" stroke={NAVY} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </g>

        {/* ─── pulso ECG ─── */}
        <g transform="translate(0 176)">
          <line x1={32} y1={0} x2={168} y2={0} stroke="rgba(30,58,108,0.18)" strokeWidth="0.6" />
          <g filter="url(#luca-soft)">
            <path
              d="M 32 0 L 70 0 L 78 0 L 84 -14 L 92 18 L 100 -22 L 108 8 L 114 0 L 168 0"
              fill="none"
              stroke="url(#luca-ecg)"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="1000"
              className="animate-ecg-sweep"
            />
          </g>
          <path
            d="M 32 0 L 70 0 L 78 0 L 84 -14 L 92 18 L 100 -22 L 108 8 L 114 0 L 168 0"
            fill="none"
            stroke={pulse}
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.3"
          />
        </g>
      </svg>

      {/* partículas douradas flutuantes */}
      <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 w-full h-full overflow-visible">
        {particles.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill={GOLD}
            opacity={p.op * 0.6}
            style={{
              animation: `drift ${p.dur}s ease-in-out ${p.delay}s infinite`,
              transformOrigin: `${p.x}px ${p.y}px`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
