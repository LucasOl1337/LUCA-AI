import { useTheme } from '@/hooks/useTheme';
import { inlineTextParts, parseMessageBlocks } from './message-format';

export function RichMessageBody({ content, compact = false }: { content: string; compact?: boolean }) {
  const theme = useTheme();
  const blocks = parseMessageBlocks(content);

  return (
    <div
      className={`luca-ai-prose luca-wrap ${compact ? 'text-[13px]' : ''}`}
      style={{ color: theme.textSoft }}
    >
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const headingClass = block.level <= 1
            ? 'text-[15px] font-semibold tracking-[-0.02em]'
            : block.level === 2
              ? 'text-[14.5px] font-semibold tracking-[-0.015em]'
              : 'text-[13.5px] font-semibold';
          return (
            <h4 key={`${block.kind}-${index}`} className={`${headingClass} leading-snug luca-wrap`} style={{ color: theme.text }}>
              <InlineText value={block.label} />
            </h4>
          );
        }

        if (block.kind === 'table') {
          return (
            <div key={`${block.kind}-${index}`} className="max-w-full overflow-x-auto rounded-xl border" style={{ borderColor: theme.border }}>
              <table className="w-full min-w-[min(100%,480px)] border-collapse text-left text-xs sm:text-sm">
                <thead style={{ background: theme.surfaceHi }}>
                  <tr>{block.headers.map((header, cellIndex) => <th key={`${header}-${cellIndex}`} className="border-b px-3 py-2.5 font-semibold luca-wrap sm:px-4 sm:py-3" style={{ borderColor: theme.border, color: theme.text }}><InlineText value={header} /></th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`} className="border-b last:border-b-0" style={{ borderColor: theme.border }}>
                      {block.headers.map((_, cellIndex) => <td key={`cell-${cellIndex}`} className="px-3 py-2.5 align-top luca-wrap sm:px-4 sm:py-3"><InlineText value={row[cellIndex] || '-'} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.kind === 'code') {
          return (
            <div key={`${block.kind}-${index}`} className="max-w-full overflow-hidden rounded-xl border" style={{ borderColor: theme.border, background: theme.console }}>
              {block.language && <div className="border-b px-4 py-2 font-mono text-[10px] uppercase tracking-wider" style={{ borderColor: theme.border, color: theme.textGhost }}>{block.language}</div>}
              <pre className="luca-pre overflow-x-auto p-4 font-mono text-xs leading-relaxed" style={{ color: theme.consoleText }}><code>{block.body}</code></pre>
            </div>
          );
        }

        if (block.kind === 'image') {
          return (
            <figure key={`${block.kind}-${index}`} className="max-w-full overflow-hidden rounded-xl border" style={{ borderColor: theme.border, background: theme.input }}>
              <img src={block.src} alt={block.alt} className="max-h-[680px] w-full object-contain" />
              {block.alt && <figcaption className="border-t px-4 py-2 text-xs luca-wrap" style={{ borderColor: theme.border, color: theme.textMute }}>{block.alt}</figcaption>}
            </figure>
          );
        }

        if (block.kind === 'bullet') {
          return (
            <div key={`${block.kind}-${index}`} className="luca-ai-bullet">
              <span className="luca-ai-bullet-dot" style={{ background: theme.textMute }} />
              <div className="min-w-0 flex-1">
                {block.label && (
                  <span className="font-semibold luca-wrap" style={{ color: theme.text }}>
                    <InlineText value={block.label} />
                    {block.body ? ': ' : ''}
                  </span>
                )}
                {block.body ? (
                  <span className="luca-wrap">
                    <InlineText value={block.body} />
                  </span>
                ) : null}
              </div>
            </div>
          );
        }

        return (
          <p key={`${block.kind}-${index}`} className="luca-wrap">
            {block.label && (
              <span className="font-semibold" style={{ color: theme.text }}>
                <InlineText value={block.label} />
                {' '}
              </span>
            )}
            <InlineText value={block.body} />
          </p>
        );
      })}
    </div>
  );
}

function InlineText({ value }: { value: string }) {
  const theme = useTheme();
  return (
    <>
      {inlineTextParts(value).map((part, index) => (
        part.strong ? (
          <strong key={`${part.text}-${index}`} style={{ color: theme.text }}>
            {part.text}
          </strong>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        )
      ))}
    </>
  );
}
