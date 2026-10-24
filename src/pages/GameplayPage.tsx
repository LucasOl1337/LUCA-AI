import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppLocation } from '@/hooks/useAppLocation';
import '@/experience-pages.css';

const GameplayComCabine = lazy(() => import('@/components/gameplay/visual/GameplayComCabine'));
// /gameplay?veiculo=caminhao: caminhão na serra sem freio (Pista, 24/10).
const PistaKiosk = lazy(() => import('@/components/pista/PistaKiosk'));
// Detector sob demanda: câmera disponível ou opt-in explícito ?webcam=1.
const WebcamSonoCabine = lazy(() => import('@/components/gameplay/WebcamSonoCabine'));

class GameplayBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('Gameplay indisponível.', error); }
  render() {
    if (this.state.failed) return (
      <div className="experience-game-status" role="alert">
        <h2>Não foi possível abrir o Gameplay</h2>
        <p>Verifique a conexão e o suporte a WebGL/aceleração gráfica do navegador. Encerre o teste antes de tentar novamente.</p>
        <p>O simulador clássico não foi aberto no lugar do Gameplay.</p>
      </div>
    );
    return this.props.children;
  }
}

function Cabine({ seloFps = false, webcam = false, caminhao = false }: { seloFps?: boolean; webcam?: boolean; caminhao?: boolean }) {
  const [cameraDisponivel, setCameraDisponivel] = useState(false);
  const [cameraDesligada, setCameraDesligada] = useState(false);
  useEffect(() => {
    let viva = true;
    void navigator.mediaDevices?.enumerateDevices().then((devices) => {
      if (viva) setCameraDisponivel(devices.some((d) => d.kind === 'videoinput'));
    }).catch(() => { /* Sem câmera ou acesso: continua dirigindo sem aviso. */ });
    return () => { viva = false; };
  }, []);
  return (
    <GameplayBoundary>
      <Suspense fallback={<p className="experience-game-status" role="status">Carregando a cabine do Trator MAX…</p>}>
        {caminhao ? <PistaKiosk seloFps={seloFps} /> : <GameplayComCabine seloFps={seloFps} />}
      </Suspense>
      {/* Fora do Suspense da cabine: detector não bloqueia o GLB; falha automática é silenciosa. */}
      {!cameraDesligada && (webcam || cameraDisponivel) && <Suspense fallback={null}><WebcamSonoCabine silenciosa={!webcam} aoDesligar={() => setCameraDesligada(true)} /></Suspense>}
    </GameplayBoundary>
  );
}

/**
 * /gameplay?quiosque=1 (ensaio da feira, item 7): tela inteira, sem landing nem
 * menu, para F5 no totem voltar jogando sem ninguém tocar. Shift+Q volta à landing.
 */
export function GameplayQuiosque({ aoSair, seloFps = false, webcam = false, caminhao = false }: { aoSair: () => void; seloFps?: boolean; webcam?: boolean; caminhao?: boolean }) {
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.shiftKey && evento.key.toLowerCase() === 'q' && !evento.ctrlKey && !evento.metaKey && !evento.altKey) aoSair();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoSair]);
  return (
    <div className="experience-game-quiosque" data-quiosque="true" aria-label="Cabine jogável do Trator MAX">
      <Cabine seloFps={seloFps} webcam={webcam} caminhao={caminhao} />
    </div>
  );
}

export default function GameplayPage() {
  const { location, navigate } = useAppLocation();
  const [playing, setPlaying] = useState(false);
  // Com o jogo aberto, as instruções viram uma coluna recolhível: o quadro da cabine fica com a altura da tela.
  const [ajuda, setAjuda] = useState(false);
  const quadroRef = useRef<HTMLDivElement>(null);
  const sairDoQuiosque = useCallback(() => navigate({ quiosque: '' }, 'push'), [navigate]);
  // /gameplay?fps=1 (pergunta 6): selo de FPS no canto, sozinho ou com ?quiosque=1.
  const seloFps = location.fps === '1';
  // /gameplay?webcam=1 (opção do CP3, 19/10): detector de sonolência da /sonolencia na cabine.
  const webcam = location.webcam === '1';
  // /gameplay?veiculo=caminhao (Pista, 24/10): caminhão na serra sem freio no lugar do trator.
  const caminhao = location.veiculo === 'caminhao';
  if (location.quiosque === '1') return <GameplayQuiosque aoSair={sairDoQuiosque} seloFps={seloFps} webcam={webcam} caminhao={caminhao} />;
  const telaInteira = typeof document !== 'undefined' && document.fullscreenEnabled;
  const mostrarAjuda = !playing || ajuda;
  return (
    <section className="experience-page gameplay-page" data-jogando={playing || undefined} aria-labelledby="gameplay-title">
      <header className="gameplay-page-topo">
        <div>
          <p className="experience-eyebrow">Direção livre · simulação local</p>
          <h1 id="gameplay-title">Gameplay</h1>
          {!playing && <p>Dirija o Trator MAX em primeira pessoa e teste o desafio de parada preventiva. Esta experiência é simulada e não controla máquinas reais.</p>}
        </div>
        {playing && (
          <div className="experience-acoes gameplay-page-acoes">
            <button type="button" className="experience-secondary" aria-expanded={ajuda} aria-controls="gameplay-como-testar" onClick={() => setAjuda(!ajuda)}>
              {ajuda ? 'Ocultar instruções' : 'Como jogar'}
            </button>
            {telaInteira && (
              <button type="button" className="experience-secondary" onClick={() => void quadroRef.current?.requestFullscreen?.().catch(() => undefined)}>Tela inteira</button>
            )}
            <button type="button" className="experience-secondary" onClick={() => { setPlaying(false); setAjuda(false); }}>Sair do jogo</button>
          </div>
        )}
      </header>
      <div className="gameplay-page-corpo">
        {playing && (
          <div ref={quadroRef} className="experience-game-viewport" aria-label="Cabine jogável do Trator MAX">
            <Cabine seloFps={seloFps} webcam={webcam} caminhao={caminhao} />
          </div>
        )}
        {mostrarAjuda && (
          <div id="gameplay-como-testar" className="experience-card gameplay-como-testar">
            <h2>Como jogar</h2>
            <p>Teclado: ↑ ou W acelera, ↓, S ou espaço freia e engata a ré em baixa velocidade, ← e → giram o volante, C troca a câmera. Arraste a imagem para olhar ao redor.</p>
            <p>Controle PlayStation ou Xbox: R2/RT acelera, L2/LT freia, analógico esquerdo dirige e direito olha ao redor, ✕/A troca a câmera, Options/Menu recomeça o desafio.</p>
            <p>O sensor, o alerta e a distância aparecem no painel da cabine. Nada do jogo é gravado no servidor.</p>
            {!playing && <button type="button" className="experience-primary" onClick={() => setPlaying(true)}>Iniciar Gameplay</button>}
            <p className="experience-note">No totem da feira, abra <code>/gameplay?quiosque=1</code>: a cabine abre direto em tela inteira e volta sozinha depois de F5. Shift+Q sai.</p>
            <p className="experience-note" data-webcam={webcam || undefined}>
              {webcam
                ? 'Webcam de sonolência ligada: ao iniciar, a câmera abre no canto da cabine e olhos fechados por 1 s acendem o alerta. A imagem fica neste navegador.'
                : <>Opcional: com <code>?webcam=1</code> no endereço, a webcam de sonolência entra no canto da cabine e avisa olhos fechados por 1 s.</>}
            </p>
            <p className="experience-note">Disponível para teste. Áudio, vibração, desempenho e legibilidade no equipamento final ainda dependem de validação no aparelho.</p>
          </div>
        )}
      </div>
    </section>
  );
}
