export const messageCases = [
  { id: 'empty', content: '\r\n  \n---\n***\n___', includes: ['Sem conteúdo textual.'] },
  { id: 'code', content: '```ts\r\n  const value = "<tag>";\r\n\r\n  **literal**\r\n```\n```\nno language', includes: ['<code>  const value = &quot;&lt;tag&gt;&quot;;\n\n  **literal**</code>', '<code>no language</code>'] },
  { id: 'table', content: '| **Nome** | Estado | Nota |\n| :--- | ---: | :--: |\n| A | **OK** |\n| B | | extra | ignorado |\n\nDepois', includes: ['<table ', '>Nome</span></th>', '>OK</span>', '>-</span></td>', '>Depois</span>'], excludes: ['>ignorado</span></td>'] },
  { id: 'lists', content: '- **Risco**: alto\n* normal **forte**\n• outro\n1. Primeiro\n12) Etapa: executar\n- **Sozinho**', includes: ['luca-ai-bullet', '>Risco</span>', '>alto</span>', '>01</span>', '>12</span>', '>executar</span>', '>Sozinho</span>'] },
  { id: 'images', content: '![Mapa](https://example.test/map.png)\n![](/image.png)\n![HTTP](http://example.test/img.png)\n![unsafe](javascript:alert)\n![inline](/other.png) trailing', includes: ['<figure ', 'src="https://example.test/map.png" alt="Mapa"', 'alt="Imagem da entrega"', '>Mapa</figcaption>', '![unsafe](javascript:alert)', '![inline](/other.png) trailing'], excludes: ['src="javascript:'] },
  { id: 'labels', content: '# **Título**\n## Segundo\n### Terceiro\n#### Quarto\n##### não é heading\n**Resumo**: claro\nChave: valor\n**Só título**\n__texto__\n<em>literal</em>', includes: ['<h4 ', '>Título</span>', '>Resumo</span>', '>claro</span>', '>Só título</span>', '>texto</span>', '&lt;em&gt;literal&lt;/em&gt;'] },
  { id: 'mixed', content: '# Entrega\nAbertura **forte** e final.\n\n- **Status**: pronto\n2) revisar\n\n| Coluna | Valor |\n| -- | -- |\n| x | y |\n\n```json\n{"ok":true}\n```\n![Resultado](/result.png)\nConclusão: estável', includes: ['<h4 ', '>forte</strong>', 'luca-ai-bullet', '<table ', '<code>{&quot;ok&quot;:true}</code>', '<figure ', '>Conclusão</span>', '>estável</span>'] },
];

export const canvasVariants = [
  'team-response', 'individual-response', 'team-final', 'individual-final',
  'operator', 'system', 'visual-report',
];

export function canvasProps(content, variant) {
  const entry = {
    id: 'fixture', role: variant === 'operator' ? 'operator' : variant === 'system' ? 'system' : 'persona',
    name: 'Persona fixture', slug: 'fixture-persona', stage: 'Execução',
    ...(variant.startsWith('individual') ? { phase: 'blind' } : {}),
    content, status: 'ok', timestamp: '2026-09-21T12:00:00Z', durationMs: 1234,
  };
  return {
    transcript: variant.endsWith('final') || variant === 'visual-report' ? [] : [entry],
    finalResult: variant.endsWith('final') ? entry : null,
    visualPack: variant === 'visual-report' ? { status: 'complete', report: { title: 'Relatório fixture', markdown: content } } : null,
    personaBySlug: new Map(), running: false, transcriptRef: { current: null },
    onInspect() {}, operationMode: variant.startsWith('individual') ? 'individual' : 'team',
  };
}
