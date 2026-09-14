/**
 * Texto do geofencing no episódio gravado (módulo shared/geofencing): a linha do resumo humano e o
 * bloco do dossiê que os agentes recebem. Lê summary.geofence montado por server/geofencing/episode-geofence.js.
 * Alimento dos agentes, não veredito: proximidade, tempo em faixa e margem em graus, sem rotular a operação.
 *
 * formatOffsetSeconds vem de sompo-telemetry.js por parâmetro, para o módulo não importar quem o importa.
 */
const secondsPt = (ms) => `${(Number(ms) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
const numberPt = (value) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const geofenceMeasure = (episode) => (episode.unit === 'deg'
  ? `margem mínima ${episode.minDistance === null ? 'não informada' : `${numberPt(episode.minDistance)}°`}`
  : `mínimo ${episode.minDistance === null ? 'não informado' : `${numberPt(episode.minDistance)} m`}`);

// Resumo humano: uma linha com o que o geofencing viu, sem rotular a operação.
export function episodeGeofenceHeadline(summary, formatOffsetSeconds) {
  const geofence = summary?.geofence;
  if (!geofence) return null;
  const episodes = geofence.episodes || [];
  if (episodes.length === 0) return 'Geofencing: nenhuma faixa de perigo mapeado foi alcançada no talhão sintético.';
  // O que acendeu a bandeira vem primeiro (faixa mais interna de perigo alertável ou limite da máquina atingido),
  // depois o alertável mais próximo; contexto por último.
  const lit = (episode) => Number(episode.alertable === true && episode.bandMax === 0);
  const closest = [...episodes].sort((left, right) => lit(right) - lit(left) || (right.alertable === true) - (left.alertable === true) || (left.unit === 'deg') - (right.unit === 'deg') || (left.minDistance ?? Infinity) - (right.minDistance ?? Infinity))[0];
  const alert = geofence.alertSamples > 0
    ? `; bandeira de proximidade acesa em ${geofence.alertSamples} amostra${geofence.alertSamples === 1 ? '' : 's'}${geofence.alertMs > 0 ? ` (≈ ${secondsPt(geofence.alertMs)})` : ''}`
    : '; bandeira de proximidade não acendeu';
  return `Geofencing: ${episodes.length} episódio${episodes.length === 1 ? '' : 's'} de faixa no talhão sintético; ${closest.hazardLabel} em "${closest.bandLabel}" com ${geofenceMeasure(closest)} em ${formatOffsetSeconds(closest.minDistanceAtMs)}${alert}.`;
}

// Dossiê: talhão, regras declaradas, episódios de faixa e coerência do radar gravado. Alimento dos agentes, não veredito.
export function episodeGeofenceLines(summary, formatOffsetSeconds) {
  const geofence = summary?.geofence;
  if (!geofence) return []; // sem talhão o dossiê não menciona geofencing
  const episodes = geofence.episodes || [];
  return [
    `Geofencing — talhão "${geofence.site.label}" (polígonos, regras e posição de cena sintéticos de demonstração; não é GNSS nem levantamento real):`,
    `Regras declaradas: ${geofence.rules.map((rule) => `${rule.label}${rule.alertable ? '' : ' [contexto: não acende alerta sozinho]'} → ${rule.bands.map((band) => `${band.label} até ${numberPt(band.max)}${rule.unit === 'deg' ? '°' : ' m'}`).join(' / ')}`).join(' | ')}`,
    `Limite da máquina: ${geofence.machine.label}, inclinação máxima declarada ${geofence.machine.maxRollDeg}° (valor de demonstração, não dado do fabricante).`,
    ...(episodes.length === 0
      ? ['Episódios de faixa: nenhum; a máquina não entrou em faixa de nenhum perigo mapeado.']
      : [
        'Episódios de faixa (perigo · faixa: entrada → saída · tempo observado na faixa · mínimo):',
        ...episodes.map((episode) => `- ${episode.hazardLabel} · ${episode.bandLabel}: ${formatOffsetSeconds(episode.startMs)} → ${episode.endMs === null ? 'fim da gravação' : formatOffsetSeconds(episode.endMs)} · ${secondsPt(episode.observedMs)} · ${geofenceMeasure(episode)}${episode.quality === 'com-lacuna' ? ' · com lacuna de gravação' : ''}${episode.alertable ? '' : ' · contexto'}`),
      ]),
    `Bandeira de proximidade (faixa mais interna de um perigo alertável ou limite da máquina atingido): ${geofence.alertSamples > 0 ? `acesa em ${geofence.alertSamples} amostra${geofence.alertSamples === 1 ? '' : 's'} (≈ ${secondsPt(geofence.alertMs)})` : 'não acendeu'}.`,
    `Coerência: ${geofence.samplesWithPosition} amostra${geofence.samplesWithPosition === 1 ? '' : 's'} com posição; a faixa gravada pelo radar no instante difere do recálculo pela geometria em ${geofence.recordedBandMismatches} amostra${geofence.recordedBandMismatches === 1 ? '' : 's'}.`,
    ...(Array.isArray(geofence.warnings) && geofence.warnings.length ? [`Avisos do motor de faixas: ${geofence.warnings.join(' ')}`] : []),
    `Leitura: ${geofence.notice} Descrevam proximidade, direção, tempo em faixa e margem em graus; não rotulem a operação nem atribuam culpa.`,
  ];
}
