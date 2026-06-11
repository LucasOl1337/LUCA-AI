import { ClipboardCheck, Download, Eye, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { buildReportFilename, buildReportText, downloadTextReport, type ReportContext } from '@/lib/canvas';
import type { Mission, TemporaryDashboard } from '@/lib/types';

interface ReportModalProps {
  dashboard: TemporaryDashboard;
  mission?: Mission | null;
  reportContext?: ReportContext;
  buttonClassName?: string;
  compact?: boolean;
}

export default function ReportModal({ dashboard, mission, reportContext, buttonClassName = '', compact = false }: ReportModalProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const markdown = useMemo(() => buildReportText(dashboard, mission, reportContext), [dashboard, mission, reportContext]);
  const filename = useMemo(() => buildReportFilename(dashboard, mission), [dashboard, mission]);

  async function copyReport() {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  function downloadReport() {
    downloadTextReport(markdown, filename);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName || 'btn-fleet !px-3 !py-1.5 text-[10px] flex items-center gap-1.5'}
        title="ver relatório executivo"
      >
        <Eye className="w-3.5 h-3.5" />
        {compact ? 'Relatório' : 'Ver relatório'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(9, 18, 14, 0.55)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Relatório executivo da missão"
        >
          <div
            className="void-panel rounded-2xl w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden"
            style={{ borderColor: theme.borderHover }}
          >
            <header className="flex items-center gap-2 px-5 h-14 border-b shrink-0" style={{ borderColor: theme.border }}>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: theme.gold }}>
                  relatório executivo
                </p>
                <h2 className="void-title text-base truncate">
                  {dashboard.title || mission?.title || 'Relatório da missão'}
                </h2>
              </div>
              <button type="button" onClick={copyReport} className="btn-fleet !px-3 !py-1.5 text-[10px] flex items-center gap-1.5">
                <ClipboardCheck className="w-3.5 h-3.5" />
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <button type="button" onClick={downloadReport} className="btn-fleet !px-3 !py-1.5 text-[10px] flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Baixar
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-fleet !p-2" title="fechar relatório">
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              <pre
                className="whitespace-pre-wrap break-words text-sm leading-relaxed font-sans"
                style={{ color: theme.text, background: theme.input, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 16 }}
              >
                {markdown}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
