import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyLogButtonProps {
  text: string;
  label?: string;
}

export default function CopyLogButton({ text, label = 'copiar log' }: CopyLogButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyLog(event: React.MouseEvent) {
    event.stopPropagation();
    const value = String(text ?? '').trim();
    if (!value) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // best-effort
    }
  }

  return (
    <button
      type="button"
      onClick={copyLog}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium tracking-wide uppercase transition-all duration-200"
      style={{ color: copied ? 'var(--l-alive)' : 'var(--l-text-mute)', border: '1px solid var(--l-border)' }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'copiado' : 'copiar'}
    </button>
  );
}
