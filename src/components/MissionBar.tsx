import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, SendHorizontal, RotateCcw } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { formatMissionRuntime } from '@/lib/format';
import { useRuntimeTick } from '@/hooks/useLucaState';
import StatePill from './StatePill';
import { countDatabaseItems } from '@/lib/database';

interface SompoBriefingFields {
  caseName: string;
  claimsCsv: string;
  telemetry: string;
  finance: string;
  decisionGoal: string;
}

const SOMPO_BRIEFING_TEMPLATE: SompoBriefingFields = {
  caseName: 'Sompo Sprint 2 - Fazenda Santa Aurora',
  claimsCsv: 'tipo_evento,quantidade\nalagamento,12\nfalha_irrigacao,7\npragas,5',
  telemetry: 'Talhao norte com umidade acima do limite operacional; previsao de chuva 42mm nas proximas 24h; sensor de vazao da irrigacao leste oscilando.',
  finance: 'Valor de apolice, custo de reparo e produtividade financeira ainda nao enviados; marcar valores financeiros como pendentes.',
  decisionGoal: 'Gerar canvas executivo para underwriting rural com riscos priorizados, premissas explicitas, lacunas, plano preventivo, valor para seguradora e criterio de sucesso.',
};

function buildSompoBriefing(fields: SompoBriefingFields): string {
  return [
    `Caso: ${fields.caseName}`,
    'Entrada de sinistros em CSV fornecida pelo briefing:',
    fields.claimsCsv.trim(),
    `Telemetria atual: ${fields.telemetry.trim()}`,
    `Dados financeiros: ${fields.finance.trim()}`,
    `Objetivo executivo: ${fields.decisionGoal.trim()}`,
    'Nao invente dados financeiros; marque como pendente quando faltar. Nao use linguagem de material ficticio.',
  ].filter(Boolean).join('\n\n');
}

export default function MissionBar() {
  const theme = useTheme();
  const {
    activeMission,
    activateMission,
    resetMission,
    backendReady,
    supervisorMode,
    database,
    state,
    missionActionBusy,
    operationError,
    clearOperationError,
    canActivateMission,
    missionLockReason,
  } = useLuca();
  const [draft, setDraft] = useState('');
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [sompoFields, setSompoFields] = useState<SompoBriefingFields>(SOMPO_BRIEFING_TEMPLATE);
  const lastDirectActionAt = useRef<Record<string, number>>({});
  useRuntimeTick(); // re-render do runtime a cada 1s

  const canActivate = draft.trim().length > 0 && canActivateMission;

  async function submit() {
    if (!canActivate) return;
    const description = draft.trim();
    const activated = await activateMission({
      title: description.slice(0, 80),
      description,
      success: description,
    });
    if (!activated) return;
    setDraft('');
    setBriefingOpen(false);
  }

  async function launchSompoCase() {
    if (!canActivateMission) return;
    setBriefingOpen(true);
    setSompoFields(SOMPO_BRIEFING_TEMPLATE);
    setDraft(buildSompoBriefing(SOMPO_BRIEFING_TEMPLATE));
  }

  function updateSompoField<K extends keyof SompoBriefingFields>(key: K, value: SompoBriefingFields[K]) {
    const next = { ...sompoFields, [key]: value };
    setSompoFields(next);
    setDraft(buildSompoBriefing(next));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  function runDirectButtonAction(event: React.SyntheticEvent<HTMLButtonElement>, key: string, action: () => void | Promise<void>) {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - (lastDirectActionAt.current[key] ?? 0) < 250) return;
    lastDirectActionAt.current[key] = now;
    void action();
  }

  function runClickButtonAction(event: React.MouseEvent<HTMLButtonElement>, key: string, action: () => void | Promise<void>) {
    event.stopPropagation();
    if (Date.now() - (lastDirectActionAt.current[key] ?? 0) < 500) return;
    void action();
  }

  function buttonActionHandlers(key: string, action: () => void | Promise<void>) {
    const direct = (event: React.SyntheticEvent<HTMLButtonElement>) => runDirectButtonAction(event, key, action);
    const click = (event: React.MouseEvent<HTMLButtonElement>) => runClickButtonAction(event, key, action);
    return {
      onPointerDownCapture: direct,
      onPointerUpCapture: direct,
      onMouseDownCapture: direct,
      onMouseUpCapture: direct,
      onTouchStartCapture: direct,
      onTouchEndCapture: direct,
      onPointerDown: direct,
      onPointerUp: direct,
      onMouseDown: direct,
      onMouseUp: direct,
      onTouchStart: direct,
      onTouchEnd: direct,
      onClick: click,
    };
  }

  const dbItems = countDatabaseItems(database);
  const runStatus = state?.activeRun?.status;
  const runSettled = ['completed', 'chat_completed', 'needs_revision', 'failed', 'cancelled'].includes(String(runStatus ?? ''));
  const missionRunning = missionActionBusy
    || ['running', 'pending', 'verifying'].includes(String(runStatus ?? ''))
    || Boolean(activeMission && !runSettled);
  const hasMissionSurface = Boolean(activeMission || state?.activeRun || state?.temporaryDashboard);
  const heartbeatModelSelector = state?.heartbeatMonitor?.modelSelector as { model?: string } | undefined;
  const activeCloudModel = heartbeatModelSelector?.model || state?.governance?.provider || 'modelo';
  const missionConcurrency = state?.governance?.missionConcurrency ?? state?.heartbeatMonitor?.governance?.missionConcurrency ?? null;
  const concurrencyMissionId = String(missionConcurrency?.latestUnmatched?.missionId || '').trim();
  const activeMissionId = String(activeMission?.id || state?.activeMission?.id || '').trim();
  const currentMissionLocked = Boolean(
    missionConcurrency?.blocked
    && missionRunning
    && concurrencyMissionId
    && activeMissionId
    && concurrencyMissionId === activeMissionId,
  );
  const governanceBlocked = Boolean(missionConcurrency?.blocked && !currentMissionLocked);
  const latestBlockedTitle = String(missionConcurrency?.latestUnmatched?.title || '').trim();
  const missionStatusText = missionActionBusy
    ? `processando missão no ${activeCloudModel}`
    : runStatus === 'pending'
      ? 'missão aceita pelo runtime'
    : runStatus === 'running'
      ? (state?.activeRun?.progressLabel || 'missão em execução')
    : runStatus === 'verifying'
      ? 'verificando fechamento'
    : runStatus === 'chat_completed'
      ? 'chat concluído'
      : runStatus === 'completed'
        ? 'missão concluída'
        : runStatus === 'needs_revision' || runStatus === 'failed'
          ? 'revisão necessária'
          : governanceBlocked
            ? `${missionConcurrency?.unmatchedCount ?? 0} missão(ões) aguardando fechamento no event stream`
          : activeMission
            ? formatMissionRuntime(activeMission.activatedAt)
            : 'pronta para nova missão';

  return (
    <div className="void-panel rounded-2xl p-3 flex flex-col gap-2">
      {briefingOpen && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          <label htmlFor="sompo-case-name" className="lg:col-span-3 text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: theme.textSoft }}>
            Caso
            <input
              id="sompo-case-name"
              aria-label="Caso"
              value={sompoFields.caseName}
              onChange={(e) => updateSompoField('caseName', e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs outline-none"
              style={{ color: theme.text, background: theme.input, border: `1px solid ${theme.border}` }}
            />
          </label>
          <label htmlFor="sompo-claims-csv" className="lg:col-span-3 text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: theme.textSoft }}>
            Sinistros CSV
            <textarea
              id="sompo-claims-csv"
              aria-label="Sinistros CSV"
              value={sompoFields.claimsCsv}
              onChange={(e) => updateSompoField('claimsCsv', e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg px-3 py-2 text-xs outline-none"
              style={{ color: theme.text, background: theme.input, border: `1px solid ${theme.border}` }}
            />
          </label>
          <label htmlFor="sompo-telemetry" className="lg:col-span-3 text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: theme.textSoft }}>
            Telemetria
            <textarea
              id="sompo-telemetry"
              aria-label="Telemetria"
              value={sompoFields.telemetry}
              onChange={(e) => updateSompoField('telemetry', e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg px-3 py-2 text-xs outline-none"
              style={{ color: theme.text, background: theme.input, border: `1px solid ${theme.border}` }}
            />
          </label>
          <label htmlFor="sompo-finance" className="lg:col-span-3 text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: theme.textSoft }}>
            Financeiro
            <textarea
              id="sompo-finance"
              aria-label="Financeiro"
              value={sompoFields.finance}
              onChange={(e) => updateSompoField('finance', e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg px-3 py-2 text-xs outline-none"
              style={{ color: theme.text, background: theme.input, border: `1px solid ${theme.border}` }}
            />
          </label>
          <label htmlFor="sompo-decision-goal" className="lg:col-span-12 text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: theme.textSoft }}>
            Objetivo de decisao
            <input
              id="sompo-decision-goal"
              aria-label="Objetivo de decisao"
              value={sompoFields.decisionGoal}
              onChange={(e) => updateSompoField('decisionGoal', e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-xs outline-none"
              style={{ color: theme.text, background: theme.input, border: `1px solid ${theme.border}` }}
            />
          </label>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 relative min-w-0">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Descreva a missão para os agentes..."
            aria-label="Descreva a missão"
            className="w-full resize-none bg-transparent outline-none text-sm leading-relaxed py-2.5 px-3 rounded-xl"
            style={{ color: theme.text, background: theme.input, border: `1px solid ${theme.border}`, minHeight: 44, maxHeight: 120 }}
          />
        </div>

        {hasMissionSurface && (
          <button className="btn-fleet flex items-center justify-center gap-2 whitespace-nowrap" {...buttonActionHandlers('reset', resetMission)} title="resetar missão" disabled={missionActionBusy}>
            <RotateCcw className="w-4 h-4" />
            Resetar
          </button>
        )}

        <motion.button
          whileTap={{ scale: 0.95 }}
          className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
          {...buttonActionHandlers('submit', submit)}
          disabled={!canActivate}
          title={!canActivate ? (missionLockReason ?? 'descreva a missão para ativar') : 'ativar missão'}
        >
          <SendHorizontal className="w-4 h-4" />
          {missionRunning ? 'Rodando' : 'Ativar'}
        </motion.button>
      </div>

      {/* status row */}
      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-[11px] min-w-0 luca-wrap" style={{ color: theme.textMute }}>
            {missionStatusText}
          </span>
          {!activeMission && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-[11px] underline-offset-2 hover:underline disabled:no-underline disabled:opacity-45"
              style={{ color: theme.gold }}
              {...buttonActionHandlers('briefing', launchSompoCase)}
              disabled={!canActivateMission}
              title={canActivateMission ? 'preencher briefing Sompo' : (missionLockReason ?? 'missão bloqueada')}
            >
              <ClipboardList className="w-3 h-3" />
              briefing Sompo
            </button>
          )}
          {briefingOpen && !activeMission && (
            <button type="button" className="inline-flex h-10 items-center rounded-md px-2 text-[11px] underline-offset-2 hover:underline" style={{ color: theme.textMute }} {...buttonActionHandlers('hide-briefing', () => setBriefingOpen(false))}>
              ocultar campos
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatePill label="online" on={backendReady} />
          <StatePill label={`db ${dbItems}`} on={dbItems > 0} color={theme.fleet} />
          <StatePill label={missionConcurrency?.blocked ? 'lock' : 'clear'} on={!governanceBlocked} color={governanceBlocked ? theme.error : currentMissionLocked ? theme.gold : theme.alive} />
          <StatePill label={supervisorMode === 'running' ? 'rodando' : 'idle'} on={supervisorMode === 'running'} color={theme.gold} />
        </div>
      </div>

      {governanceBlocked && (
        <div
          className="rounded-xl px-3 py-2 text-[11px]"
          style={{ color: theme.error, background: theme.input, border: `1px solid ${theme.error}` }}
        >
          Lock operacional ativo pelo event stream.
          {missionLockReason ? ` ${missionLockReason}.` : latestBlockedTitle ? ` Última missão sem fechamento: ${latestBlockedTitle}.` : ''}
          {' '}Verifique `/api/events` antes de iniciar outra missão live.
        </div>
      )}

      {operationError && (
        <div
          className="rounded-xl px-3 py-2 text-[11px] flex items-center justify-between gap-3"
          style={{ color: theme.error, background: theme.errorBg, border: `1px solid ${theme.error}` }}
        >
          <span>{operationError}</span>
          <button
            type="button"
            className="underline-offset-2 hover:underline shrink-0"
            {...buttonActionHandlers('clear-operation-error', clearOperationError)}
            style={{ color: theme.error }}
          >
            dispensar
          </button>
        </div>
      )}
    </div>
  );
}
