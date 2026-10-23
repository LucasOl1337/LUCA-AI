import { lazy, memo, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { MODOS, ROTULO_MODO, type Modo } from './modoStand';
import type { ItemVitrine } from './vitrineStand';


/** Vitrine, Simulação e a barra de modos do totem (grill r1, Q1–Q7). */

const carregarSimulador = () => import('./SimuladorKiosk');
const SimuladorKiosk = lazy(carregarSimulador);

/** Pré-carrega o simulador (Three.js) e o chunk do gameplay quando a página sossega, pra Simulação abrir rápido. */
export function preCarregarSimulador() {
  void carregarSimulador().then((m) => m.preCarregarGameplay()).catch(() => undefined);
}

/** Vitrine narrada. Escuta/TTS são suspensos pela página, nunca pelo player. */
export function VitrineStand({ item, pausado, aoTerminar, aoPausar, telaApp, pulos }: { item: ItemVitrine | undefined; pausado: boolean; aoTerminar(): void; aoPausar?(): void; telaApp?: ReactNode; pulos?: string }) {
  const video = item?.tipo === 'video' ? item.video : undefined;
  const ref = useRef<HTMLVideoElement | null>(null);
  const [mudo, setMudo] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let vivo = true;
    el.muted = mudo; el.volume = 1;
    if (pausado) { el.pause(); return; }
    void el.play().then(() => { if (vivo) setBloqueado(false); }).catch(() => {
      if (!vivo) return;
      setBloqueado(true); el.muted = true;
      void el.play().catch(() => undefined);
    });
    return () => { vivo = false; el.pause(); };
  }, [video?.arquivo, pausado, mudo]);
  const som = () => {
    const el = ref.current;
    if (!el) return;
    const silenciar = !bloqueado && !mudo;
    setMudo(silenciar); el.muted = silenciar; el.volume = 1;
    if (!pausado) void el.play().then(() => setBloqueado(false)).catch(() => setBloqueado(true));
    else setBloqueado(false);
  };
  if (!item) return <section className="stand-vitrine stand-vitrine-vazia" aria-label="Vitrine" data-pulada={pulos}><p>Vitrine sem vídeos</p></section>;
  return <section className="stand-vitrine" aria-label={`Vitrine: ${item.titulo}`} data-item={item.tipo} data-pausado={pausado || undefined} data-pulada={pulos} data-som={bloqueado ? 'aguardando_gesto' : mudo ? 'desligado' : 'narracao'}>
    {video ? <video key={video.arquivo} ref={ref} className="stand-video-player" src={video.arquivo} playsInline preload="auto" onEnded={aoTerminar} onError={aoTerminar} /> : telaApp}
    <p className="stand-vitrine-legenda">{item.titulo}</p>
    {pausado && <p className="stand-vitrine-pausa" role="status">Pausado · ✕ continua</p>}
    {video && aoPausar && <button type="button" className="stand-vitrine-controle" onPointerDown={ev => ev.stopPropagation()} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') ev.stopPropagation(); }} onClick={aoPausar}>{pausado ? 'Retomar vídeo' : 'Pausar vídeo'}</button>}
    {video && <button type="button" className="stand-vitrine-som" aria-label={bloqueado || mudo ? 'Ativar som da Vitrine' : 'Desligar som da Vitrine'} onPointerDown={(ev) => ev.stopPropagation()} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') ev.stopPropagation(); }} onClick={som}>{bloqueado ? '▶ Ativar som · toque ou Enter' : mudo ? 'Som desligado · ativar' : 'Som ligado · silenciar'}</button>}
  </section>;
}

/**
 * Simulação: o simulador do Trator MAX direto, na cabine, sem cabeçalho nem painel.
 * Sonolência é opcional na pausa, desligada por padrão; nenhum painel de câmera no HUD.
 * Memo: o relógio da página não re-renderiza o 3D.
 */
export const SimulacaoStand = memo(function SimulacaoStand() {
  return (
    <section className="stand-simulacao" aria-label="Simulação do Trator MAX">
      <Suspense fallback={<p className="stand-simulacao-carregando" role="status">Ligando o trator…</p>}>
        <SimuladorKiosk />
      </Suspense>

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
          data-modo={m}
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
