import { useEffect, useRef, useState } from 'react';
import { Box, RotateCcw, ChevronLeft, ChevronRight, Image } from 'lucide-react';
import type { SentinelScene } from './sentinel/createSentinelScene';
import './sentinel/sentinel.css';

const HERO = '/models/luca/sentinel-hero-a5dae46d.png';

/** The renderer and model are downloaded only after an explicit request. */
export default function SentinelOwl() {
  const [requested, setRequested] = useState(false);
  const [status, setStatus] = useState<'static' | 'loading' | 'ready' | 'error'>('static');
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SentinelScene | null>(null);

  useEffect(() => {
    if (!requested || !canvas.current) return;
    let disposed = false;
    const target = canvas.current;
    setStatus('loading');
    const fail = () => {
      if (disposed) return;
      scene.current?.dispose();
      scene.current = null;
      setStatus('error');
      setRequested(false);
    };
    const timeout = window.setTimeout(fail, 30_000);
    import('./sentinel/createSentinelScene').then(({ createSentinelScene }) => {
      if (disposed) return;
      scene.current = createSentinelScene(target, () => {
        if (disposed) return;
        window.clearTimeout(timeout);
        setStatus('ready');
      }, fail);
    }).catch(fail);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      scene.current?.dispose();
      scene.current = null;
    };
  }, [requested]);

  function showImage() {
    setRequested(false);
    setStatus('static');
  }

  return (
    <figure className="sentinel-owl" aria-label="Sentinela LUCA em imagem ou 3D">
      <div className="sentinel-stage" aria-busy={status === 'loading'}>
        <img src={HERO} width={1500} height={1700} decoding="async" fetchPriority="high"
          alt="Sentinela LUCA: coruja metálica com olhos e asas iluminados em azul."
          className={status === 'ready' ? 'sentinel-poster is-hidden' : 'sentinel-poster'} />
        {requested && <canvas ref={canvas} className={status === 'ready' ? 'sentinel-canvas is-ready' : 'sentinel-canvas'}
          role="img" aria-label="Modelo 3D da coruja Sentinela LUCA; use os botões para girar." />}
      </div>
      <figcaption className="sentinel-caption">
        <div className="sentinel-identity"><span>SENTINELA LUCA</span><small>Contexto em foco. Equipe em ação.</small></div>
        <div className="sentinel-controls">
          {status === 'ready' ? <>
            <button type="button" aria-label="Girar coruja para a esquerda" onClick={() => scene.current?.turn(-Math.PI / 8)}><ChevronLeft size={17} /></button>
            <button type="button" aria-label="Girar coruja para a direita" onClick={() => scene.current?.turn(Math.PI / 8)}><ChevronRight size={17} /></button>
            <button type="button" aria-label="Restaurar posição da coruja" onClick={() => scene.current?.reset()}><RotateCcw size={15} /></button>
            <button type="button" onClick={showImage}><Image size={15} /><span>Imagem</span></button>
          </> : <button type="button" disabled={status === 'loading'} onClick={() => setRequested(true)}><Box size={16} /><span>{status === 'loading' ? 'Abrindo 3D…' : 'Ver em 3D'}</span></button>}
        </div>
      </figcaption>
      <span className="sentinel-status" role="status" aria-live="polite">{status === 'error' ? 'O 3D não está disponível neste dispositivo. Você pode continuar com a imagem ou tentar novamente.' : status === 'ready' ? 'Modelo 3D pronto. Gire com os botões, sem movimento automático.' : status === 'loading' ? 'Carregando o modelo 3D. O acesso ao LUCA continua disponível.' : ''}</span>
    </figure>
  );
}
