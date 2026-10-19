import { memo, useEffect, useRef, type MutableRefObject } from 'react';
import AvatarLuca, { type VarianteAvatar } from '../AvatarLuca';
import { Indicador } from '../Telas';
import type { EstadoVoz } from '../canal';
import type { PaginaSite } from '../../../../shared/stand/acoes-site.ts';
import { caminhoDaPagina } from './acaoDoStand';

/**
 * Modo Site (grill Totem-Site r1, Q1/Q6): a página do site num iframe da mesma
 * origem e a coruja pequena no canto, com a legenda da fala. A câmera é
 * delegada só a este frame (`allow`), e o `/stand` libera `camera=(self)`.
 * Toque ou tecla dentro da página contam como gente na frente do totem.
 */
const Pagina = memo(function Pagina({ pagina, aoMexer }: { pagina: PaginaSite; aoMexer(): void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const mexer = useRef(aoMexer);
  mexer.current = aoMexer;

  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    let doc: Document | null = null;
    const avisar = () => mexer.current();
    const ligar = () => {
      doc?.removeEventListener('pointerdown', avisar);
      doc?.removeEventListener('keydown', avisar);
      try { doc = el.contentDocument; } catch { doc = null; }
      doc?.addEventListener('pointerdown', avisar);
      doc?.addEventListener('keydown', avisar);
    };
    el.addEventListener('load', ligar);
    return () => {
      el.removeEventListener('load', ligar);
      doc?.removeEventListener('pointerdown', avisar);
      doc?.removeEventListener('keydown', avisar);
    };
  }, []);

  return (
    <iframe
      ref={frame}
      className="stand-site-frame"
      src={caminhoDaPagina(pagina)}
      title="Página do site LUCA-AI"
      allow="camera; autoplay; fullscreen"
      data-pagina={pagina}
    />
  );
});

export function SiteStand({ pagina, variante, nivel, voz, legenda, aoMexer }: {
  pagina: PaginaSite;
  variante: VarianteAvatar;
  nivel: MutableRefObject<number>;
  voz: EstadoVoz;
  legenda: string;
  aoMexer(): void;
}) {
  return (
    <section className="stand-site" aria-label="Página do site">
      <div className="stand-site-pagina">
        <Pagina key={pagina} pagina={pagina} aoMexer={aoMexer} />
      </div>
      <aside className="stand-site-coruja" aria-label="Coruja">
        <AvatarLuca variante={variante} voz={voz} nivel={nivel} className="stand-avatar stand-avatar-site" />
        <Indicador voz={voz} />
        {legenda && <p className="stand-site-legenda" aria-live="polite">{legenda}</p>}
        <p className="stand-site-selo">Assistente de IA</p>
      </aside>
    </section>
  );
}
