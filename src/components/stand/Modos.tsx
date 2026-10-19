import { lazy, memo, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { MODOS, ROTULO_MODO, type Modo } from './modoStand';
import type { ItemVitrine } from './vitrineStand';

/** Vitrine, Simulação e a barra de modos do totem (grill r1, Q1–Q7). */

const carregarSimulador = () => import('./SimuladorKiosk');
const SimuladorKiosk = lazy(carregarSimulador);

/** Pré-carrega o simulador (Three.js) quando a página sossega, pra Simulação abrir rápido. */
export function preCarregarSimulador() {
  void carregarSimulador();
}

/**
 * Vitrine: vídeos do stand intercalados com Telas do app (`telaApp`, já montada pela página).
 * `pulos` vai em `data-pulada` só para a equipe: o público nunca vê o motivo.
 */
export function VitrineStand({ item, pausado, aoTerminar, telaApp, pulos }: { item: ItemVitrine | undefined; pausado: boolean; aoTerminar(): void; telaApp?: ReactNode; pulos?: string }) {
  const video = item?.tipo === 'video' ? item.video : undefined;
  const ref = useRef<HTMLVideoElement | null>(null);
  const [mudo, setMudo] = useState(false);

  // Sem `--autoplay-policy=no-user-gesture-required` o Chrome recusa som: cai pro mudo e segue tocando.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (pausado) { el.pause(); return; }
    el.muted = false;
    el.play().then(() => setMudo(false)).catch(() => {
      el.muted = true;
      setMudo(true);
      void el.play().catch(() => undefined);
    });
  }, [video?.arquivo, pausado]);

  // Um toque na tela dá ativação ao documento; dali em diante o som é liberado.
  useEffect(() => {
    if (!mudo) return undefined;
    const liberar = () => {
      const el = ref.current;
      if (!el) return;
      el.muted = false;
      setMudo(false);
    };
    window.addEventListener('pointerdown', liberar, { once: true, capture: true });
    return () => window.removeEventListener('pointerdown', liberar, { capture: true });
  }, [mudo]);

  if (!item) return <section className="stand-vitrine stand-vitrine-vazia" aria-label="Vitrine" data-pulada={pulos}><p>Vitrine sem vídeos</p></section>;
  return (
    <section className="stand-vitrine" aria-label={`Vitrine: ${item.titulo}`} data-item={item.tipo} data-pausado={pausado || undefined} data-pulada={pulos}>
      {video
        ? <video key={video.arquivo} ref={ref} className="stand-video-player" src={video.arquivo} playsInline preload="auto" onEnded={aoTerminar} onError={aoTerminar} />
        : telaApp}
      <p className="stand-vitrine-legenda">{item.titulo}</p>
      {pausado && <p className="stand-vitrine-pausa" role="status">Pausado · ✕ continua</p>}
      {mudo && video && <p className="stand-aviso-equipe stand-aviso-mudo">sem som até um toque (kiosk sem --autoplay-policy)</p>}
    </section>
  );
}

/** Simulação: o simulador do Trator MAX direto, na cabine, sem cabeçalho nem painel. Memo: o relógio da página não re-renderiza o 3D. */
export const SimulacaoStand = memo(function SimulacaoStand() {
  return (
    <section className="stand-simulacao" aria-label="Simulação do Trator MAX">
      <Suspense fallback={<p className="stand-simulacao-carregando" role="status">Ligando o trator…</p>}>
        <SimuladorKiosk />
      </Suspense>
    </section>
  );
});

export function BarraModos({ modo, visivel, aoEscolher }: { modo: Modo; visivel: boolean; aoEscolher(modo: Modo): void }) {
  return (
    <nav className="stand-barra" aria-label="Modo do stand" data-visivel={visivel || undefined}>
      {MODOS.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={m === modo}
          tabIndex={visivel ? 0 : -1}
          onPointerDown={(evento) => { evento.stopPropagation(); aoEscolher(m); }}
        >
          {ROTULO_MODO[m]}
        </button>
      ))}
    </nav>
  );
}

export function DicaControle({ modo }: { modo: Modo }) {
  return (
    <p className="stand-dica" aria-hidden="true">
      <kbd>L1</kbd> ◀ {ROTULO_MODO[modo]} ▶ <kbd>R1</kbd>
    </p>
  );
}

export function AvisoSaida({ segundos }: { segundos: number }) {
  return (
    <p className="stand-aviso-saida" role="status">
      Voltando pro início em {segundos} s · mexe no controle pra continuar
    </p>
  );
}
