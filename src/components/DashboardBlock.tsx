import { useTheme } from '@/hooks/useTheme';
import type { DashboardBlockData } from '@/lib/types';
import { formatTopicLabel, normalizeChartItems, pieGradient } from '@/lib/canvas';

/** Bloco de visualização do canvas — porta de main.jsx:778. */
export default function DashboardBlock({ block }: { block: DashboardBlockData }) {
  const theme = useTheme();
  const items = Array.isArray(block.items) ? block.items.slice(0, 6) : [];
  const chartItems = normalizeChartItems(items);

  if (block.type === 'pie') {
    return (
      <article className="void-panel rounded-xl p-4">
        <h3 className="text-xs font-semibold tracking-wide uppercase mb-3" style={{ color: theme.textSoft }}>
          {block.title ?? 'distribuição'}
        </h3>
        <div
          className="w-28 h-28 mx-auto rounded-full"
          style={{ background: `conic-gradient(${pieGradient(chartItems)})`, boxShadow: 'inset 0 0 0 6px var(--l-void-2)' }}
          aria-label="gráfico de pizza"
        />
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 justify-center">
          {chartItems.map((item) => (
            <span key={item.label} className="text-[10px]" style={{ color: theme.textMute }}>
              {item.label} <b style={{ color: theme.text }}>{item.value}</b>
            </span>
          ))}
        </div>
      </article>
    );
  }

  if (block.type === 'tower') {
    const maxValue = Math.max(...chartItems.map((i) => i.value), 1);
    return (
      <article className="void-panel rounded-xl p-4">
        <h3 className="text-xs font-semibold tracking-wide uppercase mb-3" style={{ color: theme.textSoft }}>
          {block.title ?? 'torre'}
        </h3>
        <div className="space-y-2">
          {chartItems.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="text-[10px] w-20 truncate" style={{ color: theme.textMute }}>{item.label}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: theme.input }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(8, (item.value / maxValue) * 100)}%`, background: `linear-gradient(90deg, ${theme.fleet}, ${theme.gold})` }}
                />
              </div>
              <strong className="text-[10px] w-6 text-right" style={{ color: theme.text }}>{item.value}</strong>
            </div>
          ))}
        </div>
      </article>
    );
  }

  if (block.type === 'topics') {
    return (
      <article className="void-panel rounded-xl p-4">
        <h3 className="text-xs font-semibold tracking-wide uppercase mb-3" style={{ color: theme.textSoft }}>
          {block.title ?? 'tópicos'}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-1 rounded-full"
              style={{ background: theme.goldSoft, color: theme.gold, border: `1px solid ${theme.border}` }}
            >
              {formatTopicLabel(item)}
            </span>
          ))}
        </div>
      </article>
    );
  }

  // metric / note / default
  return (
    <article className="void-panel rounded-xl p-4">
      <h3 className="text-xs font-semibold tracking-wide uppercase mb-2" style={{ color: theme.textSoft }}>
        {block.title ?? block.type ?? 'bloco'}
      </h3>
      {block.value !== undefined && (
        <strong className="block text-2xl font-display font-bold mb-1" style={{ color: theme.text }}>
          {block.value}
        </strong>
      )}
      {block.body && <p className="text-xs leading-relaxed" style={{ color: theme.textMute }}>{block.body}</p>}
      {items.length > 0 && (
        <ul className="mt-2 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-xs flex gap-2" style={{ color: theme.textSoft }}>
              <span style={{ color: theme.gold }}>•</span>
              {formatTopicLabel(item)}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
