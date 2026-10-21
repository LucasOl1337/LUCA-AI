import { lazy, memo, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { MODOS, ROTULO_MODO, type Modo } from './modoStand';
import type { ItemVitrine } from './vitrineStand';
import { WebcamSimulacao } from './CameraTotem';

/** Vitrine, Simulação e a barra de modos do totem (grill r1, Q1–Q7). */

const carregarSimulador = () => import('./SimuladorKiosk');
const SimuladorKiosk = lazy(carregarSimulador);

/** Pré-carrega o simulador (Three.js) e o chunk do gameplay quando a página sossega, pra Simulação abrir rápido. */
export function preCarregarSimulador() {
  void carregarSimulador().then((m) => m.preCarregarGameplay()).catch(() => undefined);
}

/**
 * Vitrine: vídeos do stand intercalados com Telas do app (`telaApp`, já montada pela página).
 * `pulos` vai em `data-pulada` só para a equipe: o público nunca vê o motivo.
 * `semSom`: com a Escuta ligada o microfone fica aberto, então os vídeos tocam mudos
 * (a coruja não pode se ouvir). A fala fica na legenda, que já vem queimada nos vídeos.
 */
export function VitrineStand({ item, pausado, aoTerminar, telaApp, pulos, semSom = false }: { item: ItemVitrine | undefined; pausado: boolean; aoTerminar(): void; telaApp?: ReactNode; pulos?: string; semSom?: boolean }) {
  const video = item?.tipo === 'video' ? item.video : undefined;
  const ref = useRef<HTMLVideoElement | null>(null);
  const [mudo, setMudo] = useState(false);

  // Sem `--autoplay-policy=no-user-gesture-required` o Chrome recusa som: cai pro mudo e segue tocando.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (pausado) { el.pause(); return; }
    el.muted = semSom;
    el.play().then(() => setMudo(false)).catch(() => {
      el.muted = true;
      setMudo(!semSom);
      void el.play().catch(() => undefined);
    });
  }, [video?.arquivo, pausado, semSom]);

  // Um toque na tela dá ativação ao documento; dali em diante o som é liberado.
  useEffect(() => {
    if (!mudo || semSom) return undefined;
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
    <section className="stand-vitrine" aria-label={`Vitrine: ${item.titulo}`} data-item={item.tipo} data-pausado={pausado || undefined} data-pulada={pulos} data-som={semSom ? 'mudo_escuta' : undefined}>
      {video
        ? <video key={video.arquivo} ref={ref} className="stand-video-player" src={video.arquivo} muted={semSom} playsInline preload="auto" onEnded={aoTerminar} onError={aoTerminar} />
        : telaApp}
      <p className="stand-vitrine-legenda">{item.titulo}</p>
      {pausado && <p className="stand-vitrine-pausa" role="status">Pausado · ✕ continua</p>}
      {mudo && !semSom && video && <p className="stand-aviso-equipe stand-aviso-mudo">sem som até um toque (kiosk sem --autoplay-policy)</p>}
    </section>
  );
}

/**
 * Simulação: o simulador do Trator MAX direto, na cabine, sem cabeçalho nem painel.
 * A webcam do Totem aparece no canto: olhos fechados por 1 s acendem o alarme da cabine.
 * Memo: o relógio da página não re-renderiza o 3D.
 */
export const SimulacaoStand = memo(function SimulacaoStand() {
  return (
    <section className="stand-simulacao" aria-label="Simulação do Trator MAX">
      <Suspense fallback={<p className="stand-simulacao-carregando" role="status">Ligando o trator…</p>}>
        <SimuladorKiosk />
      </Suspense>
      <WebcamSimulacao />
    </section>
  );
});

/** Atalho da barra que não é modo (ex.: Sonolência abre a página no modo Site). */
export interface AtalhoBarra { id: string; rotulo: string; ativo: boolean; aoEscolher(): void }

export function BarraModos({ modo, modos = MODOS, visivel, aoEscolher, atalhos = [] }: { modo: Modo; modos?: readonly Modo[]; visivel: boolean; aoEscolher(modo: Modo): void; atalhos?: readonly AtalhoBarra[] }) {
  return (
    <nav className="stand-barra" aria-label="Modo do stand" data-visivel={visivel || undefined}>
      {modos.map((m) => (
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
      {atalhos.map((a) => (
        <button
          key={a.id}
          type="button"
          data-atalho={a.id}
          aria-pressed={a.ativo}
          tabIndex={visivel ? 0 : -1}
          onPointerDown={(evento) => { evento.stopPropagation(); a.aoEscolher(); }}
        >
          {a.rotulo}
        </button>
      ))}
    </nav>
  );
}

export function AvisoSaida({ segundos }: { segundos: number }) {
  return (
    <p className="stand-aviso-saida" role="status">
      Voltando pro início em {segundos} s · mexe no controle pra continuar
    </p>
  );
}
