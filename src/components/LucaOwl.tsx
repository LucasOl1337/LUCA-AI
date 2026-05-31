/**
 * LucaOwl — usa a imagem real da coruja cyber (salva em /public/cyber-owl.jpg).
 * Apenas o enquadramento, recorte circular e animações são customizados.
 */

interface LucaOwlProps {
  size?: number;
  alive?: boolean;
}

export default function LucaOwl({ size = 300, alive = true }: LucaOwlProps) {
  const pulse = alive ? '#00c8f0' : '#406888';

  return (
    <div
      className="relative select-none pointer-events-none"
      style={{ width: size, height: size }}
    >
      {/* ── halo atmosférico ciano ── */}
      <div
        className="absolute rounded-full animate-breathe"
        style={{
          inset: '-14%',
          background:
            'radial-gradient(circle, rgba(0,190,255,0.20) 0%, rgba(20,10,70,0.12) 52%, transparent 74%)',
          filter: 'blur(36px)',
        }}
      />

      {/* ── anéis de gelo girando ── */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 w-full h-full animate-spiral-slow overflow-visible"
      >
        <circle cx="100" cy="100" r="102" fill="none" stroke="#1a3090" strokeWidth="1"    strokeDasharray="12 10" opacity="0.40" />
        <circle cx="100" cy="100" r="107" fill="none" stroke="#2050c0" strokeWidth="0.5"  strokeDasharray="3 18"  opacity="0.20" />
      </svg>
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 w-full h-full animate-spiral-reverse overflow-visible"
      >
        <circle cx="100" cy="100" r="98"  fill="none" stroke="#60a8e8" strokeWidth="0.4"  strokeDasharray="5 26"  opacity="0.14" />
      </svg>

      {/* ── container circular com a imagem real ── */}
      <div
        className="absolute"
        style={{
          inset: 0,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '2px solid rgba(40,80,180,0.55)',
          boxShadow:
            '0 0 0 1px rgba(20,40,120,0.30), 0 0 32px rgba(0,180,255,0.18), 0 0 80px rgba(0,140,220,0.10)',
        }}
      >
        {/*
          A imagem original mostra a coruja com asas abertas, centralizada.
          object-position: ajusta o enquadramento para mostrar o rosto + asas.
        */}
        <img
          src="/cyber-owl.jpg"
          alt="LUCA owl"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 20%',
            display: 'block',
          }}
        />
      </div>

      {/* ── ECG ciano sobre a imagem ── */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 w-full h-full overflow-visible"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          <linearGradient id="ow-ecg2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={pulse} stopOpacity="0" />
            <stop offset="50%"  stopColor={pulse} />
            <stop offset="100%" stopColor={pulse} stopOpacity="0" />
          </linearGradient>
          <clipPath id="ow-circle2">
            <circle cx="100" cy="100" r="99" />
          </clipPath>
        </defs>

        {/* estrelas decorativas fora do círculo */}
        <g fill="#c0d8ff" opacity="0.32">
          <circle cx="16"  cy="72"  r="1.1" />
          <circle cx="12"  cy="100" r="1.4" />
          <circle cx="18"  cy="128" r="1.0" />
          <circle cx="184" cy="72"  r="1.1" />
          <circle cx="188" cy="100" r="1.4" />
          <circle cx="182" cy="128" r="1.0" />
          <circle cx="55"  cy="14"  r="1.0" />
          <circle cx="100" cy="10"  r="1.3" />
          <circle cx="145" cy="14"  r="1.0" />
        </g>

        {/* ECG na base */}
        <g transform="translate(0 188)" clipPath="url(#ow-circle2)">
          <line x1="18" y1="0" x2="182" y2="0" stroke="rgba(0,150,220,0.15)" strokeWidth="0.6" />
          <path
            d="M 18 0 L 66 0 L 74 0 L 82 -17 L 90 22 L 98 -26 L 106 11 L 114 0 L 182 0"
            fill="none"
            stroke="url(#ow-ecg2)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="1000"
            className="animate-ecg-sweep"
          />
          <path
            d="M 18 0 L 66 0 L 74 0 L 82 -17 L 90 22 L 98 -26 L 106 11 L 114 0 L 182 0"
            fill="none"
            stroke={pulse}
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.22"
          />
        </g>
      </svg>
    </div>
  );
}
