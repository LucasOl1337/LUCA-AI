import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, type CalculateMetadataFunction } from 'remotion';
import { AvatarCanto } from '../AvatarCanto.tsx';
import { Legenda, SeloVerdade } from '../Legenda.tsx';
import { ZoomCursor } from '../ZoomCursor.tsx';
import { COR, FONTE, FPS, s, type Rastro } from '../estilo.ts';
import type { LinhaDoTempo } from '../sompo/linha-do-tempo.ts';

/**
 * Vídeo pipeline-completo (M5). Props geradas por `montar.mjs`: captura real
 * (cena.mp4 + rastro), narração por bloco e a linha do tempo. Só o bloco do
 * esquema (b2) e o fechamento são desenhados aqui, e o selo diz isso.
 */
export type PropsPipeline = {
  captura: string;
  rastro: Rastro;
  linha: LinhaDoTempo;
  /** Bloco desenhado como esquema (sem tela de produto). */
  blocoEsquema: string;
};

const NOS = [
  { titulo: 'Sensor na frente', sub: 'mede a distância' },
  { titulo: 'Placa do equipamento', sub: 'lê o sensor' },
  { titulo: 'Internet', sub: 'leva as leituras' },
  { titulo: 'Painel do LUCA', sub: 'mostra e grava' },
];

/** Esquema animado: trator → sensor → placa → internet → painel. Desenho, não tela do app. */
const Esquema: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const larguraNo = 330;
  const passo = 430;
  const x0 = (1920 - (passo * 3 + larguraNo)) / 2;
  const yNo = 600;
  const onda = (t * 0.9) % 1;
  const pulso = (t * 0.45) % 1; // percorre a cadeia
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 35%, #102037 0%, ${COR.fundo} 72%)` }}>
      {/* trator e fardo, com a onda do sensor */}
      <svg viewBox="0 0 1920 1080" width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <line x1={300} y1={430} x2={1620} y2={430} stroke="rgba(255,255,255,.14)" strokeWidth={3} />
        <g transform={`translate(${520 + Math.sin(t * 1.4) * 6}, 300)`}>
          <rect x={0} y={40} width={210} height={70} rx={12} fill="#2f8f4e" />
          <rect x={30} y={-10} width={90} height={60} rx={8} fill="#2f8f4e" stroke="#0b1520" strokeWidth={4} />
          <circle cx={45} cy={115} r={42} fill="#151a22" stroke="#4a5568" strokeWidth={8} />
          <circle cx={180} cy={122} r={28} fill="#151a22" stroke="#4a5568" strokeWidth={6} />
          <rect x={208} y={58} width={20} height={26} rx={4} fill={COR.ciano} />
        </g>
        {[0, 1, 2].map((i) => {
          const k = (onda + i / 3) % 1;
          return <path key={i} d={`M ${760 + k * 520} ${342 - 30 - k * 40} q ${18 + k * 20} ${30 + k * 40} 0 ${60 + k * 80}`} fill="none" stroke={COR.ciano} strokeWidth={5} opacity={1 - k} />;
        })}
        <rect x={1320} y={330} width={150} height={100} rx={18} fill="#c9a24a" stroke="#7a5c1c" strokeWidth={5} />
        <text x={1395} y={470} fill={COR.suave} fontSize={28} fontFamily={FONTE.texto} textAnchor="middle">obstáculo</text>
        {/* cadeia */}
        {NOS.slice(0, -1).map((_, i) => (
          <line key={i} x1={x0 + passo * i + larguraNo} y1={yNo + 70} x2={x0 + passo * (i + 1)} y2={yNo + 70} stroke="rgba(100,210,255,.35)" strokeWidth={4} strokeDasharray="10 10" />
        ))}
        <circle cx={x0 + larguraNo / 2 + pulso * passo * 3} cy={yNo + 70} r={12} fill={COR.ciano} />
        <path d={`M 738 ${342 + 30} C 738 500, ${x0 + larguraNo / 2} 520, ${x0 + larguraNo / 2} ${yNo}`} fill="none" stroke="rgba(100,210,255,.35)" strokeWidth={4} strokeDasharray="10 10" />
      </svg>
      {NOS.map((no, i) => {
        const entra = interpolate(t, [0.3 + i * 0.6, 0.9 + i * 0.6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={no.titulo} style={{ position: 'absolute', left: x0 + passo * i, top: yNo, width: larguraNo, height: 140, borderRadius: 20, background: 'rgba(16,20,27,.92)', border: `2px solid ${COR.ciano}55`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: entra, transform: `translateY(${(1 - entra) * 24}px)` }}>
            <div style={{ color: COR.texto, font: `700 34px/1.1 ${FONTE.texto}` }}>{no.titulo}</div>
            <div style={{ color: COR.suave, font: `500 26px/1.1 ${FONTE.mono}` }}>{no.sub}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Fechamento: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, #12223a 0%, ${COR.fundo} 70%)`, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
    <Img src={staticFile('brand/cyber-owl.jpg')} style={{ width: 180, height: 180, borderRadius: '50%', border: `3px solid ${COR.ciano}`, objectFit: 'cover' }} />
    <div style={{ color: COR.texto, font: `800 64px/1.1 ${FONTE.texto}`, letterSpacing: '-.02em', textAlign: 'center', maxWidth: 1400 }}>Do risco no campo ao veredito.</div>
    <div style={{ color: COR.ciano, font: `600 30px/1.2 ${FONTE.mono}`, letterSpacing: '.04em', textAlign: 'center' }}>Quer ver um caso? Pergunta pro LUCA.</div>
  </AbsoluteFill>
);

export const PipelineCompleto: React.FC<PropsPipeline> = ({ captura, rastro, linha, blocoEsquema }) => (
  <AbsoluteFill style={{ background: COR.fundo }}>
    <style>{`@font-face{font-family:'Luca Mono';src:url('${staticFile('brand/jetbrains-mono.woff2')}') format('woff2');font-weight:100 900}`}</style>
    {linha.planos.map((plano, i) => (
      <Sequence key={`p${i}`} from={s(plano.de)} durationInFrames={Math.max(1, s(plano.de + plano.dur) - s(plano.de))}>
        {plano.inicioCaptura !== null
          ? <ZoomCursor src={captura} rastro={rastro} inicio={plano.inicioCaptura} />
          : plano.bloco === blocoEsquema ? <Esquema /> : <Fechamento />}
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
      </Sequence>
    ))}
    <Legenda trechos={linha.trechos} />
  </AbsoluteFill>
);

export const metadadosPipeline: CalculateMetadataFunction<PropsPipeline> = ({ props }) => ({
  durationInFrames: Math.max(1, Math.ceil(props.linha.total * FPS)),
});

export const PROPS_PIPELINE_VAZIAS: PropsPipeline = {
  captura: 'captura/cena.mp4',
  rastro: { viewport: { largura: 1920, altura: 1080 }, cliques: [], cursor: [], marcas: {} },
  linha: { total: 1, blocos: [], planos: [], trechos: [] },
  blocoEsquema: 'b2',
};
