import { ClipboardCheck, Download, Eye, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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

  const modal = open ? (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto px-3 py-4 sm:items-center sm:p-6"
      style={{ background: 'rgba(9, 18, 14, 0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mission-report-title"
    >
      <div
        className="void-panel w-full max-w-4xl max-h-[calc(100dvh-2rem)] rounded-xl flex flex-col overflow-hidden sm:max-h-[calc(100dvh-3rem)]"
        style={{ borderColor: theme.borderHover }}
      >
        <header className="flex flex-col gap-3 px-4 py-3 border-b shrink-0 sm:flex-row sm:items-center sm:px-5" style={{ borderColor: theme.border }}>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: theme.gold }}>
              relatório executivo
            </p>
            <h2 id="mission-report-title" className="void-title text-base leading-snug luca-wrap">
              {dashboard.title || mission?.title || 'Relatório da missão'}
            </h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button type="button" onClick={copyReport} className="btn-fleet !px-3 !py-1.5 text-[10px] flex items-center gap-1.5 whitespace-nowrap">
              <ClipboardCheck className="w-3.5 h-3.5" />
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button type="button" onClick={downloadReport} className="btn-fleet !px-3 !py-1.5 text-[10px] flex items-center gap-1.5 whitespace-nowrap">
              <Download className="w-3.5 h-3.5" />
              Baixar
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-fleet !p-2" title="fechar relatório" aria-label="fechar relatório">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
          <pre
            className="luca-pre m-0 max-w-full overflow-x-hidden text-sm leading-relaxed font-sans"
            style={{ color: theme.text, background: theme.input, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16 }}
          >
            {markdown}
          </pre>
        </div>
      </div>
    </div>
  ) : null;

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

      {modal && (typeof document === 'undefined' ? modal : createPortal(modal, document.body))}
    </>
  );
}
