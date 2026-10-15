import React from 'react';
import { Img, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { COR, FPS, type Rastro } from './estilo.ts';
import { cameraEm, cursorEm, pulsoEm } from './zoom-camera.ts';

/**
 * Captura real com zoom no cursor (estilo Screen Studio) guiado pelo rastro.
 * `inicio` = segundo da captura que corresponde ao frame 0 desta Sequence.
 */
export const ZoomCursor: React.FC<{
  src: string;
  rastro: Rastro;
  inicio?: number;
  /** Mostra o cursor desenhado (a captura headless não grava o ponteiro). */
  cursor?: boolean;
  /** Retângulo de destino no quadro final. */
  caixa?: { x: number; y: number; largura: number; altura: number };
}> = ({ src, rastro, inicio = 0, cursor = true, caixa = { x: 0, y: 0, largura: 1920, altura: 1080 } }) => {
  const frame = useCurrentFrame();
  const t = inicio + frame / FPS;
  const cam = cameraEm(t, rastro);
  const ponto = cursorEm(t, rastro.cursor);
  const pulso = pulsoEm(t, rastro.cliques);
  const ajuste = caixa.largura / rastro.viewport.largura;
  return (
    <div style={{ position: 'absolute', left: caixa.x, top: caixa.y, width: caixa.largura, height: caixa.altura, overflow: 'hidden', borderRadius: 18, background: COR.superficie, boxShadow: '0 30px 90px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.12)' }}>
      <div style={{ position: 'absolute', width: rastro.viewport.largura, height: rastro.viewport.altura, transformOrigin: '0 0', transform: `scale(${ajuste}) translate(${cam.tx}px, ${cam.ty}px) scale(${cam.escala})` }}>
        {/\.(png|jpe?g|webp)$/i.test(src)
          ? <Img src={staticFile(src)} style={{ width: '100%', height: '100%' }} />
          : <OffthreadVideo src={staticFile(src)} startFrom={Math.round(inicio * FPS)} muted style={{ width: '100%', height: '100%' }} />}
        {cursor && ponto ? (
          <div style={{ position: 'absolute', left: ponto.x, top: ponto.y, transform: `scale(${1 / cam.escala * 1.15})`, transformOrigin: '0 0' }}>
            <div style={{ position: 'absolute', left: -28, top: -28, width: 56, height: 56, borderRadius: 99, border: `3px solid ${COR.ciano}`, opacity: pulso, transform: `scale(${1.6 - pulso * 0.6})` }} />
            <svg viewBox="0 0 40 48" width="34" height="41" aria-hidden="true" style={{ position: 'absolute', left: -4, top: -3 }}>
              <path d="M5 3 34 29l-14 2 8 13-8 4-8-14-9 10Z" fill="white" stroke="#06101b" strokeWidth="3" strokeLinejoin="round" />
            </svg>
          </div>
        ) : null}
      </div>
    </div>
  );
};
