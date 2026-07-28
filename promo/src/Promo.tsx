import React from 'react';
import {
  AbsoluteFill,
  Composition,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';

const FPS = 30;
const DURATION = 42 * FPS;

const C = {
  void: '#090c11',
  surface: '#10141b',
  blue: '#0a84ff',
  cyan: '#64d2ff',
  green: '#30d158',
  text: 'rgba(255,255,255,.94)',
  soft: 'rgba(255,255,255,.72)',
  mute: 'rgba(255,255,255,.60)',
};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const s = (seconds: number) => Math.round(seconds * FPS);

const enter = (frame: number, delay = 0, duration = 24) =>
  interpolate(frame, [delay, delay + duration], [0, 1], clamp);

const exit = (frame: number, start: number, duration = 18) =>
  interpolate(frame, [start, start + duration], [1, 0], clamp);

const sceneOpacity = (frame: number, duration: number) =>
  enter(frame, 0, 12) * exit(frame, Math.max(0, duration - 12), 12);

const Kicker: React.FC<{children: React.ReactNode; tone?: 'blue' | 'green'}> = ({children, tone = 'blue'}) => (
  <div className="kicker" style={{color: tone === 'green' ? C.green : C.cyan}}>{children}</div>
);

const Cursor: React.FC<{x: number; y: number; pulse?: number}> = ({x, y, pulse = 0}) => {
  const frame = useCurrentFrame();
  const pop = spring({fps: FPS, frame: Math.max(0, frame - pulse), config: {damping: 16, stiffness: 170}});
  return (
    <div className="cursor" style={{transform: `translate(${x}px, ${y}px) scale(${0.82 + pop * 0.18})`}}>
      <svg viewBox="0 0 40 48" width="40" height="48" aria-hidden="true">
        <path d="M5 3 34 29l-14 2 8 13-8 4-8-14-9 10Z" fill="white" stroke="#06101b" strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <span className="cursor-ring" style={{opacity: interpolate(pop, [0, .55, 1], [0, .8, 0])}} />
    </div>
  );
};

const Screen: React.FC<{
  src: string;
  scale?: number;
  x?: number;
  y?: number;
  opacity?: number;
  className?: string;
}> = ({src, scale = 1, x = 0, y = 0, opacity = 1, className = ''}) => (
  <div className={`screen ${className}`} style={{opacity, transform: `translate(${x}px, ${y}px) scale(${scale})`}}>
    <Img src={staticFile(src)} />
    <div className="screen-glass" />
  </div>
);

const PainScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, s(8));
  const drift = interpolate(frame, [0, s(8)], [1.03, 1.12], clamp);
  const flash = interpolate(frame, [s(6.8), s(7.45), s(8)], [0, .28, 0], clamp);
  const words = [
    {text: 'briefing_v7', x: 112, y: 176, delay: 8},
    {text: '“qual versão?”', x: 1452, y: 198, delay: 17},
    {text: 'copiar resposta', x: 130, y: 790, delay: 29},
    {text: 'mais uma aba', x: 1510, y: 770, delay: 39},
    {text: 'revisar tudo', x: 1320, y: 510, delay: 51},
  ];
  return (
    <AbsoluteFill style={{opacity, background: C.void}}>
      <div className="pain-bg" style={{transform: `scale(${drift})`}}>
        <Img src={staticFile('captures/00-auth.png')} />
      </div>
      <div className="vignette" />
      {words.map((word) => {
        const p = enter(frame, word.delay, 16);
        return <div key={word.text} className="noise-word" style={{left: word.x, top: word.y, opacity: p * .42, transform: `translateY(${(1 - p) * 18}px)`}}>{word.text}</div>;
      })}
      <div className="pain-copy">
        <div className="pain-line small" style={{opacity: enter(frame, 8), transform: `translateY(${(1 - enter(frame, 8)) * 24}px)`}}>UMA MISSÃO.</div>
        <div className="pain-line" style={{opacity: enter(frame, 30), transform: `translateY(${(1 - enter(frame, 30)) * 28}px)`}}>CINCO CONVERSAS.</div>
        <div className="pain-line accent" style={{opacity: enter(frame, 58), transform: `translateY(${(1 - enter(frame, 58)) * 28}px)`}}>NENHUMA CONCLUSÃO.</div>
      </div>
      <div className="pain-tags" style={{opacity: enter(frame, 124)}}>
        <span>SEM DONO</span><i /><span>SEM CRITÉRIO</span><i /><span>SEM FIM</span>
      </div>
      <div className="turn-flash" style={{opacity: flash}} />
    </AbsoluteFill>
  );
};

const PersonasScene: React.FC = () => {
  const frame = useCurrentFrame();
  const p = spring({fps: FPS, frame, config: {damping: 18, stiffness: 105}});
  const scale = interpolate(frame, [0, s(6)], [1.01, 1.115], clamp);
  const cursorP = spring({fps: FPS, frame: Math.max(0, frame - 42), config: {damping: 17, stiffness: 95}});
  const x = interpolate(cursorP, [0, 1], [1570, 970]);
  const y = interpolate(cursorP, [0, 1], [850, 360]);
  return (
    <AbsoluteFill className="scene" style={{opacity: sceneOpacity(frame, s(6))}}>
      <Screen src="captures/02-personas.png" scale={scale} x={interpolate(p, [0, 1], [30, -32])} />
      <div className="top-shade" />
      <div className="scene-copy left" style={{opacity: p, transform: `translateY(${(1 - p) * 30}px)`}}>
        <Kicker>01 / EXPERTISE</Kicker>
        <h2>ESCOLHA<br />QUEM PENSA.</h2>
        <p>Personas reais.<br />Especialidades claras.</p>
      </div>
      <div className="focus-ring persona-focus" style={{opacity: enter(frame, 58)}} />
      <Cursor x={x} y={y} pulse={52} />
    </AbsoluteFill>
  );
};

const TeamScene: React.FC = () => {
  const frame = useCurrentFrame();
  const p = spring({fps: FPS, frame, config: {damping: 18, stiffness: 110}});
  const scan = interpolate(frame, [24, s(7)], [250, 825], clamp);
  const cursorP = spring({fps: FPS, frame: Math.max(0, frame - 28), config: {damping: 20, stiffness: 75}});
  const x = interpolate(cursorP, [0, 1], [1500, 1642]);
  const y = interpolate(cursorP, [0, 1], [280, 735]);
  return (
    <AbsoluteFill className="scene" style={{opacity: sceneOpacity(frame, s(8))}}>
      <Screen src="captures/03-team-flow.png" scale={interpolate(p, [0, 1], [1.04, 1.13])} x={interpolate(p, [0, 1], [-10, -92])} />
      <div className="left-shade" />
      <div className="scene-copy left lower" style={{opacity: p, transform: `translateX(${(1 - p) * -30}px)`}}>
        <Kicker tone="green">02 / RESPONSABILIDADE</Kicker>
        <h2>CADA ETAPA<br />TEM DONO.</h2>
        <div className="ready-pill"><span /> 5/5 · PRONTO PARA EXECUTAR</div>
      </div>
      <div className="flow-scan" style={{top: scan}} />
      <Cursor x={x} y={y} pulse={44} />
    </AbsoluteFill>
  );
};

const DeliveryScene: React.FC = () => {
  const frame = useCurrentFrame();
  const cut = spring({fps: FPS, frame: Math.max(0, frame - 78), config: {damping: 20, stiffness: 130}});
  const missionZoom = interpolate(frame, [0, 78], [1.02, 1.085], clamp);
  const resultZoom = interpolate(frame, [78, s(8)], [1.08, 1.015], clamp);
  const cursorP = spring({fps: FPS, frame: Math.max(0, frame - 24), config: {damping: 15, stiffness: 120}});
  return (
    <AbsoluteFill className="scene" style={{opacity: sceneOpacity(frame, s(8))}}>
      <Screen src="captures/04-mission-ready.png" scale={missionZoom} opacity={1 - cut} />
      <div className="result-reveal" style={{clipPath: `inset(0 ${100 - cut * 100}% 0 0 round 26px)`}}>
        <Screen src="captures/05-delivery.png" scale={resultZoom} />
      </div>
      <div className="top-shade" />
      <div className="delivery-copy">
        <Kicker>03 / DECISÃO</Kicker>
        <div className="delivery-line">
          <span style={{opacity: 1 - cut, transform: `translateY(${cut * -20}px)`}}>UMA MISSÃO ENTRA.</span>
          <span className="green" style={{opacity: cut, transform: `translateY(${(1 - cut) * 20}px)`}}>UMA ENTREGA SAI.</span>
        </div>
      </div>
      {cut < .55 && <Cursor x={interpolate(cursorP, [0, 1], [1160, 1272])} y={interpolate(cursorP, [0, 1], [930, 927])} pulse={38} />}
      <div className="delivery-marker" style={{opacity: cut}}><span /> ENTREGA FINAL</div>
    </AbsoluteFill>
  );
};

const PromiseScene: React.FC = () => {
  const frame = useCurrentFrame();
  const p = spring({fps: FPS, frame, config: {damping: 18, stiffness: 95}});
  const cards = [
    {src: 'captures/02-personas.png', x: -480, rotate: -6, delay: 0},
    {src: 'captures/03-team-flow.png', x: 0, rotate: 0, delay: 8},
    {src: 'captures/05-delivery.png', x: 480, rotate: 6, delay: 16},
  ];
  const copy = enter(frame, 50, 22);
  return (
    <AbsoluteFill className="promise" style={{opacity: sceneOpacity(frame, s(6))}}>
      <div className="orb" />
      {cards.map((card, index) => {
        const cp = spring({fps: FPS, frame: Math.max(0, frame - card.delay), config: {damping: 18, stiffness: 90}});
        return (
          <div key={card.src} className="mini-screen" style={{zIndex: index === 1 ? 3 : 2, transform: `translate(${card.x * cp}px, ${interpolate(cp, [0, 1], [230, 48])}px) rotate(${card.rotate * cp}deg) scale(${interpolate(cp, [0, 1], [.72, .56])})`, opacity: cp}}>
            <Img src={staticFile(card.src)} />
          </div>
        );
      })}
      <div className="promise-copy" style={{opacity: copy, transform: `translateY(${(1 - copy) * 30}px)`}}>
        <span>MENOS ORQUESTRAÇÃO.</span>
        <strong>MAIS DECISÃO.</strong>
      </div>
      <div className="promise-rule" style={{transform: `scaleX(${p})`}} />
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = spring({fps: FPS, frame, config: {damping: 13, stiffness: 105}});
  const title = enter(frame, 15, 22);
  const tagline = enter(frame, 34, 22);
  const cta = spring({fps: FPS, frame: Math.max(0, frame - 64), config: {damping: 15, stiffness: 125}});
  const pulse = .92 + Math.sin(frame / 8) * .08;
  return (
    <AbsoluteFill className="endcard">
      <div className="end-owl"><Img src={staticFile('brand/cyber-owl.jpg')} /></div>
      <div className="end-vignette" />
      <div className="logo-halo" style={{transform: `translate(-50%,-50%) scale(${pulse})`}} />
      <div className="end-content">
        <div className="brand-icon" style={{opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [.62, 1])})`}}><Img src={staticFile('brand/icon-512.png')} /></div>
        <div className="brand-name" style={{opacity: title, transform: `translateY(${(1 - title) * 18}px)`}}>LUCA-AI</div>
        <div className="tagline" style={{opacity: tagline}}>SUA MISSÃO. <strong>UMA EQUIPE INTEIRA.</strong></div>
        <div className="cta" style={{opacity: cta, transform: `scale(${interpolate(cta, [0, 1], [.86, 1])})`}}>ABRA O LUCA-AI <span>→</span></div>
      </div>
    </AbsoluteFill>
  );
};

const Commercial: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: C.void, color: C.text}}>
    <style>{`@font-face{font-family:'Luca Mono';src:url('${staticFile('brand/jetbrains-mono.woff2')}') format('woff2');font-weight:100 900;font-display:swap}`}</style>
    <Sequence from={s(0)} durationInFrames={s(8)}><PainScene /></Sequence>
    <Sequence from={s(8)} durationInFrames={s(6)}><PersonasScene /></Sequence>
    <Sequence from={s(14)} durationInFrames={s(8)}><TeamScene /></Sequence>
    <Sequence from={s(22)} durationInFrames={s(8)}><DeliveryScene /></Sequence>
    <Sequence from={s(30)} durationInFrames={s(6)}><PromiseScene /></Sequence>
    <Sequence from={s(36)} durationInFrames={s(6)}><EndCard /></Sequence>
    <div className="grain" />
  </AbsoluteFill>
);

export const PromoRoot: React.FC = () => (
  <Composition
    id="Promo"
    component={Commercial}
    durationInFrames={DURATION}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
