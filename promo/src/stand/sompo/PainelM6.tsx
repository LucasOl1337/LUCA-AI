import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, type CalculateMetadataFunction } from 'remotion';
import { AvatarCanto } from '../AvatarCanto.tsx';
import { Legenda, SeloVerdade } from '../Legenda.tsx';
import { ZoomCursor } from '../ZoomCursor.tsx';
import { COR, FONTE, FPS, MARGEM, s, type Rastro } from '../estilo.ts';
import type { LinhaDoTempo } from './linha-do-tempo.ts';

/**
 * Vídeos M6 (painel-sompo e painel-segurado). Tudo vem por props geradas por
 * `montar.mjs`: captura real (cena.mp4 + rastro), narração por bloco e a
 * linha do tempo. Nenhuma tela é desenhada aqui; só moldura, selo e legenda.
 */
export type PropsPainel = {
  titulo: string;
  captura: string;
  rastro: Rastro;
  linha: LinhaDoTempo;
  /** Cartão de fechamento (bloco sem tela de produto). */
  fechamento: { linha1: string; linha2: string };
};

const Cartao: React.FC<{ linha1: string; linha2: string }> = ({ linha1, linha2 }) => (
  <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, #12223a 0%, ${COR.fundo} 70%)`, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
    <Img src={staticFile('brand/cyber-owl.jpg')} style={{ width: 180, height: 180, borderRadius: '50%', border: `3px solid ${COR.ciano}`, objectFit: 'cover' }} />
    <div style={{ color: COR.texto, font: `800 64px/1.1 ${FONTE.texto}`, letterSpacing: '-.02em', textAlign: 'center', maxWidth: 1400 }}>{linha1}</div>
    <div style={{ color: COR.ciano, font: `600 30px/1.2 ${FONTE.mono}`, letterSpacing: '.04em', textAlign: 'center' }}>{linha2}</div>
  </AbsoluteFill>
);

const Fonte: React.FC<{ texto: string }> = ({ texto }) => (
  <div style={{ position: 'absolute', left: MARGEM, bottom: 150, zIndex: 26, padding: '8px 14px', borderRadius: 10, background: 'rgba(9,12,17,.82)', color: COR.suave, font: `500 22px/1.2 ${FONTE.mono}` }}>{texto}</div>
);

export const PainelM6: React.FC<PropsPainel> = ({ captura, rastro, linha, fechamento }) => (
  <AbsoluteFill style={{ background: COR.fundo }}>
    <style>{`@font-face{font-family:'Luca Mono';src:url('${staticFile('brand/jetbrains-mono.woff2')}') format('woff2');font-weight:100 900}`}</style>
    {linha.planos.map((plano, i) => (
      <Sequence key={`p${i}`} from={s(plano.de)} durationInFrames={Math.max(1, s(plano.de + plano.dur) - s(plano.de))}>
        {plano.inicioCaptura === null
          ? <Cartao {...fechamento} />
          : <ZoomCursor src={captura} rastro={rastro} inicio={plano.inicioCaptura} />}
      </Sequence>
    ))}
    {linha.blocos.map((bloco) => (
      <Sequence key={bloco.id} from={s(bloco.de)} durationInFrames={Math.max(1, s(bloco.de + bloco.dur) - s(bloco.de))}>
        {bloco.narracao ? (
          <Sequence from={s(0.35)}>
            <Audio src={staticFile(bloco.narracao)} />
            <AvatarCanto narracao={bloco.narracao} />
          </Sequence>
        ) : <AvatarCanto />}
        <SeloVerdade verdade={bloco.verdade} detalhe={bloco.detalhe} />
        {bloco.fonte ? <Fonte texto={bloco.fonte} /> : null}
      </Sequence>
    ))}
    <Legenda trechos={linha.trechos} />
  </AbsoluteFill>
);

export const metadadosPainel: CalculateMetadataFunction<PropsPainel> = ({ props }) => ({
  durationInFrames: Math.max(1, Math.ceil(props.linha.total * FPS)),
});

export const PROPS_VAZIAS: PropsPainel = {
  titulo: '',
  captura: 'captura/cena.mp4',
  rastro: { viewport: { largura: 1920, altura: 1080 }, cliques: [], cursor: [], marcas: {} },
  linha: { total: 1, blocos: [], planos: [], trechos: [] },
  fechamento: { linha1: '', linha2: '' },
};
