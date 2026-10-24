import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { useAppLocation } from '@/hooks/useAppLocation';
import { useAuth } from '@/hooks/useAuth';
import { useSessaoVoz } from '@/stand-voz/useSessaoVoz';
import { useEscuta } from '@/stand-voz/useEscuta';
import type { Emprestimo } from '@/stand-voz/sessaoTurnos';
import { VARIANTE_PADRAO, VARIANTES_AVATAR } from '@/components/stand/AvatarLuca';
import { canalReal, type CanalStand } from '@/components/stand/canal';
import { ligarUmSomPorVez } from '@/components/stand/umSomPorVez';
import { criarCanalStub } from '@/components/stand/canalStub';
import { reduzirTela, telaInicial, type EntradaTela, type EstadoTela } from '@/components/stand/telaStand';
import { Atracao, Conversa, Palco, PlayerVideo } from '@/components/stand/Telas';
import { tratarTecla, type AtalhosStand } from '@/components/stand/atalhos';
import { avisoDeControle, avisoParaEquipe, chamadaDeInicio, chamadaSemVoz, escutaNoStand, linhaDaEscuta, motivoSemVoz, vozDoStand, type StatusStand } from '@/components/stand/avisos';
import { VIDEOS_VITRINE, videoDoStand } from '@/components/stand/videosStand';
import { descreverPulos, disponiveis, montarItens } from '@/components/stand/vitrineStand';
import { TelaLab, TelaTrator, useTelasDoApp } from '@/components/stand/TelasDoApp';
import { enviarAcaoSite } from '@/components/stand/executor/ponte';
import { aguardarExecutor } from '@/components/stand/executor/prontidao';
import { caminhoDaPagina as planejarCaminho, executarPlano, linhaDaTela, planejarAcao } from '@/components/stand/site/acaoDoStand';
import { SiteStand } from '@/components/stand/site/SiteStand';
import { avisoDeSaida, barraVisivel, modoInicial, modosDisponiveis, palcoAfkDaUrl, reduzirModo, type EntradaModo, type EstadoModo } from '@/components/stand/modoStand';
import type { AcaoNavegacao } from '@/components/stand/navegacaoPad';
import { usePadStand } from '@/components/stand/usePadStand';
import { AvisoSaida, BarraModos, preCarregarSimulador, SimulacaoStand, VitrineStand } from '@/components/stand/Modos';
import { PainelComandos } from '@/components/stand/PainelComandos';
import { MenuTotem, type EstadoItem } from '@/components/stand/MenuTotem';
import type { ItemCatalogo } from '../../shared/stand/catalogo.ts';
import { TOUR_STAND, paginaDaAcao } from '../../shared/stand/acoes-site.ts';
import type { ResultadoPlano } from '@/components/stand/site/acaoDoStand';
import { SeloCamera, useCameraTotem, WebcamCoruja } from '@/components/stand/CameraTotem';
import { EVENTO_EM_USO as EVENTO_GAMEPLAY_EM_USO } from '@/components/gameplay/eventoEmUso';
import { SimulacaoComGuia } from '@/components/stand/GuiaSimulacao';
import { encerrarVisita } from '@/components/stand/fimDeVisita';
import { CorujaCabine } from '@/components/stand/CorujaCabine';
import { useFalaCabine } from '@/components/gameplay/useFalaCabine';
import '@/stand.css';

/** Margem segura padrão (% de cada lado): a moldura de MDF come as bordas. */
const MARGEM_PADRAO = 6;

/** Fullscreen API só com gesto (botão, tecla); sem gesto o palco fica limpo do mesmo jeito. */
function pedirTelaCheia(sim: boolean) {
  if (sim && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
  else if (!sim && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}

const reduzirAgora = (atual: EstadoTela, entrada: EntradaTela) => reduzirTela(atual, entrada, Date.now());

/** Carrossel da Vitrine: vídeos do manifesto com as Telas do app no meio (Q3 b). */
const ITENS_VITRINE = montarItens(VIDEOS_VITRINE);

/** Status da voz no servidor: o texto da Atração segue `ligado` + `motivo` (inclusive `teto_diario`). */
const STATUS_A_CADA_MS = 60_000;
/**
 * Onde a escuta fica aberta: Coruja e Site. Vitrine narrada é exclusiva, sem microfone.
 * Simulação usa a mesma sessão: pedidos de ajuda e retorno continuam chegando ao LUCA.
 */
const MODOS_COM_ESCUTA: readonly string[] = ['coruja', 'site', 'simulacao'];

function useStatusStand(ativo: boolean, fimSessao: unknown, aoPerderSessao: () => void) {
  const [status, setStatus] = useState<StatusStand | null>(null);
  const perdeu = useRef(aoPerderSessao);
  perdeu.current = aoPerderSessao;
  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    const buscar = () => {
      fetch('/api/stand/status', { credentials: 'same-origin' })
        .then(async (r) => {
          // Sessão caiu com o stand aberto: o useAuth confere e o main.tsx troca para o Stand sem login.
          if (r.status === 401) perdeu.current();
          return r.ok ? r.json() : { ligado: false, motivo: `status_http_${r.status}` };
        })
        .then((dados) => { if (vivo && dados) setStatus({ ligado: !!dados.ligado, motivo: dados.motivo ?? null, escuta: !!dados.escuta }); })
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
  // Palco (24/10): `?palco=N` muda o tempo sem ninguém (segundos); `?palco=0` volta o repouso na Vitrine.
  const [modo, despacharModo] = useReducer(reduzirModoAgora, undefined, () => modoInicial(Date.now(), { palcoAfkMs: palcoAfkDaUrl(window.location.search) }));
  const palcoAtual = useRef(modo.palco);
  palcoAtual.current = modo.palco;
  const telas = useTelasDoApp(modo.modo === 'vitrine');
  // Webcam sempre ligada no Totem: um stream para todas as abas (presença para a coruja, sono na Simulação).
  const webcam = useCameraTotem(modo.modo);
  prontos.current = disponiveis(ITENS_VITRINE, telas.prontidao);
  const [agora, setAgora] = useState(() => Date.now());
  const voz = useSessaoVoz();
  const { refreshSession } = useAuth();
  const status = useStatusStand(!modoStub, voz.fim, refreshSession);
  const vozStand = modoStub ? 'ligada' : vozDoStand(status, voz.fim, agora);
  /** Escuta ligada no servidor; Vitrine narrada suspende captura em vez de silenciar o vídeo. */
  const escutaLigada = escutaNoStand(status, vozStand, modoStub);
  const { iniciar: iniciarVoz, encerrar: encerrarVoz } = voz;
  // Escuta: na Coruja, alguém falando abre a conversa sem toque (Lucas, 19/10).
  const despertar = useCallback((emprestimo: Emprestimo) => {
    despacharModo({ tipo: 'atividade' });
    void iniciarVoz(emprestimo);
  }, [iniciarVoz]);
  const segurandoFala = useFalaCabine(modo.modo === 'simulacao');
  const escuta = useEscuta({
    ativa: escutaLigada && estado.tela !== 'video' && MODOS_COM_ESCUTA.includes(modo.modo),
    emConversa: voz.ativa,
    fim: voz.fim,
    despertar,
  });
  const motivoVoz = modoStub ? '' : motivoSemVoz(status, voz.fim, agora);
  const nivel = useRef(0);
  const canal = useRef<CanalStand>(canalReal);
  const demonstrar = useRef<() => void>(() => undefined);
  const videoRef = useRef(estado.videoId);
  videoRef.current = estado.videoId;
  const corujaOcupada = useRef(false);
  // Rosto na frente também segura a Coruja: o palco por tempo é pra quando não há ninguém.
  corujaOcupada.current = estado.tela !== 'atracao' || voz.ativa || webcam.presenca === 'rosto';
  const modoAtual = useRef(modo.modo);
  modoAtual.current = modo.modo;
  const paginaAtual = useRef(modo.pagina);
  paginaAtual.current = modo.pagina;
  const falando = useRef(false);
  falando.current = estado.voz === 'pensando' || estado.voz === 'falando';
  /** Falha de ação no site: só a equipe vê (canto da tela), some sozinha. */
  const [falhaSite, setFalhaSite] = useState('');
  const experienciasAbertas = useRef(new Set<string>());
  const filaAcoes = useRef<Promise<void>>(Promise.resolve());
  /** Menu fixo (grill Totem interativo r1): grupo aberto, item em execução e o retorno. */
  const [menu, setMenu] = useState<{ aberto: boolean; grupo: string | null }>({ aberto: false, grupo: null });
  const [statusMenu, setStatusMenu] = useState<EstadoItem | null>(null);
  const perguntaPendente = useRef<string | null>(null);
  const tourVez = useRef(0);

  /**
   * Uma Ação do site, venha da voz ou do menu: o mesmo planner, a mesma fila
   * (uma por vez) e a mesma linha `Tela:` para o cérebro.
   */
  const rodarAcao = useCallback((acao: string, args: Record<string, unknown>): Promise<ResultadoPlano> => {
    const feito = filaAcoes.current.then(() => {
      const plano = planejarAcao(acao, args, { modo: modoAtual.current, pagina: paginaAtual.current });
      return executarPlano(plano, { despacharModo, aguardarExecutor, enviarAcaoSite });
    }).then((r) => {
      if (r.ok) {
        const aberta = acao === 'abrir_pagina' ? String(args.pagina) : paginaDaAcao(acao);
        if (aberta && ['vitrine', 'simulacao', 'sonolencia', 'sensor', 'laboratorio', 'sompo', 'inicio', 'luca_ai', 'gameplay', 'operador'].includes(aberta)) experienciasAbertas.current.add(aberta);
      }
      canal.current.enviar({ tipo: 'tela', texto: linhaDaTela(r, [...experienciasAbertas.current]) });
      if (!r.ok) {
        console.warn('[stand] ação no site falhou:', r.mensagem);
        canal.current.enviar({ tipo: 'acao_falhou' });
      }
      return r;
    }, (erro) => {
      console.warn('[stand] ação no site quebrou:', erro);
      return { ok: false, mensagem: 'A ação quebrou na tela.' } as ResultadoPlano;
    });
    filaAcoes.current = feito.then(() => undefined);
    return feito;
  }, []);

  // Botão e voz registram abertura confirmada, nunca teste concluído.
  useEffect(() => {
    let vivo = true;
    const registrar = async () => {
      if (modo.modo === 'coruja') {
        canal.current.enviar({ tipo: 'tela', texto: linhaDaTela({ ok: true, mensagem: 'Tela atual: coruja.' }, [...experienciasAbertas.current]) });
        return;
      }
      if (modo.modo === 'site' && modo.pagina && !(await aguardarExecutor(planejarCaminho(modo.pagina)))) return;
      if (!vivo) return;
      const aberta = modo.modo === 'site' ? modo.pagina : modo.modo;
      if (aberta) experienciasAbertas.current.add(aberta);
      canal.current.enviar({ tipo: 'tela', texto: linhaDaTela({ ok: true, mensagem: `Tela atual: ${aberta}.` }, [...experienciasAbertas.current]) });
    };
    void registrar();
    return () => { vivo = false; };
  }, [modo.modo, modo.pagina]);

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
        // Totem-Site Q4: abrir_pagina/voltar_coruja trocam o modo; controles vão ao Executor do iframe.
        // Uma ação por vez (o tour manda várias seguidas): o plano é feito quando a anterior termina.
        // O cérebro fica sabendo do que a tela fez e mostra (linha `Tela:` na próxima pergunta).
        void rodarAcao(evento.acao, evento.args).then((r) => { if (!r.ok) setFalhaSite(r.mensagem); });
      }
      else despachar(evento);
      // Voz em andamento é gente na frente do totem.
      if (evento.tipo === 'estado' && evento.valor !== 'ocioso') despacharModo({ tipo: 'atividade' });
      // Despertar na Vitrine é discreto: o vídeo segue até a 1ª palavra, e aí a Coruja assume já na Conversa.
      if (evento.tipo === 'estado' && evento.valor !== 'ocioso' && modoAtual.current === 'vitrine') despacharModo({ tipo: 'ir', modo: 'coruja' });
    });
    const relogio = window.setInterval(() => {
      despachar({ tipo: 'relogio' });
      despacharModo({ tipo: 'relogio', corujaOcupada: corujaOcupada.current, falando: falando.current });
      setAgora(Date.now());
    }, 500);
    return () => { cancelar(); window.clearInterval(relogio); stub?.parar(); };
  }, [modoStub, rodarAcao]);

  // Um som por vez: efeitos esperam a fala; alarme de sono corta a fala e toca sozinho.
  useEffect(() => ligarUmSomPorVez(canal.current), [modoStub]);

  // Baixa o simulador (Three.js) em segundo plano, pra Simulação abrir sem espera.
  useEffect(() => {
    const timer = window.setTimeout(preCarregarSimulador, 4000);
    return () => window.clearTimeout(timer);
  }, []);

  /** Gesto do público ou da equipe: liga o microfone (precisa de clique ou tecla).
   * `voz.iniciar` já ignora quando há sessão; não ler `voz.ativa` aqui (fica velho no R). */
  const { aoTocar: tocouNaEscuta } = escuta;
  useEffect(() => {
    if (!segurandoFala || modoStub || voz.ativa || vozStand !== 'ligada') return;
    void iniciarVoz(tocouNaEscuta(false) ?? undefined);
  }, [segurandoFala, modoStub, voz.ativa, vozStand, iniciarVoz, tocouNaEscuta]);
  const iniciar = useCallback(() => {
    if (modoStub) demonstrar.current();
    // Com a escuta aberta, o toque libera o áudio do dia e usa o mesmo microfone.
    else void iniciarVoz(tocouNaEscuta() ?? undefined);
  }, [modoStub, iniciarVoz, tocouNaEscuta]);

  // Vitrine encerra a conversa anterior. Site e Simulação preservam a mesma sessão.
  useEffect(() => {
    if (modo.modo === 'coruja' || modo.modo === 'site' || modo.modo === 'simulacao') return;
    nivel.current = 0;
    despachar({ tipo: 'encerrar' });
    canal.current.enviar({ tipo: 'encerrar' });
    encerrarVoz();
    // Fim de visita: a próxima pessoa não herda experiências, chat da corrida nem vista do trator.
    experienciasAbertas.current.clear();
    encerrarVisita();
  }, [modo.modo, encerrarVoz]);

  const agirNoPad = useCallback((acao: AcaoNavegacao) => {
    if (acao.tipo === 'conversar') {
      // ✕ na Coruja conversa quando há voz; sem voz mostra a Vitrine (igual ao toque).
      if (vozStand === 'ligada' && estado.tela === 'atracao') iniciar();
      else if (vozStand === 'desligada' && estado.tela === 'atracao') despacharModo({ tipo: 'ir', modo: 'vitrine' });
      despacharModo({ tipo: 'atividade' });
      return;
    }
    despacharModo(acao);
  }, [vozStand, estado.tela, iniciar]);
  const mexeuNoPad = useCallback(() => despacharModo({ tipo: 'atividade' }), []);
  // Quem espera a análise dos agentes do percurso está usando o totem (estande aberto: nada expulsa usuário ativo).
  useEffect(() => {
    const emUso = () => despacharModo({ tipo: 'atividade' });
    window.addEventListener(EVENTO_GAMEPLAY_EM_USO, emUso);
    return () => window.removeEventListener(EVENTO_GAMEPLAY_EM_USO, emUso);
  }, []);

  // ── Menu fixo: toque e texto chegam à mesma ação que a voz (grill r1, Q1/Q2/Q5) ──
  const abrirMenu = useCallback((grupo: string | null = null) => {
    despacharModo({ tipo: 'atividade', toque: true });
    setMenu({ aberto: true, grupo });
  }, []);
  const fecharMenu = useCallback(() => setMenu({ aberto: false, grupo: null }), []);
  /** Pergunta do menu: com conversa pronta vai direto; sem, abre a conversa e manda quando ela estiver ouvindo. */
  const perguntar = useCallback((texto: string) => {
    if (modoAtual.current !== 'coruja' && modoAtual.current !== 'site') despacharModo({ tipo: 'voltar_coruja' });
    setStatusMenu({ item: 'pergunta', fase: 'ok', mensagem: `perguntei ao LUCA: “${texto}”` });
    fecharMenu();
    // A sessão só ouve a página depois de abrir microfone e conexão (sai de `ocioso`): antes disso, fica pendente.
    if (modoStub || (voz.ativa && voz.estado !== 'ocioso')) { canal.current.enviar({ tipo: 'pergunta_texto', texto }); return; }
    perguntaPendente.current = texto;
    iniciar();
  }, [modoStub, voz.ativa, voz.estado, iniciar, fecharMenu]);
  useEffect(() => {
    const texto = perguntaPendente.current;
    if (!texto) return;
    if (!voz.ativa && voz.fim) { perguntaPendente.current = null; setStatusMenu({ item: 'pergunta', fase: 'falha', mensagem: 'o assistente não abriu a conversa agora.' }); return; }
    if (!voz.ativa || voz.estado === 'ocioso') return;
    perguntaPendente.current = null;
    canal.current.enviar({ tipo: 'pergunta_texto', texto });
  }, [voz.ativa, voz.estado, voz.fim]);
  /** Tour pelo menu: o roteiro fixo `TOUR_STAND`, com as falas na tela (funciona sem voz). */
  const rodarTour = useCallback(async () => {
    const vez = ++tourVez.current;
    fecharMenu();
    for (const passo of TOUR_STAND) {
      if (tourVez.current !== vez) return;
      if ('fala' in passo) {
        setStatusMenu({ item: 'tour', fase: 'executando', mensagem: passo.texto });
        await new Promise((ok) => window.setTimeout(ok, Math.max(3000, passo.texto.length * 60)));
        continue;
      }
      const r = await rodarAcao(passo.acao, passo.args);
      if (!r.ok) { setStatusMenu({ item: 'tour', fase: 'falha', mensagem: r.mensagem }); return; }
    }
    setStatusMenu({ item: 'tour', fase: 'ok', mensagem: 'tour terminado.' });
  }, [rodarAcao, fecharMenu]);
  const executarItem = useCallback((item: ItemCatalogo) => {
    despacharModo({ tipo: 'atividade', toque: true });
    tourVez.current += 1;
    const alvo = item.alvo;
    if (alvo.tipo === 'tour') { void rodarTour(); return; }
    if (alvo.tipo === 'pergunta') { perguntar(alvo.texto); return; }
    if (alvo.tipo === 'video') {
      if (modoAtual.current !== 'coruja') despacharModo({ tipo: 'voltar_coruja' });
      // O menu não passa pelo turno que normalmente suspende a voz antes do vídeo.
      canal.current.enviar({ tipo: 'video_iniciado', id: alvo.id });
      despachar({ tipo: 'tocar_video', id: alvo.id });
      setStatusMenu({ item: item.id, fase: 'ok', mensagem: `tocando “${item.rotulo}”.` });
      fecharMenu();
      return;
    }
    setStatusMenu({ item: item.id, fase: 'executando', mensagem: '' });
    void rodarAcao(alvo.acao, alvo.args).then((r) => {
      setStatusMenu({ item: item.id, fase: r.ok ? 'ok' : 'falha', mensagem: r.mensagem });
      if (r.ok) fecharMenu();
    });
  }, [rodarAcao, rodarTour, perguntar, fecharMenu]);
  useEffect(() => {
    if (!statusMenu || statusMenu.fase === 'executando' || menu.aberto) return undefined;
    const timer = window.setTimeout(() => setStatusMenu(null), 9000);
    return () => window.clearTimeout(timer);
  }, [statusMenu, menu.aberto]);
  useEffect(() => {
    if (!falhaSite) return undefined;
    const timer = window.setTimeout(() => setFalhaSite(''), 8000);
    return () => window.clearTimeout(timer);
  }, [falhaSite]);
  const { conectado: controleConectado, desconhecido: controleDesconhecido } = usePadStand({ modo: modo.modo, aoAgir: agirNoPad, aoMexer: mexeuNoPad });
  const avisoControle = avisoDeControle(controleDesconhecido);
  useEffect(() => {
    const sairCircuito = () => despacharModo({ tipo: 'voltar_coruja' });
    window.addEventListener('luca:circuito-sair', sairCircuito);
    return () => window.removeEventListener('luca:circuito-sair', sairCircuito);
  }, []);

  /** Toque na tela: acende a barra; na Atração, conversa (com voz) ou mostra a Vitrine (sem voz). */
  const tocar = useCallback(() => {
    despacharModo({ tipo: 'atividade', toque: true });
    // No palco o primeiro toque só acorda a Coruja (a tela volta com tudo); o seguinte conversa.
    if (palcoAtual.current) return;
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
      // F: liga/desliga o palco (coruja sozinha) junto com a tela cheia do navegador.
      alternarTelaCheia: () => {
        const ligar = !palcoAtual.current;
        despacharModo({ tipo: 'palco', ligado: ligar });
        pedirTelaCheia(ligar);
      },
      sair,
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      despacharModo({ tipo: 'atividade' });
      if (modoAtual.current === 'simulacao') {
        if (evento.key === 'Escape') {
          // Esc pertence à pausa do circuito; não abandona a run.
          evento.preventDefault();
        }
        // WASD, espaço e R pertencem ao jogo, sem acionar atalhos de voz.
        if (!(evento.shiftKey && evento.key.toLowerCase() === 'q')) return;
      }
      if (tratarTecla(evento, atalhos)) evento.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [sair, terminarVideo, iniciar, encerrarVoz]);

  // Rosto chegando na frente do totem tira a Coruja do palco (só na chegada, não a cada leitura).
  useEffect(() => { if (webcam.presenca === 'rosto') despacharModo({ tipo: 'atividade' }); }, [webcam.presenca]);
  // Entrou no palco: menu aberto fecha (ninguém está usando).
  useEffect(() => { if (modo.palco) setMenu({ aberto: false, grupo: null }); }, [modo.palco]);

  const video = estado.tela === 'video' ? videoDoStand(estado.videoId, modoStub) : undefined;
  // Palco: só a coruja na tela. Vídeo pedido continua por cima (o palco volta quando ele acaba).
  const palco = modo.palco && modo.modo === 'coruja' && estado.tela !== 'video';
  // Painel do catálogo ao lado da coruja: sempre tocável; com voz mostra também o pedido falado.
  const painelComandos = estado.tela !== 'video';
  const comVoz = modoStub || vozStand === 'ligada';
  const semVozMotivo = comVoz ? null : 'Perguntas precisam do assistente ligado; agora ele está desligado.';
  const indisponivel = (item: ItemCatalogo): string | null => {
    if (item.requer?.includes('voz') && !comVoz) return 'precisa do assistente de voz, desligado agora';
    if (item.requer?.includes('webcam') && webcam.camera.fase === 'erro') return 'precisa da webcam, que não abriu neste totem';
    return null;
  };
  const videoAusente = estado.tela === 'video' && !video;
  useEffect(() => { if (videoAusente) terminarVideo(); }, [videoAusente, terminarVideo]);

  const aviso = modoStub ? 'modo de teste (?stub=1): fala gravada, sem microfone' : avisoParaEquipe(voz.fim, status);
  const semVoz = vozStand !== 'ligada' ? chamadaSemVoz(controleConectado) : null;
  const segundosParaSair = avisoDeSaida(modo, agora);
  // Vitrine e Site não têm Atração: lá a tela de voz conta como Atração enquanto ninguém conversa.
  const linhaEscuta = linhaDaEscuta(escuta.estado, modo.modo === 'coruja' ? estado.tela : voz.estado === 'ocioso' ? 'atracao' : 'conversa');
  // `volta` remonta a Tela do app quando o mesmo item se repete (zera o relógio dela).
  const [volta, setVolta] = useState(0);
  const terminarVitrine = useCallback(() => { setVolta((v) => v + 1); despacharModo({ tipo: 'video_terminou' }); }, []);
  const itemVitrine = ITENS_VITRINE[modo.video];
  const telaApp = itemVitrine?.tipo === 'lab' && telas.caso
    ? <TelaLab key={volta} caso={telas.caso} pausado={modo.pausado} aoTerminar={terminarVitrine} aoFalhar={telas.labFalhou} />
    : itemVitrine?.tipo === 'trator'
      ? <TelaTrator key={volta} trator={telas.trator} pausado={modo.pausado} aoTerminar={terminarVitrine} />
      : undefined;
  // Voltou pra Vitrine num item que saiu do ar (a Vitrine guarda o índice): segue pro próximo.
  const itemFora = modo.modo === 'vitrine' && !!itemVitrine && !prontos.current[modo.video];
  useEffect(() => { if (itemFora) terminarVitrine(); }, [itemFora, terminarVitrine]);

  return (
    <main
      className="stand"
      style={{ '--stand-margem': `${margem}%` } as CSSProperties}
      data-grade={grade || undefined}
      data-margem={`${margem}%`}
      data-modo={modo.modo}
      data-palco={modo.palco || undefined}
      data-tela={estado.tela}
      data-sessao={voz.ativa ? 'ativa' : voz.fim?.motivo ?? 'parada'}
      data-voz-stand={vozStand}
      data-painel={painelComandos || undefined}
      data-motivo={motivoVoz || undefined}
      data-escuta={escuta.estado}
      data-camera={webcam.camera.fase}
      data-presenca={webcam.presenca}
      onPointerDown={tocar}
    >
      {palco && <Palco variante={variante} nivel={nivel} voz={estado.voz} />}
      {modo.modo === 'coruja' && video && (
        <PlayerVideo variante={variante} nivel={nivel} voz={estado.voz} arquivo={video.arquivo} titulo={video.titulo} aoTerminar={terminarVideo} />
      )}
      {modo.modo === 'coruja' && !palco && (
        <div className="stand-seguro" data-painel={painelComandos || undefined}>
          {estado.tela === 'atracao' && (
            <Atracao
              variante={variante}
              nivel={nivel}
              titulo={semVoz?.titulo}
              chamada={semVoz ? semVoz.sub : chamadaDeInicio(modoStub ? false : voz.ativa, voz.fim, escuta.estado)}
            />
          )}
          {estado.tela === 'conversa' && <Conversa variante={variante} nivel={nivel} voz={estado.voz} legenda={estado.legenda} />}
          {painelComandos && <PainelComandos voz={comVoz} aoEscolher={(id) => abrirMenu(id)} />}
          <p className="stand-selo" aria-label="Assistente de IA">Assistente de IA</p>
          <WebcamCoruja presenca={webcam.presenca} />
          {aviso && estado.tela === 'atracao' && <p className="stand-aviso-equipe">{aviso}</p>}
        </div>
      )}
      {modo.modo === 'vitrine' && (
        <VitrineStand aoPausar={() => despacharModo({ tipo: 'pausar' })} item={itemVitrine} pausado={modo.pausado} aoTerminar={terminarVitrine} telaApp={telaApp} pulos={descreverPulos(telas.prontidao)} />
      )}
      {modo.modo === 'simulacao' && <><SimulacaoComGuia comVoz={comVoz && !modoStub}><SimulacaoStand /></SimulacaoComGuia>
        <CorujaCabine voz={estado.voz} legenda={estado.legenda} nivel={nivel} segurando={segurandoFala} disponivel={comVoz && !modoStub} />
      </>}
      {modo.modo === 'site' && modo.pagina && (
        <SiteStand pagina={modo.pagina} variante={variante} nivel={nivel} voz={estado.voz} legenda={estado.legenda} aoMexer={mexeuNoPad} />
      )}
      {modo.modo !== 'simulacao' && !palco && <div className="stand-seguro stand-camada">
        <SeloCamera estado={webcam.camera} />
        {segundosParaSair !== null && <AvisoSaida segundos={segundosParaSair} />}
        {avisoControle && <p className="stand-aviso-equipe stand-aviso-controle">{avisoControle}</p>}
        {falhaSite && <p className="stand-aviso-equipe stand-aviso-site" role="status">ação no site: {falhaSite}</p>}
        <MenuTotem
          aberto={menu.aberto}
          grupo={menu.grupo}
          status={statusMenu}
          indisponivel={indisponivel}
          motivoSemTexto={semVozMotivo}
          aoAbrirGrupo={(grupo) => abrirMenu(grupo)}
          aoFechar={fecharMenu}
          aoExecutar={executarItem}
          aoPerguntar={perguntar}
        />
        {statusMenu && !menu.aberto && (
          <p className="stand-status-acao" role="status" data-fase={statusMenu.fase}>
            {statusMenu.fase === 'executando' ? (statusMenu.mensagem || 'Fazendo…') : statusMenu.fase === 'ok' ? `Feito: ${statusMenu.mensagem}` : `Não deu: ${statusMenu.mensagem}`}
          </p>
        )}
        {linhaEscuta && <p className="stand-linha-escuta">{linhaEscuta}</p>}
        <BarraModos
          modo={modo.modo}
          modos={modosDisponiveis(modo)}
          visivel={barraVisivel(modo, agora)}
          aoEscolher={(m) => { despacharModo({ tipo: 'atividade', toque: true }); despacharModo({ tipo: 'ir', modo: m }); }}
          atalhos={[{
            id: 'menu',
            rotulo: 'Menu',
            ativo: menu.aberto,
            aoEscolher: () => (menu.aberto ? fecharMenu() : abrirMenu(null)),
          }, {
            id: 'palco',
            rotulo: 'Tela cheia',
            ativo: modo.palco,
            aoEscolher: () => { fecharMenu(); despacharModo({ tipo: 'palco', ligado: true }); pedirTelaCheia(true); },
          }]}
        />
      </div>}
    </main>
  );
}
