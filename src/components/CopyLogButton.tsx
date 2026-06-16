import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyLogButtonProps {
  text: string;
  label?: string;
}

export default function CopyLogButton({ text, label = 'copiar log' }: CopyLogButtonProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastDirectCopyAt = useRef(0);

  function copyWithTextarea(value: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
    return ok;
  }

  async function copyLog(event: React.SyntheticEvent) {
    event.stopPropagation();
    const value = String(text ?? '').trim();
    if (!value) return;

    let ok = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        ok = true;
      } catch {
        ok = false;
      }
    }

    if (!ok) ok = copyWithTextarea(value);

    if (ok) {
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } else {
      setCopied(false);
      setFailed(true);
      setTimeout(() => setFailed(false), 1800);
    }
  }

  function copyFromDirect(event: React.SyntheticEvent<HTMLButtonElement>) {
    event.preventDefault();
    const now = Date.now();
    if (now - lastDirectCopyAt.current < 250) return;
    lastDirectCopyAt.current = now;
    void copyLog(event);
  }

  function copyFromClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (Date.now() - lastDirectCopyAt.current < 500) {
      event.stopPropagation();
      return;
    }
    void copyLog(event);
  }

  return (
    <button
      type="button"
      onPointerDownCapture={copyFromDirect}
      onPointerUpCapture={copyFromDirect}
      onMouseDownCapture={copyFromDirect}
      onMouseUpCapture={copyFromDirect}
      onTouchStartCapture={copyFromDirect}
      onTouchEndCapture={copyFromDirect}
      onPointerDown={copyFromDirect}
      onPointerUp={copyFromDirect}
      onMouseDown={copyFromDirect}
      onMouseUp={copyFromDirect}
      onTouchStart={copyFromDirect}
      onTouchEnd={copyFromDirect}
      onClick={copyFromClick}
      title={label}
      aria-label={label}
      className="inline-flex h-10 items-center gap-1.5 px-3 rounded-md text-[10px] font-medium tracking-wide uppercase transition-all duration-200"
      style={{ color: copied ? 'var(--l-alive)' : failed ? 'var(--l-error)' : 'var(--l-text-mute)', border: '1px solid var(--l-border)' }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'copiado' : failed ? 'falhou' : 'copiar'}
    </button>
  );
}
