import { parseLabCase, type LabCase } from '../../../shared/lab-telemetry.js';
import type { SompoTelemetrySnapshot } from '../../../shared/sompo-telemetry';
import { PRAZO_DADOS_MS, type MotivoPulo } from './vitrineStand';

/**
 * Dados das Telas do app (Q3 b). Só GET, de arquivo público ou de leitura que já existe:
 * nada do cliente do Laboratório, que grava o caso na conta ao abrir um exemplo.
 */

const PIRACICABA = '/datasets/piracicaba-artemis';
export const CASO_LAB = {
  csv: `${PIRACICABA}/02-declive-tombamento.csv`,
  manifest: `${PIRACICABA}/manifest.json`,
  map: `${PIRACICABA}/mapa.geojson`,
  fileName: '02-declive-tombamento.csv',
} as const;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: MotivoPulo };

async function lerGet(url: string, sinal: AbortSignal): Promise<Response> {
  return fetch(url, { method: 'GET', credentials: 'same-origin', signal: sinal });
}

function comPrazo<T>(fazer: (sinal: AbortSignal) => Promise<Resultado<T>>, prazoMs = PRAZO_DADOS_MS): Promise<Resultado<T>> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), prazoMs);
  return fazer(controle.signal)
    .catch((): Resultado<T> => ({ ok: false, motivo: controle.signal.aborted ? 'prazo' : 'dados_indisponiveis' }))
    .finally(() => clearTimeout(timer));
}

/** Fallback da SPA devolve HTML com 200: arquivo ausente não pode virar caso vazio. */
const ehHtml = (r: Response) => (r.headers.get('content-type') || '').includes('text/html');

export function carregarCasoLab(prazoMs?: number): Promise<Resultado<LabCase>> {
  return comPrazo(async (sinal) => {
    const respostas = await Promise.all([CASO_LAB.csv, CASO_LAB.manifest, CASO_LAB.map].map((url) => lerGet(url, sinal)));
    const falha = respostas.find((r) => !r.ok || ehHtml(r));
    if (falha) return { ok: false, motivo: falha.ok ? 'dados_indisponiveis' : `http_${falha.status}` };
    const [csv, manifest, map] = await Promise.all([respostas[0].text(), respostas[1].json(), respostas[2].json()]);
    const caso = parseLabCase(csv, { fileName: CASO_LAB.fileName, manifest, map });
    if (!caso.samples.length) return { ok: false, motivo: 'dados_indisponiveis' };
    return { ok: true, valor: caso };
  }, prazoMs);
}

export function lerTrator(prazoMs?: number): Promise<Resultado<SompoTelemetrySnapshot>> {
  return comPrazo(async (sinal) => {
    const r = await lerGet('/api/sompo/telemetry', sinal);
    if (!r.ok) return { ok: false, motivo: `http_${r.status}` };
    const dados = await r.json();
    if (!dados?.telemetry) return { ok: false, motivo: 'dados_indisponiveis' };
    return { ok: true, valor: dados.telemetry as SompoTelemetrySnapshot };
  }, prazoMs);
}

/** WebGL antes de escalar o Lab: sem contexto, a Tela do app nem entra na volta. */
export function temWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
