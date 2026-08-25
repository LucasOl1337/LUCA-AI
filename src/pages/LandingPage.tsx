import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  GitBranch,
  RefreshCw,
  Scale,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useLuca } from '@/hooks/useLucaState';
import { useDeferredFlag } from '@/hooks/useDeferredFlag';
import { useAppLocation } from '@/hooks/useAppLocation';
import type { PageId } from '@/components/Layout';
import '@/home-page.css';

export type HomeEntryMode = 'individual' | 'team';

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

function AgentPortrait({ agent, className = '' }: { agent: (typeof AGENTS)[number]; className?: string }) {
  return (
    <figure className={className}>
      <img src={agent.image} alt="" loading="lazy" />
      <figcaption>
        <strong>{agent.name}</strong>
        <span>{agent.role}</span>
      </figcaption>
    </figure>
  );
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

export default function LandingPage({ onNavigate }: LandingPageProps) {
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

  async function retryConnection() {
    clearOperationError();
    await refresh();
  }

  return (
    <div className="home-page-scroll">
      <main className="home-page home-page-a">
        <section className="home-a-hero">
          <motion.header
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <span>Escolha seu modo</span>
            <h1>Como você quer chegar à resposta?</h1>
            <p>Comece por uma comparação independente ou por uma equipe coordenada.</p>
          </motion.header>

          <div className="home-a-modes" data-landing-cta-row>
            <motion.article
              initial={reduceMotion ? false : { opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
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
              animate={{ opacity: 1, x: 0 }}
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

        <section className="home-a-agents" data-landing-proof aria-label="Personas especializadas do LUCA-AI">
          <div className="home-agents-heading">
            <div>
              <h2>Personas especializadas. Uma entrega só.</h2>
              <p>Você escolhe quem pensa. O LUCA organiza como cada persona participa.</p>
            </div>
            <button type="button" data-landing-cta="personas" onClick={() => onNavigate('personas')}>
              Ver catálogo de personas <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <div className="home-a-agent-grid">
            <AgentPortrait agent={AGENTS[0]} className="home-a-agent-lead" />
            {AGENTS.slice(1).map((agent) => <AgentPortrait key={agent.name} agent={agent} />)}
          </div>
          <ul className="home-proof-strip" data-landing-proof-list>
            <li data-landing-proof-item="personas">Equipe de personas</li>
            <li data-landing-proof-item="missao">Missão em conversa única</li>
            <li data-landing-proof-item="runtime">Runtime com status ao vivo</li>
          </ul>
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
