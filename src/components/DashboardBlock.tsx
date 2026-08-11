import { useTheme } from '@/hooks/useTheme';
import type { DashboardBlockData } from '@/lib/types';
import { formatTopicLabel, normalizeChartItems, pieGradient } from '@/lib/canvas';

/** Bloco de visualização do canvas — porta de main.jsx:778. */
export default function DashboardBlock({ block }: { block: DashboardBlockData }) {
  const theme = useTheme();
  const items = Array.isArray(block.items) ? block.items.slice(0, 8) : [];
  const chartItems = normalizeChartItems(items);

  if (block.type === 'pie') {
    return (
      <article className="void-panel rounded-xl p-4 min-w-0">
        <h3 className="text-xs font-semibold tracking-wide uppercase mb-3 luca-wrap" style={{ color: theme.textSoft }}>
          {block.title ?? 'distribuição'}
        </h3>
        <div
          className="w-28 h-28 mx-auto rounded-full"
          style={{ background: `conic-gradient(${pieGradient(chartItems)})`, boxShadow: 'inset 0 0 0 6px var(--l-void-2)' }}
          aria-label="gráfico de pizza"
        />
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 justify-center">
          {chartItems.map((item) => (
            <span key={item.label} className="text-[10px] max-w-full luca-wrap" style={{ color: theme.textMute }}>
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
      <article className="void-panel rounded-xl p-4 min-w-0">
        <h3 className="text-xs font-semibold tracking-wide uppercase mb-3 luca-wrap" style={{ color: theme.textSoft }}>
          {block.title ?? 'torre'}
        </h3>
        <div className="space-y-2">
          {chartItems.map((item) => (
            <div key={item.label} className="grid grid-cols-[minmax(5.5rem,8rem)_minmax(0,1fr)_2rem] items-center gap-2">
              <span className="text-[10px] leading-tight luca-wrap" style={{ color: theme.textMute }}>{item.label}</span>
              <div className="h-2 rounded-full overflow-hidden min-w-0" style={{ background: theme.input }}>
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

  if (block.type === 'line') {
    const maxValue = Math.max(...chartItems.map((i) => i.value), 1);
    const minValue = Math.min(...chartItems.map((i) => i.value), 0);
    const span = Math.max(maxValue - minValue, 1);
    const width = 100;
    const height = 42;
    const padX = 4;
    const padY = 6;
    const stepX = chartItems.length > 1 ? (width - padX * 2) / (chartItems.length - 1) : 0;
    const points = chartItems.map((item, index) => ({
      x: padX + index * stepX,
      y: height - padY - ((item.value - minValue) / span) * (height - padY * 2),
      item,
    }));
    const polyline = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const area = `${padX},${height - padY} ${polyline} ${(padX + (chartItems.length - 1) * stepX).toFixed(2)},${height - padY}`;
    return (
      <article className="void-panel rounded-xl p-4 min-w-0">
        <h3 className="text-xs font-semibold tracking-wide uppercase mb-3 luca-wrap" style={{ color: theme.textSoft }}>
          {block.title ?? 'evolução'}
        </h3>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="gráfico de linha" preserveAspectRatio="none">
          <defs>
            <linearGradient id="luca-line-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.gold} stopOpacity="0.28" />
              <stop offset="100%" stopColor={theme.gold} stopOpacity="0" />
            </linearGradient>
          </defs>
          {chartItems.length > 1 && <polygon points={area} fill="url(#luca-line-fill)" />}
          <polyline
            points={polyline}
            fill="none"
            stroke={theme.gold}
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {points.map((p) => (
            <circle key={p.item.label} cx={p.x} cy={p.y} r="1.7" fill={theme.fleet} stroke={theme.gold} strokeWidth="0.7" />
          ))}
        </svg>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 justify-center">
          {chartItems.map((item) => (
            <span key={item.label} className="text-[10px] max-w-full luca-wrap" style={{ color: theme.textMute }}>
              {item.label} <b style={{ color: theme.text }}>{item.value}</b>
            </span>
          ))}
        </div>
      </article>
    );
  }

  if (block.type === 'topics') {
    return (
      <article className="void-panel rounded-xl p-4 min-w-0">
        <h3 className="text-xs font-semibold tracking-wide uppercase mb-3 luca-wrap" style={{ color: theme.textSoft }}>
          {block.title ?? 'tópicos'}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className="max-w-full rounded-lg px-2 py-1 text-[10px] leading-snug luca-wrap"
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
    <article className="void-panel rounded-xl p-4 min-w-0">
      <h3 className="text-xs font-semibold tracking-wide uppercase mb-2 luca-wrap" style={{ color: theme.textSoft }}>
        {block.title ?? block.type ?? 'bloco'}
      </h3>
      {block.value !== undefined && (
        <strong className="block text-2xl font-display font-bold mb-1 luca-wrap" style={{ color: theme.text }}>
          {block.value}
        </strong>
      )}
      {block.body && <p className="text-xs leading-relaxed luca-wrap" style={{ color: theme.textMute }}>{block.body}</p>}
      {items.length > 0 && (
        <ul className="mt-2 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-xs flex gap-2 min-w-0" style={{ color: theme.textSoft }}>
              <span style={{ color: theme.gold }}>•</span>
              <span className="min-w-0 flex-1 luca-wrap">{formatTopicLabel(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
