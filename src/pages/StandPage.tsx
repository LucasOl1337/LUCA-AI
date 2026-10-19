import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { useAppLocation } from '@/hooks/useAppLocation';
import { useSessaoVoz } from '@/stand-voz/useSessaoVoz';
import { VARIANTE_PADRAO, VARIANTES_AVATAR } from '@/components/stand/AvatarLuca';
import { canalReal, type CanalStand } from '@/components/stand/canal';
import { criarCanalStub } from '@/components/stand/canalStub';
import { reduzirTela, telaInicial, type EntradaTela, type EstadoTela } from '@/components/stand/telaStand';
import { Atracao, Conversa, PlayerVideo } from '@/components/stand/Telas';
import { tratarTecla, type AtalhosStand } from '@/components/stand/atalhos';
import { avisoDeControle, avisoParaEquipe, chamadaDeInicio, chamadaSemVoz, vozDoStand, type StatusStand } from '@/components/stand/avisos';
import { VIDEOS_VITRINE, videoDoStand } from '@/components/stand/videosStand';
import { descreverPulos, disponiveis, montarItens } from '@/components/stand/vitrineStand';
import { TelaLab, TelaTrator, useTelasDoApp } from '@/components/stand/TelasDoApp';
import { enviarAcaoSite } from '@/components/stand/executor/ponte';
import { avisoDeSaida, barraVisivel, modoInicial, reduzirModo, type EntradaModo, type EstadoModo } from '@/components/stand/modoStand';
import type { AcaoNavegacao } from '@/components/stand/navegacaoPad';
import { usePadStand } from '@/components/stand/usePadStand';
import { AvisoSaida, BarraModos, DicaControle, preCarregarSimulador, SimulacaoStand, VitrineStand } from '@/components/stand/Modos';
import '@/stand.css';

/** Margem segura padrão (% de cada lado): a moldura de MDF come as bordas. */
const MARGEM_PADRAO = 6;

function alternarTelaCheia() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

const reduzirAgora = (atual: EstadoTela, entrada: EntradaTela) => reduzirTela(atual, entrada, Date.now());

/** Carrossel da Vitrine: vídeos do manifesto com as Telas do app no meio (Q3 b). */
const ITENS_VITRINE = montarItens(VIDEOS_VITRINE);

/** Status da voz no servidor: o texto da Atração segue `ligado` + `motivo` (inclusive `teto_diario`). */
const STATUS_A_CADA_MS = 60_000;

function useStatusStand(ativo: boolean, fimSessao: unknown) {
  const [status, setStatus] = useState<StatusStand | null>(null);
  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    const buscar = () => {
      fetch('/api/stand/status', { credentials: 'same-origin' })
        .then(async (r) => (r.ok ? r.json() : { ligado: false, motivo: `status_http_${r.status}` }))
        .then((dados) => { if (vivo && dados) setStatus({ ligado: !!dados.ligado, motivo: dados.motivo ?? null }); })
        // Sem status, não promete microfone: o totem segue com Vitrine e Simulação.
        .catch(() => { if (vivo) setStatus({ ligado: false, motivo: 'status_indisponivel' }); });
    };
    buscar();
    const timer = window.setInterval(buscar, STATUS_A_CADA_MS);
    return () => { vivo = false; window.clearInterval(timer); };
  }, [ativo, fimSessao]);
  return status;
}

export default function StandPage() {
  const { location, navigate } = useAppLocation();
  const margem = location.margem ? Number(location.margem) : MARGEM_PADRAO;
  const variante = VARIANTES_AVATAR.find((v) => v === location.variante) ?? VARIANTE_PADRAO;
  const modoStub = location.stub === '1';
  const [grade, setGrade] = useState(false);
  const [estado, despachar] = useReducer(reduzirAgora, undefined, telaInicial);
  // Tela do app fora do ar sai da volta: o reducer lê quais itens estão prontos agora.
  const prontos = useRef<boolean[]>(disponiveis(ITENS_VITRINE, {}));
  const reduzirModoAgora = useCallback((atual: EstadoModo, entrada: EntradaModo) => reduzirModo(atual, entrada, Date.now(), prontos.current), []);
  const [modo, despacharModo] = useReducer(reduzirModoAgora, undefined, () => modoInicial(Date.now()));
  const telas = useTelasDoApp(modo.modo === 'vitrine');
  prontos.current = disponiveis(ITENS_VITRINE, telas.prontidao);
  const [agora, setAgora] = useState(() => Date.now());
  const voz = useSessaoVoz();
  const status = useStatusStand(!modoStub, voz.fim);
  const vozStand = modoStub ? 'ligada' : vozDoStand(status, voz.fim);
  const nivel = useRef(0);
  const canal = useRef<CanalStand>(canalReal);
  const demonstrar = useRef<() => void>(() => undefined);
  const videoRef = useRef(estado.videoId);
  videoRef.current = estado.videoId;
  const corujaOcupada = useRef(false);
  corujaOcupada.current = estado.tela !== 'atracao' || voz.ativa;
  const modoAtual = useRef(modo.modo);
  modoAtual.current = modo.modo;

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
      // Voz em andamento é gente na frente do totem.
      if (evento.tipo === 'estado' && evento.valor !== 'ocioso') despacharModo({ tipo: 'atividade' });
    });
    const relogio = window.setInterval(() => {
      despachar({ tipo: 'relogio' });
      despacharModo({ tipo: 'relogio', corujaOcupada: corujaOcupada.current });
      setAgora(Date.now());
    }, 500);
    return () => { cancelar(); window.clearInterval(relogio); stub?.parar(); };
  }, [modoStub]);

  // Baixa o simulador (Three.js) em segundo plano, pra Simulação abrir sem espera.
  useEffect(() => {
    const timer = window.setTimeout(preCarregarSimulador, 4000);
    return () => window.clearTimeout(timer);
  }, []);

  /** Gesto do público ou da equipe: liga o microfone (precisa de clique ou tecla).
   * `voz.iniciar` já ignora quando há sessão; não ler `voz.ativa` aqui (fica velho no R). */
  const { iniciar: iniciarVoz, encerrar: encerrarVoz } = voz;
  const iniciar = useCallback(() => {
    if (modoStub) demonstrar.current();
    else void iniciarVoz();
  }, [modoStub, iniciarVoz]);

  // Saiu da Coruja: a conversa acaba e a Coruja volta limpa na Atração.
  useEffect(() => {
    if (modo.modo === 'coruja') return;
    nivel.current = 0;
    despachar({ tipo: 'encerrar' });
    canal.current.enviar({ tipo: 'encerrar' });
    encerrarVoz();
  }, [modo.modo, encerrarVoz]);

  const agirNoPad = useCallback((acao: AcaoNavegacao) => {
    if (acao.tipo === 'conversar') {
      // ✕ na Coruja só conversa quando há voz; sem voz, a chamada já manda apertar R1.
      if (vozStand === 'ligada' && estado.tela === 'atracao') iniciar();
      despacharModo({ tipo: 'atividade' });
      return;
    }
    despacharModo(acao);
  }, [vozStand, estado.tela, iniciar]);
  const mexeuNoPad = useCallback(() => despacharModo({ tipo: 'atividade' }), []);
  const { conectado: controleConectado, desconhecido: controleDesconhecido } = usePadStand({ modo: modo.modo, aoAgir: agirNoPad, aoMexer: mexeuNoPad });
  const avisoControle = avisoDeControle(controleDesconhecido);

  /** Toque na tela: acende a barra; na Atração, conversa (com voz) ou mostra a Vitrine (sem voz). */
  const tocar = useCallback(() => {
    despacharModo({ tipo: 'atividade', toque: true });
    if (modo.modo !== 'coruja' || estado.tela !== 'atracao') return;
    if (vozStand === 'ligada') iniciar();
    else if (vozStand === 'desligada') despacharModo({ tipo: 'ir', modo: 'vitrine' });
  }, [modo.modo, estado.tela, vozStand, iniciar]);

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
      iniciar: () => { if (modoAtual.current === 'coruja') iniciar(); },
      encerrar: () => mandar('encerrar'),
      reiniciar: () => { if (modoAtual.current === 'coruja') { mandar('reiniciar'); iniciar(); } },
      pularVideo: terminarVideo,
      demonstrar: iniciar,
      alternarGrade: () => setGrade((g) => !g),
      alternarTelaCheia,
      sair,
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      despacharModo({ tipo: 'atividade' });
      if (tratarTecla(evento, atalhos)) evento.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [sair, terminarVideo, iniciar, encerrarVoz]);

  const video = estado.tela === 'video' ? videoDoStand(estado.videoId, modoStub) : undefined;
  const videoAusente = estado.tela === 'video' && !video;
  useEffect(() => { if (videoAusente) terminarVideo(); }, [videoAusente, terminarVideo]);

  const aviso = modoStub ? 'modo de teste (?stub=1): fala gravada, sem microfone' : avisoParaEquipe(voz.fim, status);
  const semVoz = vozStand !== 'ligada' ? chamadaSemVoz(controleConectado) : null;
  const segundosParaSair = avisoDeSaida(modo, agora);
  // `volta` remonta a Tela do app quando o mesmo item se repete (zera o relógio dela).
  const [volta, setVolta] = useState(0);
  const terminarVitrine = useCallback(() => { setVolta((v) => v + 1); despacharModo({ tipo: 'video_terminou' }); }, []);
  const itemVitrine = ITENS_VITRINE[modo.video];
  const telaApp = itemVitrine?.tipo === 'lab' && telas.caso
    ? <TelaLab key={volta} caso={telas.caso} pausado={modo.pausado} aoTerminar={terminarVitrine} aoFalhar={telas.labFalhou} />
    : itemVitrine?.tipo === 'trator'
      ? <TelaTrator key={volta} trator={telas.trator} pausado={modo.pausado} aoTerminar={terminarVitrine} />
      : undefined;
  // Voltou pra Vitrine num item que saiu do ar (L1/R1 guarda o índice): segue pro próximo.
  const itemFora = modo.modo === 'vitrine' && !!itemVitrine && !prontos.current[modo.video];
  useEffect(() => { if (itemFora) terminarVitrine(); }, [itemFora, terminarVitrine]);

  return (
    <main
      className="stand"
      style={{ '--stand-margem': `${margem}%` } as CSSProperties}
      data-grade={grade || undefined}
      data-margem={`${margem}%`}
      data-modo={modo.modo}
      data-tela={estado.tela}
      data-sessao={voz.ativa ? 'ativa' : voz.fim?.motivo ?? 'parada'}
      data-voz-stand={vozStand}
      onPointerDown={tocar}
    >
      {modo.modo === 'coruja' && video && (
        <PlayerVideo variante={variante} nivel={nivel} voz={estado.voz} arquivo={video.arquivo} titulo={video.titulo} aoTerminar={terminarVideo} />
      )}
      {modo.modo === 'coruja' && (
        <div className="stand-seguro">
          {estado.tela === 'atracao' && (
            <Atracao
              variante={variante}
              nivel={nivel}
              titulo={semVoz?.titulo}
              chamada={semVoz ? semVoz.sub : chamadaDeInicio(modoStub ? false : voz.ativa, voz.fim)}
            />
          )}
          {estado.tela === 'conversa' && <Conversa variante={variante} nivel={nivel} voz={estado.voz} legenda={estado.legenda} />}
          <p className="stand-selo" aria-label="Assistente de IA">Assistente de IA</p>
          {aviso && estado.tela === 'atracao' && <p className="stand-aviso-equipe">{aviso}</p>}
        </div>
      )}
      {modo.modo === 'vitrine' && (
        <VitrineStand item={itemVitrine} pausado={modo.pausado} aoTerminar={terminarVitrine} telaApp={telaApp} pulos={descreverPulos(telas.prontidao)} />
      )}
      {modo.modo === 'simulacao' && <SimulacaoStand />}
      <div className="stand-seguro stand-camada">
        {controleConectado && <DicaControle modo={modo.modo} />}
        {segundosParaSair !== null && <AvisoSaida segundos={segundosParaSair} />}
        {avisoControle && <p className="stand-aviso-equipe stand-aviso-controle">{avisoControle}</p>}
        <BarraModos modo={modo.modo} visivel={barraVisivel(modo, agora)} aoEscolher={(m) => { despacharModo({ tipo: 'atividade', toque: true }); despacharModo({ tipo: 'ir', modo: m }); }} />
      </div>
    </main>
  );
}
