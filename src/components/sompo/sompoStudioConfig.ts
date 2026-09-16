export type SompoLighting = 'day' | 'golden' | 'overcast';
export interface SompoStudioConfig {
  version: 1;
  name: string;
  truck: 'modular' | 'generated';
  equipment: 'modular' | 'generated' | 'tractor' | 'harvester';
  lighting: SompoLighting;
  paint: string;
  cargo: string;
  roughness: number;
  exposure: number;
  wind: number;
  wireframe: boolean;
  exploded: number;
}

export const SOMPO_STUDIO_DEFAULT: SompoStudioConfig = {
  version: 1, name: 'Frota rural · serra em luz natural', truck: 'modular', equipment: 'modular', lighting: 'day',
  paint: '#14213d', cargo: '#f3f1e8', roughness: 0.4, exposure: 0.94, wind: 0.65,
  wireframe: false, exploded: 0,
};
const KEY = 'luca:sompo-studio:v2';
const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const color = (value: unknown, fallback: string) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;

/** Only scene values cross the import boundary; never paths, scripts or asset URLs. */
export function parseSompoStudioConfig(input: unknown): SompoStudioConfig {
  if (!input || typeof input !== 'object' || (input as { version?: number }).version !== 1) throw new Error('Use um preset SOMPO versão 1.');
  const value = input as Partial<SompoStudioConfig>;
  const base = SOMPO_STUDIO_DEFAULT;
  return {
    version: 1, name: typeof value.name === 'string' ? value.name.trim().slice(0, 70) || base.name : base.name,
    truck: value.truck === 'generated' ? 'generated' : 'modular',
    equipment: value.equipment === 'tractor' || value.equipment === 'harvester' || value.equipment === 'generated' ? value.equipment : value.truck === 'generated' ? 'generated' : 'modular',
    lighting: value.lighting === 'day' || value.lighting === 'overcast' || value.lighting === 'golden' ? value.lighting : base.lighting,
    paint: color(value.paint, base.paint), cargo: color(value.cargo, base.cargo),
    roughness: clamp(value.roughness, 0.2, 1, base.roughness), exposure: clamp(value.exposure, 0.65, 1.4, base.exposure),
    wind: clamp(value.wind, 0, 2, base.wind), wireframe: value.wireframe === true,
    exploded: clamp(value.exploded, 0, 1, 0),
  };
}
export function loadSompoStudioConfig() {
  try { const data = localStorage.getItem(KEY); return data ? parseSompoStudioConfig(JSON.parse(data)) : { ...SOMPO_STUDIO_DEFAULT }; }
  catch { return { ...SOMPO_STUDIO_DEFAULT }; }
}
export function saveSompoStudioConfig(config: SompoStudioConfig) { localStorage.setItem(KEY, JSON.stringify(config)); }

export interface SompoRenderStats { fps: number; cpuMs: number; calls: number; triangles: number; geometries: number; textures: number; }

export function downloadSompoFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
