import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COR, FONTE, MARGEM, type Trecho, type Verdade } from './estilo.ts';
import { trechoEm } from './legendas.ts';

/** Legenda grande (até 2 linhas), legível a 2–3 m do monitor do trator. */
export const Legenda: React.FC<{ trechos: Trecho[]; desloca?: number }> = ({ trechos, desloca = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const atual = trechoEm(desloca + frame / fps, trechos);
  if (!atual) return null;
  return (
    <div style={{ position: 'absolute', left: MARGEM * 2, right: MARGEM * 2, bottom: MARGEM * 0.8, display: 'flex', justifyContent: 'center', zIndex: 30 }}>
      <div style={{ maxWidth: 1500, padding: '14px 30px', borderRadius: 16, background: 'rgba(9,12,17,.82)', color: COR.texto, font: `700 46px/1.22 ${FONTE.texto}`, textAlign: 'center', letterSpacing: '-.01em', boxShadow: '0 10px 40px rgba(0,0,0,.45)' }}>
        {atual.texto}
      </div>
    </div>
  );
};

const TOM: Record<Verdade, string> = {
  real: COR.verde,
  'equipamento físico': COR.verde,
  simulado: COR.alerta,
  demonstrativo: COR.alerta,
  esquema: COR.ciano,
};

/** Selo de verdade no canto superior direito: o que está na tela é real, simulado ou esquema. */
export const SeloVerdade: React.FC<{ verdade: Verdade; detalhe?: string }> = ({ verdade, detalhe }) => (
  <div style={{ position: 'absolute', right: MARGEM, top: MARGEM * 0.7, zIndex: 25, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 12, background: 'rgba(9,12,17,.8)', border: `1px solid ${TOM[verdade]}66`, color: TOM[verdade], font: `700 22px/1 ${FONTE.mono}`, textTransform: 'uppercase', letterSpacing: '.06em' }}>
    <span style={{ width: 12, height: 12, borderRadius: 99, background: TOM[verdade] }} />
    {verdade}
    {detalhe ? <span style={{ color: COR.suave, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>· {detalhe}</span> : null}
  </div>
);
