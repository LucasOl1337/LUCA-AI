import type { MouseEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  ArrowRight,
  Check,
  GitBranch,
  RefreshCw,
  Scale,
  ShieldCheck,
  TrendingUp,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useLuca } from '@/hooks/useLucaState';
import { useDeferredFlag } from '@/hooks/useDeferredFlag';
import { useAppLocation } from '@/hooks/useAppLocation';
import type { PageId } from '@/components/Layout';
import { SOMPO_USER_STORIES } from '@/lib/sompo-stories';
import { HOME_FUNCOES, type HomeFuncao } from '@/lib/home-funcoes';
import '@/home-page.css';

export type HomeEntryMode = 'individual' | 'team';

const FIELD_STORY = SOMPO_USER_STORIES.find((story) => story.id === 'risco-agro-maquinas')!;
const PORTFOLIO_STORY = SOMPO_USER_STORIES.find((story) => story.id === 'prevencao-frota')!;
const PITCH_STEPS = ['Telemetria real', 'Simulação 3D e coleta', 'IA coordenada', 'Prevenção antes e inteligência depois'];

const AGENTS = [
  {
    name: 'Supervisor',
    role: 'Mantém a missão no rumo e coordena os papéis.',
    image: '/home/agent-supervisor.jpg',
  },
  {
    name: 'Planejador',
    role: 'Transforma o pedido em uma rota de execução.',
    image: '/home/agent-planner.jpg',
  },
  {
    name: 'Pesquisador',
    role: 'Busca contexto e testa as premissas da resposta.',
    image: '/home/agent-researcher.jpg',
  },
  {
    name: 'Designer',
    role: 'Organiza a entrega para ficar clara e acionável.',
    image: '/home/agent-designer.jpg',
  },
] as const;

interface LandingPageProps {
  onNavigate: (page: PageId) => void;
}

function ModeArtwork({ mode }: { mode: HomeEntryMode }) {
  const portraits = mode === 'individual' ? AGENTS.slice(1, 4) : AGENTS;
  return (
    <div className={`home-mode-art home-mode-art-${mode}`} aria-hidden="true">
      {portraits.map((agent) => <img key={agent.name} src={agent.image} alt="" />)}
      {mode === 'individual' ? <Scale /> : <GitBranch />}
    </div>
  );
}

function FuncaoBloco({ funcao, ordem, aoAbrir }: { funcao: HomeFuncao; ordem: number; aoAbrir: (destino: HomeFuncao['acao']['destino']) => void }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.article
      id={`funcao-${funcao.id}`}
      className="home-funcao"
      data-home-funcao={funcao.id}
      aria-labelledby={`funcao-${funcao.id}-titulo`}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <figure className="home-funcao-print">
        <img src={funcao.imagem} alt={funcao.imagemAlt} loading={ordem < 2 ? 'eager' : 'lazy'} decoding="async" width={1200} height={857} />
        <figcaption>Tela real do LUCA-AI</figcaption>
      </figure>
      <div className="home-funcao-corpo">
        <span className="home-funcao-num">{String(ordem + 1).padStart(2, '0')} · {funcao.categoria}</span>
        <h2 id={`funcao-${funcao.id}-titulo`}>{funcao.titulo}</h2>
        <p className="home-funcao-valor">{funcao.valor}</p>
        <ul>
          {funcao.detalhes.map((detalhe) => <li key={detalhe}><Check aria-hidden="true" />{detalhe}</li>)}
        </ul>
        <div className="home-funcao-acoes">
          <button type="button" data-home-funcao-cta={funcao.id} onClick={() => aoAbrir(funcao.acao.destino)}>
            {funcao.acao.rotulo} <ArrowRight aria-hidden="true" />
          </button>
          {funcao.secundaria && (
            <button type="button" className="home-funcao-secundaria" onClick={() => aoAbrir(funcao.secundaria!.destino)}>
              {funcao.secundaria.rotulo}
            </button>
          )}
        </div>
        <small>{funcao.nota}</small>
      </div>
    </motion.article>
  );
}

export default function LandingPage(_props: LandingPageProps) {
  const reduceMotion = useReducedMotion();
  const { navigate } = useAppLocation();
  const {
    backendReady,
    connectionState,
    runtimeMode,
    operationError,
    refresh,
    clearOperationError,
  } = useLuca();

  const cloudRuntime = runtimeMode === 'cloud';
  const runtimeOnline = cloudRuntime ? connectionState !== 'offline' : backendReady;
  const checking = connectionState === 'checking';
  const showChecking = useDeferredFlag(checking);
  const confirmOffline = !checking && !runtimeOnline;
  const systemBadge = showChecking ? 'conectando' : runtimeOnline ? 'online' : confirmOffline ? 'offline' : 'online';
  const needsRecovery = Boolean(operationError) || (!checking && !runtimeOnline);
  const statusTone = operationError || confirmOffline
    ? 'error'
    : showChecking
      ? 'warning'
      : 'ok';
  const statusCopy = operationError
    ? operationError
    : showChecking
      ? 'Conectando ao runtime para preparar o LUCA-AI e o catálogo de personas.'
      : cloudRuntime
        ? 'Modo público online. O runtime da VM está conectado ao 9Router e pronto para atender o LUCA-AI.'
        : backendReady
          ? 'Sistema online. Escolha Individual ou Equipe para começar, ou abra Personas para montar o catálogo.'
          : 'Sem conexão com o backend. Verifique se o servidor está em 127.0.0.1:4242.';

  function startMode(mode: HomeEntryMode) {
    window.sessionStorage.setItem('luca.lucaAi.entryMode', mode);
    navigate({ page: 'luca-ai', modo: mode === 'individual' ? 'individual' : '' }, 'push');
  }

  function irPara(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    document.getElementById(`funcao-${id}`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  async function retryConnection() {
    clearOperationError();
    await refresh();
  }

  return (
    <div className="home-page-scroll">
      <main className="home-page home-page-a">
        <section className="home-abertura" aria-labelledby="home-abertura-titulo">
          <span className="home-abertura-eyebrow">Tudo o que o LUCA-AI faz</span>
          <h1 id="home-abertura-titulo">Do sensor na máquina à decisão da equipe.</h1>
          <p>Oito experiências reais, da coruja que conversa no stand à equipe de agentes que analisa o caso. Role para ver uma por uma, da mais surpreendente à mais conhecida.</p>
          <ol className="home-stories-flow" aria-label="Do sensor à decisão em quatro passos">
            {PITCH_STEPS.map((step, index) => (
              <li key={step}><span>{String(index + 1).padStart(2, '0')}</span>{step}{index < PITCH_STEPS.length - 1 && <ArrowRight aria-hidden="true" />}</li>
            ))}
          </ol>
          <nav className="home-indice" aria-label="Funções do LUCA-AI">
            {[...HOME_FUNCOES.map((funcao) => ({ id: funcao.id, titulo: funcao.titulo })), { id: 'luca-ai', titulo: 'LUCA-AI' }].map((item, index) => (
              <a key={item.id} href={`#funcao-${item.id}`} onClick={(event) => irPara(event, item.id)}>
                <span>{String(index + 1).padStart(2, '0')}</span>{item.titulo}
              </a>
            ))}
          </nav>
          <ArrowDown className="home-abertura-seta" aria-hidden="true" />
        </section>

        <div className="home-funcoes">
          {HOME_FUNCOES.map((funcao, index) => (
            <FuncaoBloco key={funcao.id} funcao={funcao} ordem={index} aoAbrir={(destino) => navigate(destino, 'push')} />
          ))}
        </div>

        <section className="home-a-hero" id="funcao-luca-ai" data-home-funcao="luca-ai" aria-labelledby="funcao-luca-ai-titulo">
          <motion.header
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <span>{String(HOME_FUNCOES.length + 1).padStart(2, '0')} · Equipe de agentes de IA</span>
            <h2 id="funcao-luca-ai-titulo">LUCA-AI</h2>
            <p className="home-a-hero-lead">Como você quer chegar à resposta?</p>
            <p>Faça a pergunta uma vez: personas comparam respostas independentes ou trabalham juntas numa missão, e você acompanha cada passo na mesma conversa.</p>
          </motion.header>

          <div className="home-a-modes" data-landing-cta-row>
            <motion.article
              initial={reduceMotion ? false : { opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <ModeArtwork mode="individual" />
              <div className="home-a-mode-copy">
                <div className="home-mode-icon"><UserRound aria-hidden="true" /></div>
                <div>
                  <h2>Individual</h2>
                  <p>Perspectivas independentes. Um juiz compara tudo e entrega o veredito.</p>
                </div>
              </div>
              <ul>
                <li><Check aria-hidden="true" /> Faça uma pergunta uma vez</li>
                <li><Check aria-hidden="true" /> Compare até cinco respostas</li>
                <li><Check aria-hidden="true" /> Receba uma decisão final</li>
              </ul>
              <button type="button" data-landing-cta="individual" onClick={() => startMode('individual')}>
                Usar modo individual <ArrowRight aria-hidden="true" />
              </button>
            </motion.article>

            <motion.article
              initial={reduceMotion ? false : { opacity: 0, x: 16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
            >
              <ModeArtwork mode="team" />
              <div className="home-a-mode-copy">
                <div className="home-mode-icon"><UsersRound aria-hidden="true" /></div>
                <div>
                  <h2>Equipe</h2>
                  <p>Personas em papéis definidos executam, revisam e sintetizam a missão.</p>
                </div>
              </div>
              <ul>
                <li><Check aria-hidden="true" /> Defina uma missão</li>
                <li><Check aria-hidden="true" /> Distribua os papéis</li>
                <li><Check aria-hidden="true" /> Acompanhe uma entrega única</li>
              </ul>
              <button type="button" data-landing-cta="team" onClick={() => startMode('team')}>
                Usar modo equipe <ArrowRight aria-hidden="true" />
              </button>
            </motion.article>
          </div>
        </section>

        <section className="home-stories" aria-labelledby="home-stories-titulo">
          <header className="home-stories-cabeca">
            <span>Por que isso importa</span>
            <h2 id="home-stories-titulo">Prevenção antes, inteligência depois.</h2>
          </header>
          <div className="home-stories-grid">
            <motion.article
              className="home-story"
              data-home-story="field"
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="home-story-art">
                <img src="/sompo/bg-agro.jpg" alt="" fetchPriority="high" />
                <span className="home-story-horizon"><ShieldCheck aria-hidden="true" />Curto prazo · No campo</span>
              </div>
              <div className="home-story-body">
                <span className="home-story-eyebrow">Prevenção em campo</span>
                <h2>Ver o risco a tempo de parar.</h2>
                <p className="home-story-lead">Como operador, quero receber o alerta antes de o trator tombar e entender o que aconteceu.</p>
                <p>O sensor mede inclinação e aceleração em tempo real. No roteiro 3D, o alerta aparece antes da parada preventiva; ao gravar o episódio, 5 imagens datadas ajudam a equipe de IA a explicar a sequência.</p>
                <div className="home-story-actions">
                  <button type="button" data-landing-cta="field" onClick={() => navigate({ page: 'sompo', aba: 'telemetria', cenario: FIELD_STORY.lead.scenarioId, desfecho: 'controlled-stop' }, 'push')}>
                    Ver a parada preventiva <ArrowRight aria-hidden="true" />
                  </button>
                </div>
                <small>Demonstração simulada · Alerta, episódio e parecer</small>
              </div>
            </motion.article>

            <motion.article
              className="home-story"
              data-home-story="portfolio"
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="home-story-art">
                <img src={PORTFOLIO_STORY.image} alt="" />
                <span className="home-story-horizon"><TrendingUp aria-hidden="true" />Longo prazo · Na carteira</span>
              </div>
              <div className="home-story-body">
                <span className="home-story-eyebrow">Aprendizado para a próxima safra</span>
                <h2>Aprender com o que já aconteceu.</h2>
                <p className="home-story-lead">Como gestor da frota e seguradora, quero comparar a telemetria de várias máquinas e usar os episódios passados pra decidir a próxima safra.</p>
                <p>Jornadas, alertas e episódios viram estatísticas por máquina. O Conselho de Estratégia usa essas evidências para recomendar treinamento, mudanças na operação e decisões para a próxima safra.</p>
                <div className="home-story-actions">
                  <button type="button" data-landing-cta="portfolio" onClick={() => navigate({ page: 'sompo', aba: 'safra' }, 'push')}>
                    Ver o desempenho da frota <ArrowRight aria-hidden="true" />
                  </button>
                </div>
                <small>Histórico da instalação e frota demonstrativa em blocos separados</small>
              </div>
            </motion.article>
          </div>
        </section>

        <aside
          className="home-page-status"
          data-landing-system-status
          data-tone={statusTone}
          role={needsRecovery ? 'alert' : 'status'}
          {...(needsRecovery ? { 'data-landing-system-error': true } : {})}
        >
          <span className="home-page-status-mark" aria-hidden="true" />
          <p>{statusCopy}</p>
          <strong>{systemBadge}</strong>
          {needsRecovery && (
            <div data-landing-system-actions>
              <button type="button" className="btn-primary" data-landing-system-retry onClick={() => void retryConnection()}>
                <RefreshCw aria-hidden="true" /> Tentar novamente
              </button>
              {operationError && (
                <button type="button" data-landing-system-dismiss onClick={clearOperationError}>
                  Dispensar
                </button>
              )}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
