import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { useAppLocation } from '@/hooks/useAppLocation';
import { useSessaoVoz } from '@/stand-voz/useSessaoVoz';
import { VARIANTE_PADRAO, type VarianteAvatar } from '@/components/stand/AvatarLuca';
import { canalReal, type CanalStand } from '@/components/stand/canal';
import { criarCanalStub } from '@/components/stand/canalStub';
import { reduzirTela, telaInicial, type EntradaTela, type EstadoTela } from '@/components/stand/telaStand';
import { Atracao, Conversa, PlayerVideo } from '@/components/stand/Telas';
import { tratarTecla, type AtalhosStand } from '@/components/stand/atalhos';
import { avisoParaEquipe, chamadaDeInicio } from '@/components/stand/avisos';
import { videoDoStand } from '@/components/stand/videosStand';
import { enviarAcaoSite } from '@/components/stand/executor/ponte';
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
  const modoStub = location.stub === '1';
  const [grade, setGrade] = useState(false);
  const [estado, despachar] = useReducer(reduzirAgora, undefined, telaInicial);
  const voz = useSessaoVoz();
  const nivel = useRef(0);
  const canal = useRef<CanalStand>(canalReal);
  const demonstrar = useRef<() => void>(() => undefined);
  const videoRef = useRef(estado.videoId);
  videoRef.current = estado.videoId;

  const sair = useCallback(() => navigate({ page: 'inicio' }, 'push'), [navigate]);

  // Cérebro de voz real (M1) ou, com ?stub=1, a fala de teste local.
  useEffect(() => {
    const stub = modoStub ? criarCanalStub() : null;
    const atual = stub ?? canalReal;
    canal.current = atual;
    demonstrar.current = stub ? stub.demonstrar : () => undefined;
    const cancelar = atual.assinar((evento) => {
      if (evento.tipo === 'nivel_audio') nivel.current = evento.valor;
      else if (evento.tipo === 'acao_site') {
        // Executor do stand (M3) noutra janela; a falha fica no console da equipe.
        void enviarAcaoSite(evento.acao, evento.args ?? {}).then((r) => { if (!r.ok) console.warn('[stand] ação no site falhou:', r.mensagem); });
      }
      else despachar(evento);
    });
    const relogio = window.setInterval(() => despachar({ tipo: 'relogio' }), 500);
    return () => { cancelar(); window.clearInterval(relogio); stub?.parar(); };
  }, [modoStub]);

  /** Gesto do público ou da equipe: liga o microfone (precisa de clique ou tecla).
   * `voz.iniciar` já ignora quando há sessão; não ler `voz.ativa` aqui (fica velho no R). */
  const { iniciar: iniciarVoz, encerrar: encerrarVoz } = voz;
  const iniciar = useCallback(() => {
    if (modoStub) demonstrar.current();
    else void iniciarVoz();
  }, [modoStub, iniciarVoz]);

  const terminarVideo = useCallback(() => {
    const id = videoRef.current;
    if (!id) return;
    despachar({ tipo: 'video_terminou' });
    canal.current.enviar({ tipo: 'video_terminou', id });
  }, []);

  useEffect(() => {
    const mandar = (tipo: 'encerrar' | 'reiniciar') => {
      nivel.current = 0;
      despachar({ tipo });
      canal.current.enviar({ tipo });
      encerrarVoz();
    };
    const atalhos: AtalhosStand = {
      iniciar,
      encerrar: () => mandar('encerrar'),
      reiniciar: () => { mandar('reiniciar'); iniciar(); },
      pularVideo: terminarVideo,
      demonstrar: iniciar,
      alternarGrade: () => setGrade((g) => !g),
      alternarTelaCheia,
      sair,
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (tratarTecla(evento, atalhos)) evento.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [sair, terminarVideo, iniciar, encerrarVoz]);

  const video = estado.tela === 'video' ? videoDoStand(estado.videoId, modoStub) : undefined;
  const videoAusente = estado.tela === 'video' && !video;
  useEffect(() => { if (videoAusente) terminarVideo(); }, [videoAusente, terminarVideo]);

  const aviso = modoStub ? 'modo de teste (?stub=1): fala gravada, sem microfone' : avisoParaEquipe(voz.fim);

  return (
    <main
      className="stand"
      style={{ '--stand-margem': `${margem}%` } as CSSProperties}
      data-grade={grade || undefined}
      data-margem={`${margem}%`}
      data-tela={estado.tela}
      data-sessao={voz.ativa ? 'ativa' : voz.fim?.motivo ?? 'parada'}
      onPointerDown={estado.tela === 'atracao' ? iniciar : undefined}
    >
      {video && (
        <PlayerVideo variante={variante} nivel={nivel} voz={estado.voz} arquivo={video.arquivo} titulo={video.titulo} aoTerminar={terminarVideo} />
      )}
      <div className="stand-seguro">
        {estado.tela === 'atracao' && (
          <Atracao variante={variante} nivel={nivel} chamada={chamadaDeInicio(modoStub ? false : voz.ativa, voz.fim)} />
        )}
        {estado.tela === 'conversa' && <Conversa variante={variante} nivel={nivel} voz={estado.voz} legenda={estado.legenda} />}
        <p className="stand-selo" aria-label="Assistente de IA">Assistente de IA</p>
        {aviso && estado.tela === 'atracao' && <p className="stand-aviso-equipe">{aviso}</p>}
      </div>
    </main>
  );
}
