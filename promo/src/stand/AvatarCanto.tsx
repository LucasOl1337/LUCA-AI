import React from 'react';
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { useAudioData, visualizeAudio } from '@remotion/media-utils';
import { COR, FONTE, MARGEM } from './estilo.ts';

/**
 * Avatar do LUCA no canto superior esquerdo.
 * PONTO DE TROCA ÚNICO: placeholder = coruja da marca. Quando a M2 fechar a
 * variante do avatar (SVG), só este arquivo muda; as composições não.
 */
export const AvatarCanto: React.FC<{ narracao?: string; tamanho?: number }> = ({ narracao, tamanho = 132 }) =>
  narracao ? <AvatarComAudio narracao={narracao} tamanho={tamanho} /> : <AvatarVisual nivel={0} tamanho={tamanho} />;

const AvatarComAudio: React.FC<{ narracao: string; tamanho: number }> = ({ narracao, tamanho }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audio = useAudioData(staticFile(narracao));
  let nivel = 0;
  if (audio) {
    const bandas = visualizeAudio({ fps, frame, audioData: audio, numberOfSamples: 16, smoothing: true });
    nivel = Math.min(1, (bandas.slice(0, 6).reduce((a, b) => a + b, 0) / 6) * 4);
  }
  return <AvatarVisual nivel={nivel} tamanho={tamanho} />;
};

const AvatarVisual: React.FC<{ nivel: number; tamanho: number }> = ({ nivel, tamanho }) => {
  const frame = useCurrentFrame();
  const respira = 0.5 + 0.5 * Math.sin(frame / 22);
  const anel = Math.max(nivel, respira * 0.18);
  return (
    <div style={{ position: 'absolute', left: MARGEM, top: MARGEM * 0.6, display: 'flex', alignItems: 'center', gap: 18, zIndex: 20 }}>
      <div style={{ position: 'relative', width: tamanho, height: tamanho }}>
        <div style={{ position: 'absolute', inset: -10 - anel * 14, borderRadius: '50%', border: `${3 + anel * 5}px solid ${COR.ciano}`, opacity: interpolate(anel, [0, 1], [0.35, 0.95]), boxShadow: `0 0 ${20 + anel * 50}px ${COR.azul}` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', border: `2px solid rgba(255,255,255,.2)`, background: COR.superficie }}>
          <Img src={staticFile('brand/cyber-owl.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ color: COR.texto, font: `800 40px/1 ${FONTE.texto}`, letterSpacing: '-.02em' }}>LUCA</span>
        <span style={{ color: COR.ciano, font: `600 18px/1 ${FONTE.mono}`, letterSpacing: '.08em', textTransform: 'uppercase', padding: '6px 10px', border: `1px solid ${COR.ciano}55`, borderRadius: 8, background: 'rgba(9,12,17,.7)' }}>Assistente de IA</span>
      </div>
    </div>
  );
};
