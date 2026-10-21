import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAppLocation } from '@/hooks/useAppLocation';
import '@/experience-pages.css';

const GameplayComCabine = lazy(() => import('@/components/gameplay/visual/GameplayComCabine'));
// Só baixa com ?webcam=1: sem o parâmetro o gameplay não carrega câmera nem detector.
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

function Cabine({ seloFps = false, webcam = false }: { seloFps?: boolean; webcam?: boolean }) {
  return (
    <GameplayBoundary>
      <Suspense fallback={<p className="experience-game-status" role="status">Carregando a cabine do Trator MAX…</p>}>
        <GameplayComCabine seloFps={seloFps} />
      </Suspense>
      {/* Fora do Suspense da cabine: a webcam abre enquanto o GLB carrega e não derruba a cabine se falhar. */}
      {webcam && <Suspense fallback={null}><WebcamSonoCabine /></Suspense>}
    </GameplayBoundary>
  );
}

/**
 * /gameplay?quiosque=1 (ensaio da feira, item 7): tela inteira, sem landing nem
 * menu, para F5 no totem voltar jogando sem ninguém tocar. Shift+Q volta à landing.
 */
export function GameplayQuiosque({ aoSair, seloFps = false, webcam = false }: { aoSair: () => void; seloFps?: boolean; webcam?: boolean }) {
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.shiftKey && evento.key.toLowerCase() === 'q' && !evento.ctrlKey && !evento.metaKey && !evento.altKey) aoSair();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoSair]);
  return (
    <div className="experience-game-quiosque" data-quiosque="true" aria-label="Cabine jogável do Trator MAX">
      <Cabine seloFps={seloFps} webcam={webcam} />
    </div>
  );
}

export default function GameplayPage() {
  const { location, navigate } = useAppLocation();
  const [playing, setPlaying] = useState(false);
  const sairDoQuiosque = useCallback(() => navigate({ quiosque: '' }, 'push'), [navigate]);
  // /gameplay?fps=1 (pergunta 6): selo de FPS no canto, sozinho ou com ?quiosque=1.
  const seloFps = location.fps === '1';
  // /gameplay?webcam=1 (opção do CP3, 19/10): detector de sonolência da /sonolencia na cabine.
  const webcam = location.webcam === '1';
  if (location.quiosque === '1') return <GameplayQuiosque aoSair={sairDoQuiosque} seloFps={seloFps} webcam={webcam} />;
  return (
    <section className="experience-page" aria-labelledby="gameplay-title">
      <header>
        <p className="experience-eyebrow">Direção livre · simulação local</p>
        <h1 id="gameplay-title">Gameplay</h1>
        <p>Dirija o Trator MAX em primeira pessoa e teste o desafio de parada preventiva. Esta experiência é simulada e não controla máquinas reais.</p>
      </header>
      <div className="experience-card">
        <h2>Como testar</h2>
        <p>Teclado: ↑ acelera, ↓ freia e engata a ré em baixa velocidade, ← e → giram o volante. Arraste a imagem para olhar ao redor.</p>
        <p>Controle padrão/DualSense: R2 acelera, L2 freia, analógico esquerdo dirige e direito olha ao redor. Options reinicia o desafio.</p>
        <p>O sensor, o alerta e a distância aparecem no painel da cabine. O teste não grava telemetria no servidor.</p>
        <button type="button" className={playing ? 'experience-secondary' : 'experience-primary'} onClick={() => setPlaying(!playing)}>
          {playing ? 'Encerrar teste' : 'Iniciar Gameplay'}
        </button>
        <p className="experience-note">No totem da feira, abra <code>/gameplay?quiosque=1</code>: a cabine abre direto em tela inteira e volta sozinha depois de F5. Shift+Q sai.</p>
        <p className="experience-note" data-webcam={webcam || undefined}>
          {webcam
            ? 'Webcam de sonolência ligada: ao iniciar, a câmera abre no canto da cabine e olhos fechados por 1 s acendem o alerta. A imagem fica neste navegador.'
            : <>Opcional: com <code>?webcam=1</code> no endereço, a webcam de sonolência entra no canto da cabine e avisa olhos fechados por 1 s.</>}
        </p>
      </div>
      {playing && (
        <div className="experience-game-viewport" aria-label="Cabine jogável do Trator MAX">
          <Cabine seloFps={seloFps} webcam={webcam} />
        </div>
      )}
      <p className="experience-note">Disponível para teste. Áudio, vibração, desempenho e legibilidade no equipamento final ainda dependem de validação no aparelho.</p>
    </section>
  );
}
