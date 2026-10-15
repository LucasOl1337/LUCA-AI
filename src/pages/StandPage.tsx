import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { useAppLocation } from '@/hooks/useAppLocation';
import { VARIANTE_PADRAO, type VarianteAvatar } from '@/components/stand/AvatarLuca';
import type { CanalStand } from '@/components/stand/canal';
import { criarCanalStub, VIDEOS_STUB, type CanalStub } from '@/components/stand/canalStub';
import { reduzirTela, telaInicial, type EntradaTela, type EstadoTela } from '@/components/stand/telaStand';
import { Atracao, Conversa, PlayerVideo } from '@/components/stand/Telas';
import { tratarTecla, type AtalhosStand } from '@/components/stand/atalhos';
import '@/stand.css';

/** Margem segura padrão (% de cada lado): a moldura de MDF come as bordas. */
const MARGEM_PADRAO = 6;

function alternarTelaCheia() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

const VARIANTES: readonly VarianteAvatar[] = ['coruja', 'operario', 'robo'];
const reduzirAgora = (atual: EstadoTela, entrada: EntradaTela) => reduzirTela(atual, entrada, Date.now());

export default function StandPage() {
  const { location, navigate } = useAppLocation();
  const margem = location.margem ? Number(location.margem) : MARGEM_PADRAO;
  const variante = VARIANTES.find((v) => v === location.variante) ?? VARIANTE_PADRAO;
  const [grade, setGrade] = useState(false);
  const [estado, despachar] = useReducer(reduzirAgora, undefined, telaInicial);
  const nivel = useRef(0);
  const canal = useRef<CanalStand & Partial<Pick<CanalStub, 'demonstrar'>> | null>(null);
  const videoRef = useRef(estado.videoId);
  videoRef.current = estado.videoId;

  const sair = useCallback(() => navigate({ page: 'inicio' }, 'push'), [navigate]);

  // Até a M1 publicar o canal real, o stub faz o papel do cérebro de voz.
  useEffect(() => {
    const stub = criarCanalStub();
    canal.current = stub;
    const cancelar = stub.assinar((evento) => {
      if (evento.tipo === 'nivel_audio') nivel.current = evento.valor;
      else despachar(evento);
    });
    const relogio = window.setInterval(() => despachar({ tipo: 'relogio' }), 500);
    return () => { cancelar(); window.clearInterval(relogio); stub.parar(); canal.current = null; };
  }, []);

  const terminarVideo = useCallback(() => {
    const id = videoRef.current;
    if (!id) return;
    despachar({ tipo: 'video_terminou' });
    canal.current?.enviar({ tipo: 'video_terminou', id });
  }, []);

  useEffect(() => {
    const mandar = (tipo: 'encerrar' | 'reiniciar') => {
      nivel.current = 0;
      despachar({ tipo });
      canal.current?.enviar({ tipo });
    };
    const atalhos: AtalhosStand = {
      encerrar: () => mandar('encerrar'),
      reiniciar: () => mandar('reiniciar'),
      pularVideo: terminarVideo,
      demonstrar: () => canal.current?.demonstrar?.(),
      alternarGrade: () => setGrade((g) => !g),
      alternarTelaCheia,
      sair,
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (tratarTecla(evento, atalhos)) evento.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [sair, terminarVideo]);

  const video = estado.tela === 'video' ? VIDEOS_STUB[estado.videoId] : undefined;
  const videoAusente = estado.tela === 'video' && !video;
  useEffect(() => { if (videoAusente) terminarVideo(); }, [videoAusente, terminarVideo]);

  return (
    <main className="stand" style={{ '--stand-margem': `${margem}%` } as CSSProperties} data-grade={grade || undefined} data-margem={`${margem}%`} data-tela={estado.tela}>
      {video && (
        <PlayerVideo variante={variante} nivel={nivel} voz={estado.voz} arquivo={video.arquivo} titulo={video.titulo} aoTerminar={terminarVideo} />
      )}
      <div className="stand-seguro">
        {estado.tela === 'atracao' && <Atracao variante={variante} nivel={nivel} />}
        {estado.tela === 'conversa' && <Conversa variante={variante} nivel={nivel} voz={estado.voz} legenda={estado.legenda} />}
        <p className="stand-selo" aria-label="Assistente de IA">Assistente de IA</p>
      </div>
    </main>
  );
}
