import { useRef, useState } from 'react';
import { Box, Camera, Check, Download, FolderOpen, Palette, Save, SlidersHorizontal, Truck, Upload, Wheat } from 'lucide-react';
import { downloadSompoFile, parseSompoStudioConfig, saveSompoStudioConfig, SOMPO_STUDIO_DEFAULT, type SompoStudioConfig } from './sompoStudioConfig';
import './sompo-studio.css';

const LIBRARY_KEY = 'luca:sompo-studio-library:v1';
const assets = [
  { id: 'modular', title: 'Caminhão modular', subtitle: 'Pintura, peças e animação', icon: Truck },
  { id: 'generated', title: 'Caminhão reconstruído', subtitle: 'Biblioteca original', icon: Box },
  { id: 'tractor', title: 'Trator agrícola', subtitle: 'Talhão e solo úmido', icon: Truck },
  { id: 'harvester', title: 'Colheitadeira', subtitle: 'Lavoura e corte visual', icon: Wheat },
] as const;
export type SompoStudioAsset = typeof assets[number]['id'];
function readLibrary(): SompoStudioConfig[] {
  try { const data: unknown = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'); return Array.isArray(data) ? data.slice(0, 20).map(parseSompoStudioConfig) : []; }
  catch { return []; }
}

export default function SompoStudio({ config, onChange, asset, onAsset, onSnapshot, onExportModel }: {
  config: SompoStudioConfig;
  onChange: (config: SompoStudioConfig) => void;
  asset: SompoStudioAsset;
  onAsset: (asset: SompoStudioAsset) => void;
  onSnapshot: () => void;
  onExportModel: () => Promise<void>;
}) {
  const [tab, setTab] = useState<'scene' | 'materials' | 'library'>('scene');
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const [library, setLibrary] = useState(readLibrary);
  const input = useRef<HTMLInputElement>(null);
  const set = <K extends keyof SompoStudioConfig>(key: K, value: SompoStudioConfig[K]) => { onChange({ ...config, [key]: value }); setMessage(''); };
  function apply(value: SompoStudioConfig) { onChange(value); onAsset(value.equipment); }
  function save() {
    try {
      const next = [config, ...library.filter(item => item.name !== config.name)].slice(0, 20);
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(next)); saveSompoStudioConfig(config); setLibrary(next); setMessage('Variação salva neste navegador.');
    } catch { setMessage('Não foi possível salvar. Exporte o preset para guardar sua variação.'); }
  }
  return <aside className="sompo-studio" aria-label="Oficina 3D">
    <div className="sompo-studio-heading"><span>OFICINA 3D</span><h3>Uma frota, suas variações.</h3><p>Edite na cena. Guarde o preset ou leve o modelo para outra ferramenta 3D.</p></div>
    <div className="sompo-studio-tabs" aria-label="Ferramentas da oficina">
      <button type="button" aria-pressed={tab === 'scene'} onClick={() => setTab('scene')}><SlidersHorizontal />Cena</button>
      <button type="button" aria-pressed={tab === 'materials'} onClick={() => setTab('materials')}><Palette />Materiais</button>
      <button type="button" aria-pressed={tab === 'library'} onClick={() => setTab('library')}><FolderOpen />Biblioteca</button>
    </div>
    {tab === 'scene' && <div className="sompo-studio-panel">
      <fieldset><legend>Equipamento</legend><div className="sompo-studio-assets">{assets.map(item => <button type="button" key={item.id} aria-pressed={asset === item.id} onClick={() => onAsset(item.id)}><item.icon /><span><strong>{item.title}</strong><small>{item.subtitle}</small></span>{asset === item.id && <Check />}</button>)}</div></fieldset>
      <fieldset><legend>Luz e atmosfera</legend><div className="sompo-studio-lighting">{(['day', 'golden', 'overcast'] as const).map((mode, index) => <button type="button" key={mode} data-light={mode} aria-pressed={config.lighting === mode} onClick={() => set('lighting', mode)}><span />{['Dia', 'Fim de tarde', 'Nublado'][index]}</button>)}</div></fieldset>
      <label className="sompo-studio-range">Exposição <output>{config.exposure.toFixed(2)}</output><input aria-label="Exposição da cena" type="range" min="0.65" max="1.4" step="0.05" value={config.exposure} onChange={event => set('exposure', Number(event.target.value))} /></label>
      <label className="sompo-studio-range">Vento na vegetação <output>{config.wind.toFixed(1)}</output><input aria-label="Vento na vegetação" type="range" min="0" max="2" step="0.1" value={config.wind} onChange={event => set('wind', Number(event.target.value))} /></label>
      <p className="sompo-studio-note">Cenários de chuva e operação noturna preservam suas condições. Use o botão de reprodução para observar o vento e o movimento.</p>
    </div>}
    {tab === 'materials' && <div className="sompo-studio-panel">
      {asset === 'modular' ? <>
        <fieldset><legend>Pintura da frota</legend><div className="sompo-studio-colors"><label><input type="color" aria-label="Cor da cabine" value={config.paint} onChange={event => set('paint', event.target.value)} /><span>Cabine<small>{config.paint.toUpperCase()}</small></span></label><label><input type="color" aria-label="Cor do baú" value={config.cargo} onChange={event => set('cargo', event.target.value)} /><span>Baú<small>{config.cargo.toUpperCase()}</small></span></label></div></fieldset>
        <label className="sompo-studio-range">Acabamento da pintura <output>{config.roughness < .4 ? 'Polido' : config.roughness < .7 ? 'Acetinado' : 'Fosco'}</output><input aria-label="Rugosidade da pintura" type="range" min="0.2" max="1" step="0.05" value={config.roughness} onChange={event => set('roughness', Number(event.target.value))} /></label>
        <label className="sompo-studio-range">Separar as peças <output>{Math.round(config.exploded * 100)}%</output><input aria-label="Separar peças do caminhão" type="range" min="0" max="1" step="0.05" value={config.exploded} onChange={event => set('exploded', Number(event.target.value))} /></label>
        <label className="sompo-studio-check"><input type="checkbox" checked={config.wireframe} onChange={event => set('wireframe', event.target.checked)} />Inspecionar a malha</label>
        <p className="sompo-studio-note">Cabine, baú, chassi e rodas têm peças próprias. Ao voltar à simulação, a montagem é restaurada.</p>
      </> : <div className="sompo-studio-empty"><Box /><h4>Modelo reconstruído</h4><p>A textura pertence à malha original. Para criar uma pintura editável e inspecionar peças separadas, escolha o caminhão modular.</p><button type="button" onClick={() => onAsset('modular')}>Usar caminhão modular</button></div>}
    </div>}
    {tab === 'library' && <div className="sompo-studio-panel">
      <label className="sompo-studio-name">Nome da variação<input value={config.name} maxLength={70} onChange={event => set('name', event.target.value)} /></label>
      <button type="button" className="sompo-studio-primary" onClick={save}><Save />Salvar variação</button>
      {library.length > 0 && <fieldset><legend>Salvas neste navegador</legend><div className="sompo-studio-saved">{library.map(item => <button type="button" key={item.name} onClick={() => apply(item)}><span style={{ background: item.paint }} />{item.name}<small>Aplicar</small></button>)}</div></fieldset>}
      <div className="sompo-studio-files"><button type="button" onClick={() => downloadSompoFile(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }), 'sompo-variacao.json')}><Download />Exportar preset</button><button type="button" onClick={() => input.current?.click()}><Upload />Importar preset</button></div>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        try { if (file.size > 128000) throw new Error('O preset deve ter até 128 KB.'); apply(parseSompoStudioConfig(JSON.parse(await file.text()))); setMessage('Preset importado e aplicado.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'Preset inválido.'); }
      }} />
      <details className="sompo-studio-reference"><summary>Direção visual e referências</summary><a href="/sompo/studio/visual-target.png" target="_blank" rel="noreferrer"><img src="/sompo/studio/visual-target.png" alt="Referência gerada de um caminhão em estrada rural ao fim da tarde" loading="lazy" /></a><p>Imagem-alvo gerada para orientar luz, materiais e composição. A cena ao lado é renderizada em 3D.</p><p><a href="https://github.com/achimala/dream-loop" target="_blank" rel="noreferrer">Dream Loop</a> · <a href="https://threeui.com/three-js/landscape" target="_blank" rel="noreferrer">ThreeUI Landscape</a> · <a href="https://www.tripo3d.ai/3d-prompts" target="_blank" rel="noreferrer">Catálogo Tripo</a></p></details>
    </div>}
    <div className="sompo-studio-export"><button type="button" onClick={onSnapshot}><Camera />Capturar cena</button><button type="button" disabled={exporting} onClick={async () => { setExporting(true); try { await onExportModel(); setMessage('Modelo exportado em GLB.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível exportar.'); } finally { setExporting(false); } }}><Download />{exporting ? 'Exportando…' : 'Exportar GLB'}</button></div>
    <p role="status" className="sompo-studio-message">{message}</p>
    <button type="button" className="sompo-studio-reset" onClick={() => apply({ ...SOMPO_STUDIO_DEFAULT })}>Restaurar direção original</button>
  </aside>;
}
