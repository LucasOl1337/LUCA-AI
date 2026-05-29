import { useState } from 'react';
import { motion } from 'framer-motion';
import { SendHorizontal, RotateCcw } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { formatMissionRuntime } from '@/lib/format';
import { useRuntimeTick } from '@/hooks/useLucaState';
import StatePill from './StatePill';
import { countDatabaseItems } from '@/lib/database';

export default function MissionBar() {
  const theme = useTheme();
  const { activeMission, activateMission, resetMission, backendReady, supervisorMode, database } = useLuca();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  useRuntimeTick(); // re-render do runtime a cada 1s

  const canActivate = draft.trim().length > 0 && !busy;

  async function submit() {
    if (!canActivate) return;
    setBusy(true);
    try {
      const description = draft.trim();
      await activateMission({
        title: description.slice(0, 80),
        description,
        success: description,
      });
      setDraft('');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  const dbItems = countDatabaseItems(database);

  return (
    <div className="void-panel rounded-2xl p-3 flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
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

        {activeMission && (
          <button className="btn-fleet flex items-center gap-2" onClick={resetMission} title="resetar missão">
            <RotateCcw className="w-4 h-4" />
            Resetar
          </button>
        )}

        <motion.button
          whileTap={{ scale: 0.95 }}
          className="btn-primary flex items-center gap-2"
          onClick={submit}
          disabled={!canActivate}
          title="ativar missão"
        >
          <SendHorizontal className="w-4 h-4" />
          Ativar
        </motion.button>
      </div>

      {/* status row */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px]" style={{ color: theme.textMute }}>
          {activeMission ? formatMissionRuntime(activeMission.activatedAt) : 'pronta para nova missão'}
        </span>
        <div className="flex items-center gap-2">
          <StatePill label="online" on={backendReady} />
          <StatePill label={`db ${dbItems}`} on={dbItems > 0} color={theme.fleet} />
          <StatePill label={supervisorMode === 'running' ? 'rodando' : 'idle'} on={supervisorMode === 'running'} color={theme.gold} />
        </div>
      </div>
    </div>
  );
}
