import { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import { chatAccent } from '@/lib/agents';
import { formatChatParagraphs, formatGlobalChatLog } from '@/lib/format';
import CopyLogButton from './CopyLogButton';

export default function GlobalChat() {
  const theme = useTheme();
  const { globalChatMessages, backendReady, runtimeMode } = useLuca();
  const cloudRuntime = runtimeMode === 'cloud';
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [globalChatMessages]);

  return (
    <div className="void-panel rounded-2xl flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-2 px-4 h-12 border-b shrink-0 min-w-0" style={{ borderColor: theme.border }}>
        <MessageSquare className="w-4 h-4" style={{ color: theme.gold, opacity: 0.8 }} />
        <h3 className="text-[11px] font-semibold tracking-[0.2em] uppercase flex-1 min-w-0 luca-wrap" style={{ color: theme.textSoft }}>
          Comunicação
        </h3>
        <span
          className="text-[9px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full"
          style={{ color: backendReady || cloudRuntime ? theme.alive : theme.error, border: `1px solid ${theme.border}` }}
        >
          {cloudRuntime ? 'glm' : backendReady ? 'ao vivo' : 'offline'}
        </span>
        <CopyLogButton text={formatGlobalChatLog(globalChatMessages)} label="copiar log do chat" />
      </header>

      <div ref={streamRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {globalChatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <MessageSquare className="w-8 h-8 mb-3" style={{ color: theme.textGhost }} />
            <p className="text-xs leading-relaxed" style={{ color: theme.textMute }}>
              As mensagens dos agentes aparecerão aqui.
            </p>
          </div>
        ) : (
          globalChatMessages.map((message, index) => {
            const accent = chatAccent(message.agentName);
            const fromRight = index % 2 === 1;
            return (
              <motion.article
                key={message.id}
                initial={{ opacity: 0, x: fromRight ? 10 : -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="rounded-xl p-3 min-w-0"
                style={{
                  background: theme.input,
                  border: `1px solid ${theme.border}`,
                  borderLeft: `2px solid ${accent}`,
                }}
              >
                <div className="flex items-start gap-2 mb-1 min-w-0">
                  <strong className="text-[11px] font-semibold min-w-0 luca-wrap" style={{ color: accent }}>
                    {message.agentName}
                  </strong>
                  <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0" style={{ color: theme.textMute, background: 'rgba(127,179,213,0.06)' }}>
                    {message.type}
                  </span>
                  <time className="text-[9px] ml-auto font-mono shrink-0" style={{ color: theme.textGhost }}>
                    {message.timestamp}
                  </time>
                </div>
                <div className="space-y-1">
                  {formatChatParagraphs(message.content).map((p, i) => (
                    <p key={`${p}-${i}`} className="text-xs leading-relaxed luca-wrap" style={{ color: theme.textSoft }}>
                      {p}
                    </p>
                  ))}
                </div>
              </motion.article>
            );
          })
        )}
      </div>
    </div>
  );
}
