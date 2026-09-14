/**
 * Validação do que o geofencing acrescenta ao manifesto do laboratório (módulo shared/geofencing):
 * machine.profile (limites em graus) e rules.hazards (perigos com faixas crescentes). Chamada por
 * validateManifest em lab-telemetry.js com os mesmos helpers, para as mensagens ficarem no mesmo tom.
 * Sem esses campos no manifesto, não valida nada: o laboratório segue com water_warning_distance_m.
 */
export function validateGeofenceManifest(manifest, { fail, finite, object, water }) {
  if (manifest.machine?.profile != null) {
    const profile = manifest.machine.profile;
    if (!object(profile)) fail('Perfil de máquina inválido: machine.profile deve ser um objeto.');
    for (const [key, value] of Object.entries(profile)) if (value != null && (!finite(value) || value < 0)) fail(`Perfil de máquina: ${key} deve ser um número maior ou igual a zero.`);
  }
  const hazards = manifest.rules?.hazards;
  if (hazards != null) {
    if (!Array.isArray(hazards) || !hazards.length) fail('Regras: hazards deve ser uma lista com pelo menos um perigo.');
    const seen = new Set();
    for (const [index, hazard] of hazards.entries()) {
      const where = `Regras: perigo ${index + 1}`;
      if (!object(hazard) || !['water', 'hazard', 'machine'].includes(hazard.role)) fail(`${where}: role deve ser water, hazard ou machine.`);
      if (hazard.role === 'machine') {
        if (hazard.metric != null && hazard.metric !== 'roll_deg' && hazard.metric !== 'pitch_deg') fail(`${where}: metric de máquina deve ser roll_deg ou pitch_deg.`);
        if (hazard.limit_deg != null && (!finite(hazard.limit_deg) || hazard.limit_deg <= 0)) fail(`${where}: limit_deg deve ser um número positivo em graus.`);
      }
      if (hazard.role === 'hazard' && (typeof hazard.category !== 'string' || !hazard.category.trim())) fail(`${where}: informe category (por exemplo slope) para role hazard.`);
      const kind = [hazard.role, hazard.category, hazard.role === 'machine' ? hazard.metric ?? 'roll_deg' : null].filter(Boolean).join('/');
      if (seen.has(kind)) fail(`${where}: perigo ${kind} repetido; use uma entrada por papel, categoria e métrica.`);
      seen.add(kind);
      const bands = hazard.bands_m;
      if (!Array.isArray(bands) || !bands.length) fail(`${where}: bands_m deve ser uma lista com pelo menos uma faixa.`);
      const ids = new Set();
      for (const [j, band] of bands.entries()) {
        if (!object(band) || typeof band.id !== 'string' || !band.id.trim() || !finite(band.max_m) || band.max_m < 0) fail(`${where}, faixa ${j + 1}: informe id e max_m em metros, maior ou igual a zero.`);
        if (j && band.max_m <= bands[j - 1].max_m) fail(`${where}: bands_m deve estar em ordem crescente de max_m (faixa "${band.id}" com ${band.max_m} m depois de ${bands[j - 1].max_m} m).`);
        if (ids.has(band.id)) fail(`${where}: id de faixa "${band.id}" repetido.`);
        ids.add(band.id);
      }
      if (hazard.role === 'water' && water != null && bands.at(-1).max_m !== water) fail(`${where}: com faixas de água, water_warning_distance_m (${water} m) deve ser igual ao max_m da faixa mais externa (${bands.at(-1).max_m} m).`);
    }
  }
}
