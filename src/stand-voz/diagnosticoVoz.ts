/** Diagnóstico manual, somente memória desta página e sem PCM/dispositivo/credencial.
 * Ativar: sessionStorage.setItem('luca:voz:diagnostico','1'); recarregar.
 * Ler: window.__lucaVozDiagnostico. Desligar: removeItem + recarregar.
 */
type Registro = { tempo_ms: number; tipo: string; dados: Record<string, unknown> };
const pagina = globalThis as typeof globalThis & { __lucaVozDiagnostico?: Registro[] };

export function registrarVoz(tipo: string, dados: Record<string, unknown>): void {
  try {
    if (globalThis.sessionStorage?.getItem('luca:voz:diagnostico') !== '1') return;
    const registros = pagina.__lucaVozDiagnostico ??= [];
    registros.push({ tempo_ms: Math.round(performance.now()), tipo, dados });
    if (registros.length > 200) registros.splice(0, registros.length - 200);
  } catch { /* diagnóstico nunca pode impedir a conversa */ }
}
