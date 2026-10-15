import React from 'react';
import { AbsoluteFill, Composition, registerRoot, staticFile } from 'remotion';
import { AvatarCanto } from './AvatarCanto.tsx';
import { Legenda, SeloVerdade } from './Legenda.tsx';
import { ZoomCursor } from './ZoomCursor.tsx';
import { ALTURA, COR, FPS, LARGURA, s, type Rastro } from './estilo.ts';

// Raiz Remotion dos Vídeos do stand. Cada missão registra a própria
// composição aqui (M5: PipelineCompleto; M6: PainelSompo, PainelSegurado).
// Render: npx remotion render promo/src/stand/index.tsx <Id> <saida.mp4> --public-dir=<assets>

const rastroTeste: Rastro = {
  viewport: { largura: 1920, altura: 1080 },
  cliques: [{ t: 1.6, x: 1180, y: 300 }],
  cursor: [{ t: 0, x: 700, y: 700 }, { t: 1.6, x: 1180, y: 300 }, { t: 4.5, x: 1100, y: 420 }],
  marcas: {},
};

/** Composição de prova da base: zoom, avatar, legenda e selo juntos. */
const StandBase: React.FC = () => (
  <AbsoluteFill style={{ background: COR.fundo }}>
    <style>{`@font-face{font-family:'Luca Mono';src:url('${staticFile('brand/jetbrains-mono.woff2')}') format('woff2');font-weight:100 900}`}</style>
    <ZoomCursor src="captures/01-home.png" rastro={rastroTeste} caixa={{ x: 0, y: 0, largura: LARGURA, altura: ALTURA }} />
    <AvatarCanto />
    <SeloVerdade verdade="real" detalhe="tela do app" />
    <Legenda trechos={[{ inicio: 0, fim: 5, texto: 'Base dos vídeos do stand: zoom no cursor, avatar e legenda.' }]} />
  </AbsoluteFill>
);

const Raiz: React.FC = () => (
  <>
    <Composition id="StandBase" component={StandBase} durationInFrames={s(5)} fps={FPS} width={LARGURA} height={ALTURA} />
  </>
);

registerRoot(Raiz);
