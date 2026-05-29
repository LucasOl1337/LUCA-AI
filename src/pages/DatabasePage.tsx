import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLuca } from '@/hooks/useLucaState';
import {
  getDatabaseLayers,
  getLayerLinks,
  getLayerObsidianPage,
  getPublicRecordSections,
  obsidianUrl,
  renderPayloadValue,
  summarizeDatabaseItem,
  databaseObsidianPages,
  type DatabaseLayer,
} from '@/lib/database';
import { friendlyStatus } from '@/lib/format';
import type { DatabaseItem } from '@/lib/types';

export default function DatabasePage() {
  const theme = useTheme();
  const { database } = useLuca();
  const layers = getDatabaseLayers(database);
  const [activeLayerId, setActiveLayerId] = useState<DatabaseLayer['id']>('dashboardIntegration');
  const [activeItemKey, setActiveItemKey] = useState<string | null>(null);

  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? layers[0];
  const activeItem: DatabaseItem | null =
    activeLayer.items.find((i) => (i.id ?? i.label) === activeItemKey) ?? activeLayer.items[0] ?? null;
  const layerLinks = getLayerLinks(database, activeLayer);
  const publicSections = activeLayer.id === 'dashboardIntegration' ? getPublicRecordSections(activeItem) : [];
  const payloadEntries =
    activeItem?.payload && typeof activeItem.payload === 'object' ? Object.entries(activeItem.payload) : [];

  function selectLayer(id: DatabaseLayer['id']) {
    setActiveLayerId(id);
    setActiveItemKey(null);
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-[1200px] mx-auto">
        <header className="flex items-end justify-between mb-6">
          <div>
            <h1 className="void-title text-3xl">Database</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMute }}>
              {database.source?.name ?? 'luca-operational-database'}
            </p>
          </div>
          <a
            href={obsidianUrl(databaseObsidianPages.index)}
            className="btn-fleet flex items-center gap-2 !text-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" /> índice obsidian
          </a>
        </header>

        {/* tabs das camadas */}
        <div className="flex gap-2 mb-6">
          {layers.map((layer) => (
            <button
              key={layer.id}
              onClick={() => selectLayer(layer.id)}
              className={`void-panel rounded-xl px-4 py-3 flex-1 text-left transition-all ${
                activeLayer.id === layer.id ? '!border-[var(--l-border-active)]' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono" style={{ color: theme.textGhost }}>{layer.index}</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: theme.goldSoft, color: theme.gold }}
                >
                  {layer.items.length}
                </span>
              </div>
              <strong
                className="block text-sm font-display font-semibold mt-1"
                style={{ color: activeLayer.id === layer.id ? theme.gold : theme.text }}
              >
                {layer.title}
              </strong>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* aside da camada */}
          <aside className="col-span-12 md:col-span-4">
            <div className="void-panel rounded-2xl p-5">
              <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: theme.gold }}>
                camada {activeLayer.index}
              </span>
              <h3 className="void-title text-lg mt-1">{activeLayer.title}</h3>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: theme.textMute }}>{activeLayer.rule}</p>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="rounded-lg p-2" style={{ background: theme.input }}>
                  <strong className="block text-sm" style={{ color: theme.text }}>{friendlyStatus(activeLayer.status)}</strong>
                  <small style={{ color: theme.textGhost }}>status</small>
                </div>
                <div className="rounded-lg p-2" style={{ background: theme.input }}>
                  <strong className="block text-xs" style={{ color: theme.text }}>{activeLayer.visibility}</strong>
                  <small style={{ color: theme.textGhost }}>visibilidade</small>
                </div>
              </div>

              <a
                href={obsidianUrl(getLayerObsidianPage(activeLayer.id))}
                className="btn-fleet w-full mt-4 flex items-center justify-center gap-2 !text-xs"
              >
                abrir no obsidian
              </a>

              {layerLinks.length > 0 && (
                <div className="mt-4">
                  <strong className="text-[10px] uppercase tracking-wide" style={{ color: theme.textSoft }}>index de links</strong>
                  <div className="mt-2 space-y-1">
                    {layerLinks.slice(0, 8).map((link) => (
                      <a
                        key={`${link.label}-${link.url}`}
                        href={link.url?.startsWith('http') ? link.url : obsidianUrl(getLayerObsidianPage(activeLayer.id))}
                        target={link.url?.startsWith('http') ? '_blank' : undefined}
                        rel="noreferrer"
                        className="block text-xs truncate hover:underline"
                        style={{ color: theme.fleet }}
                        title={link.detail}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* itens + detalhe */}
          <section className="col-span-12 md:col-span-8 space-y-3">
            {activeLayer.items.length > 0 ? (
              activeLayer.items.map((item) => {
                const summary = summarizeDatabaseItem(item);
                const selected = activeItem === item;
                return (
                  <article
                    key={summary.id}
                    className={`void-panel rounded-xl p-4 cursor-pointer ${selected ? '!border-[var(--l-border-active)]' : ''}`}
                    onClick={() => setActiveItemKey(summary.id)}
                  >
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: theme.gold }}>{summary.type}</span>
                    <h4 className="text-sm font-semibold mt-1" style={{ color: theme.text }}>{summary.label}</h4>
                    <p className="text-xs mt-1" style={{ color: theme.textMute }}>{summary.detail}</p>
                  </article>
                );
              })
            ) : (
              <div className="void-panel rounded-xl p-8 text-center">
                <h4 className="text-sm font-semibold" style={{ color: theme.textSoft }}>camada vazia</h4>
                <p className="text-xs mt-1" style={{ color: theme.textMute }}>aguardando preenchimento</p>
              </div>
            )}

            {activeItem && (
              <article className="void-panel rounded-xl p-5" style={{ background: theme.goldSoft }}>
                <span className="text-[10px] uppercase tracking-wide" style={{ color: theme.gold }}>registro aberto</span>
                <h4 className="text-base font-display font-semibold mt-1" style={{ color: theme.text }}>
                  {activeItem.label ?? activeItem.title ?? activeItem.id}
                </h4>
                <p className="text-xs mt-1" style={{ color: theme.textMute }}>
                  {friendlyStatus(activeItem.status ?? activeItem.type ?? 'registro coletado')}
                </p>

                {publicSections.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {publicSections.map((section) => (
                      <div key={section.key}>
                        <strong className="text-[11px] uppercase tracking-wide" style={{ color: theme.textSoft }}>{section.label}</strong>
                        {Array.isArray(section.value) ? (
                          <ul className="mt-1 space-y-1">
                            {section.value.map((v, i) => (
                              <li key={i} className="text-xs flex gap-2" style={{ color: theme.textSoft }}>
                                <span style={{ color: theme.gold }}>•</span>{v}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs mt-1 leading-relaxed" style={{ color: theme.textSoft }}>{section.value}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : payloadEntries.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {payloadEntries.slice(0, 8).map(([key, value]) => (
                      <div key={key} className="rounded-lg p-2" style={{ background: theme.input }}>
                        <strong className="block text-[10px] uppercase" style={{ color: theme.textMute }}>{key}</strong>
                        <small className="text-xs" style={{ color: theme.textSoft }}>{renderPayloadValue(value)}</small>
                      </div>
                    ))}
                  </div>
                ) : null}

                <a
                  href={obsidianUrl(getLayerObsidianPage(activeLayer.id))}
                  className="inline-flex items-center gap-1.5 text-xs mt-4 hover:underline"
                  style={{ color: theme.fleet }}
                >
                  <ExternalLink className="w-3 h-3" /> abrir página relacionada
                </a>
              </article>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
