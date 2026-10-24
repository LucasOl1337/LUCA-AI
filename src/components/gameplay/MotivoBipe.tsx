import { useEffect, useState } from 'react';

/** Quanto tempo o motivo fica na tela depois de aparecer (discreto: não disputa com a imersão). */
export const MOTIVO_BIPE_MS = 2600;

/**
 * Texto vermelho discreto com o motivo do apito (Lucas, 24/10): aparece quando o
 * alarme começa ou muda de causa, some sozinho em ~2,6 s e não volta enquanto a
 * mesma causa segue apitando. `motivo` null = mudo (esconde na hora).
 */
export function MotivoBipe({ motivo }: { motivo: string | null }) {
  const [visivel, setVisivel] = useState<string | null>(null);
  useEffect(() => {
    if (!motivo) { setVisivel(null); return; }
    setVisivel(motivo);
    const relogio = window.setTimeout(() => setVisivel((atual) => (atual === motivo ? null : atual)), MOTIVO_BIPE_MS);
    return () => window.clearTimeout(relogio);
  }, [motivo]);
  if (!visivel) return null;
  return <p className="circuito-motivo-bipe" role="status" data-motivo-bipe="">{visivel}</p>;
}
