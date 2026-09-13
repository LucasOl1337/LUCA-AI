import { useMemo } from 'react';
import { ArrowRight, ChevronRight, Play } from 'lucide-react';
import { getSompoEpisodePlan, getSompoRuralFrame } from '../../../shared/sompo-telemetry-simulator.js';
import { getSompoAgriFrame } from '../../../shared/sompo-agri-scenarios.js';
import { getSompoAgriEpisodePlan, isSompoAgriScenarioId } from '../../../shared/sompo-agri-brief.js';
import type { SompoTelemetrySnapshot } from '@/lib/types';
import type { SompoUserStory } from '@/lib/sompo-stories';

interface SompoStoryBannerProps {
  story: SompoUserStory;
  telemetry: SompoTelemetrySnapshot | null;
  onSelect: (scenarioId: string, outcomeId: string) => void;
}

/**
 * Faixa narrativa da user story ativa: mostra o problema, o desfecho que está
 * rodando e a timeline de fases do roteiro com o ponteiro seguindo a
 * telemetria (deviceTimestamp = elapsedMs do ensaio). A leitura de km/h vem
 * do mesmo frame que anima a cena: prova de que é simulador, não vídeo.
 */
export default function SompoStoryBanner({ story, telemetry, onSelect }: SompoStoryBannerProps) {
  const scenarioId = telemetry?.source?.scenarioId ?? story.lead.scenarioId;
  const outcomeId = telemetry?.source?.outcomeId ?? story.lead.outcomeId;
  const elapsedMs = Number.isFinite(telemetry?.deviceTimestamp) ? Number(telemetry?.deviceTimestamp) : 0;

  const plan = useMemo(() => (
    isSompoAgriScenarioId(scenarioId)
      ? getSompoAgriEpisodePlan(scenarioId, outcomeId)
      : getSompoEpisodePlan(scenarioId, outcomeId)
  ), [scenarioId, outcomeId]);
  const frame = useMemo(() => (
    isSompoAgriScenarioId(scenarioId)
      ? getSompoAgriFrame(scenarioId, elapsedMs, outcomeId)
      : getSompoRuralFrame(scenarioId, elapsedMs, outcomeId)
  ), [scenarioId, outcomeId, elapsedMs]);

  const currentPhase = plan?.phases.find((phase) => elapsedMs < phase.endMs)
    ?? (plan?.phases.length ? plan.phases[plan.phases.length - 1] : null)
    ?? null;
  const currentIndex = plan && currentPhase ? plan.phases.indexOf(currentPhase) : -1;
  const progress = plan ? Math.min(1, elapsedMs / plan.totalMs) : 0;
  const speedKph = frame && Number.isFinite(frame.speedKph) ? frame.speedKph : null;
  const direction = frame && 'direction' in frame ? frame.direction : 1;

  return (
    <section className="sompo-story" aria-labelledby={`sompo-story-${story.id}`} data-sompo-story={story.id}>
      <div className="sompo-story-head">
        <div className="sompo-story-id">
          <span className="sompo-story-kicker">{story.kicker}</span>
          <h3 id={`sompo-story-${story.id}`}>{story.title}</h3>
          <p>{story.solution}</p>
        </div>
        <div className="sompo-story-live" aria-label="Leitura ao vivo">
          <span className="sompo-story-live-dot" aria-hidden="true" />
          <div>
            <strong>{speedKph != null ? `${Math.round(speedKph)} km/h${direction < 0 ? ' · ré' : ''}` : '-'}</strong>
            <span>{frame?.phaseLabel || currentPhase?.label || 'Roteiro livre'}</span>
          </div>
        </div>
      </div>

      {plan && (
        <div className="sompo-story-timeline" role="list" aria-label="Fases do roteiro">
          <div className="sompo-story-progress" style={{ '--sompo-story-progress': progress } as React.CSSProperties} aria-hidden="true" />
          {plan.phases.map((phase, index) => (
            <div
              key={`${phase.id}-${index}`}
              role="listitem"
              className={`sompo-story-phase${index === currentIndex ? ' is-current' : ''}${index < currentIndex ? ' is-done' : ''}`}
            >
              <span className="sompo-story-dot" aria-hidden="true" />
              <span className="sompo-story-phase-label">{phase.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sompo-story-foot">
        <div className="sompo-story-metrics">
          {story.metrics.map((metric) => (
            <div key={metric.label} className="sompo-story-metric">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
        <nav className="sompo-story-nav" aria-label="Outros roteiros desta história">
          {story.scenarios.map((item) => {
            const active = item.scenarioId === scenarioId && item.outcomeId === outcomeId;
            return (
              <button
                key={`${item.scenarioId}-${item.outcomeId}`}
                type="button"
                className={`sompo-story-chip${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onSelect(item.scenarioId, item.outcomeId)}
              >
                {active ? <Play size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
