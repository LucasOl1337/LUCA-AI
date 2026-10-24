import type { MutableRefObject } from 'react';
import AvatarLuca, { type VarianteAvatar } from './AvatarLuca';
import type { EstadoVoz } from './canal';

/** As três telas do monitor do trator: Atração, Conversa e Vídeo. */

interface BaseTela { variante: VarianteAvatar; nivel: MutableRefObject<number> }

const TITULO_COM_VOZ = <>Pega o microfone e pergunta pro <strong>LUCA</strong></>;

/** `titulo` vazio = chamada da voz; sem voz, a página passa o texto de Q12. */
export function Atracao({ variante, nivel, chamada, titulo }: BaseTela & { chamada: string; titulo?: string }) {
  return (
    <section className="stand-atracao" aria-label="Atração">
      <AvatarLuca variante={variante} voz="ocioso" nivel={nivel} className="stand-avatar stand-avatar-atracao" />
      <div className="stand-chamada">
        <p className="stand-chamada-titulo">{titulo || TITULO_COM_VOZ}</p>
        {chamada && <p className="stand-chamada-sub">{chamada}</p>}
      </div>
      <p className="stand-marca"><span className="stand-marca-luca">LUCA-AI</span> · demonstração para Sompo</p>
    </section>
  );
}

/**
 * Palco (24/10): a coruja sozinha, em tela inteira, como alguém dentro do
 * monitor. Sem texto em volta: nem chamada, marca, painel, selo ou webcam.
 * Viva no repouso (respira, pisca e olha de lado pelo próprio rig; flutua de leve).
 * Fala tira do palco (atividade), então legenda aqui nunca é necessária.
 */
export function Palco({ variante, nivel, voz }: BaseTela & { voz: EstadoVoz }) {
  return (
    <section className="stand-palco" aria-label="LUCA, assistente de IA">
      <AvatarLuca variante={variante} voz={voz} nivel={nivel} className="stand-avatar stand-avatar-palco" />
    </section>
  );
}

const ROTULO_VOZ: Record<EstadoVoz, string> = {
  ocioso: 'Pode perguntar', ouvindo: 'Ouvindo…', pensando: 'Pensando…', falando: 'Falando',
};

export function Indicador({ voz }: { voz: EstadoVoz }) {
  return (
    <p className="stand-indicador" data-voz={voz} role="status">
      <span className="stand-indicador-ponto" aria-hidden="true"><i /><i /><i /></span>
      {ROTULO_VOZ[voz]}
    </p>
  );
}

export function Conversa({ variante, nivel, voz, legenda }: BaseTela & { voz: EstadoVoz; legenda: string }) {
  return (
    <section className="stand-conversa" aria-label="Conversa">
      <AvatarLuca variante={variante} voz={voz} nivel={nivel} className="stand-avatar stand-avatar-conversa" />
      <div className="stand-conversa-texto">
        <Indicador voz={voz} />
        <p className="stand-legenda" aria-live="polite">{legenda}</p>
      </div>
    </section>
  );
}

export function PlayerVideo({ variante, nivel, voz, arquivo, titulo, aoTerminar }: BaseTela & {
  voz: EstadoVoz; arquivo: string; titulo: string; aoTerminar(): void;
}) {
  return (
    <section className="stand-video" aria-label={`Vídeo: ${titulo}`}>
      <video key={arquivo} className="stand-video-player" src={arquivo} autoPlay playsInline onEnded={aoTerminar} onError={aoTerminar} />
      <div className="stand-video-avatar">
        <AvatarLuca variante={variante} voz={voz} nivel={nivel} className="stand-avatar" />
      </div>
      <p className="stand-video-titulo">{titulo}</p>
    </section>
  );
}
