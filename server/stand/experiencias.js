// A lista é confirmada pelo frontend após abrir uma experiência. Não inferir
// conclusão de teste, câmera pronta ou sucesso a partir de uma ação emitida.
const NOMES = ['simulacao', 'sonolencia', 'vitrine', 'sensor', 'laboratorio', 'sompo'];

export function registrarExperiencias(conversa, tela) {
  conversa.experiencias ??= new Set();
  const lista = String(tela || '').match(/Experiências já abertas:\s*([^.;]*)/i)?.[1];
  if (!lista) return;
  for (const nome of lista.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(',')) {
    const limpo = nome.trim();
    if (NOMES.includes(limpo)) conversa.experiencias.add(limpo);
  }
}

export function contextoExperiencias(conversa) {
  const nomes = [...(conversa.experiencias || [])];
  return nomes.length ? [
    `Experiências que a tela confirmou já abertas nesta visita: ${nomes.join(', ')}.`,
    'Abertura não significa teste concluído nem câmera pronta. Reconheça o que a pessoa já viu, sem inventar resultados.',
    'Não volte a oferecer automaticamente essas experiências. Responda primeiro à pergunta atual e evite encerrar todo turno com convite para simulador ou sonolência.',
    'Se a pessoa pedir para repetir uma experiência, atenda normalmente. Só sugira outra experiência quando fizer sentido na conversa.',
  ].join(' ') : '';
}
