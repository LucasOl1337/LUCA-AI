# Extração da apresentação rica de mensagens

Data: 21/09/2026. Baseline: `1139459d54d5685a89ced5279037a87323420df3`, branch `test/mini-vitrine-swe2`.

## Escopo e fronteira

A capacidade `src/components/rich-message/` interpreta o formato textual existente e o apresenta usando o tema real do LUCA. Não é uma implementação geral de Markdown.

- `message-format.ts`: tipos `MessageBlock`/`InlineTextPart`, parser de blocos e segmentação de negrito. Não depende de React, sessão, rede ou estado.
- `RichMessageBody.tsx`: componente público com as mesmas props `{ content: string; compact?: boolean }`. `InlineText` permanece privado. Usa `useTheme` e o parser.
- `LucaAiPage.tsx`: importa o componente nos mesmos cinco pontos de montagem. Cards de resposta, transcrição, callbacks, missão SOMPO, relatório visual e estado continuam na página.

A extração foi mecânica. Comparação com a cópia anterior verificou os tipos, algoritmos e JSX byte a byte, descontando somente os novos `export`/imports e espaços finais entre seções. Não houve alteração de CSS, classes, tema, callbacks ou algoritmos.

| Arquivo de produção | Antes | Depois |
| --- | ---: | ---: |
| `src/pages/LucaAiPage.tsx` | 4475 | 4215 |
| `src/components/rich-message/message-format.ts` | 0 | 146 |
| `src/components/rich-message/RichMessageBody.tsx` | 0 | 116 |
| Total do recorte | 4475 | 4477 |

A página perdeu 260 linhas (5,81%). O benefício é poder entender e testar a apresentação em 262 linhas coesas, não uma redução artificial do total de código. Não foi medido ganho de produtividade ou desempenho.

## Caracterização e validação

Antes de modificar a página, os testes de caracterização renderizaram o `LucaMissionCanvas` real, sem substituir hooks, componentes ou tema. Foram capturadas 49 saídas completas com `renderToStaticMarkup`: sete casos em sete contextos, incluindo respostas de equipe/individual, entregas finais de ambos, operador compacto, sistema e relatório visual. Os hashes SHA256 em `tests/fixtures/rich-message-canvas.json` foram gravados nessa etapa, não depois da extração.

Depois da extração, todos os 49 hashes permaneceram idênticos. As asserções semânticas também verificam conteúdo, cards recolhidos/finais, rótulos de cópia e fase individual. Os testes não inspecionam texto-fonte para provar a renderização.

Outros 26 testes executam diretamente o parser e o componente extraído. Cobrem código com/sem linguagem, fence não fechado, indentação, CRLF, tabelas com células ausentes/excedentes, listas ordenadas e marcadores distintos, imagens HTTP(S)/locais, sintaxe rejeitada, fallback vazio, títulos/rótulos, conteúdo misto, negrito, escaping HTML, tema e modo compacto.

Comandos:

```sh
node --test tests/*.test.js
npm test
npm run typecheck
npm run build
```

`npm test` passou a incluir `tests/**/*.test.js` além dos testes existentes em `server/`. Nenhum arquivo em `server/` foi alterado. O harness usa o esbuild já disponível no projeto, empacota o grafo TypeScript real e compartilha React com o renderer.

| Validação | Baseline | Depois |
| --- | --- | --- |
| Caracterização SSR do canvas | 49/49 | 49/49, hashes idênticos |
| Testes frontend novos | 49 antes da extração | 75/75 |
| `npm test` completo | 726 total, 718 passaram, 7 skipped, 1 falha | 801 total, 793 passaram, 7 skipped, mesma falha |
| `npm run typecheck` global | 3 erros SOMPO | mesmos 3 erros, log idêntico |
| `npm run build` | aprovado | aprovado |

Falha de teste preexistente preservada: `GLBs reais recuperam texturas sem ImageBitmap, preservam sensores/rodas e fallback`, `server/sompo-truck-asset.test.js:170`, `2 !== 3`.

Erros TypeScript preexistentes preservados:

- `src/components/sompo/createSompoRoadDetails.ts(402,9)` e `(403,9)`, TS2740: `MeshStandardMaterial[]` incompatível com `MeshStandardMaterial`.
- `src/components/sompo/createSompoRoadScene.ts(208,7)`, TS2741: `BufferGeometry` sem `parameters` exigido por `BoxGeometry`.

Diagnóstico adicional via API TypeScript, usando opções do `tsconfig.json` e raízes na página e nos dois módulos: zero erros, 645 fontes resolvidas. Isso não substitui nem torna aprovado o typecheck global.

O CSS principal continuou `index-fldtk3eC.css`, 191,64 kB. Os demais arquivos CSS também conservaram nome/hash e tamanho. O Tailwind já inclui `src/**/*.{js,ts,jsx,tsx}`, portanto encontra as classes no novo diretório.

## Preservação do checkout e limites

Os 26 arquivos rastreados previamente modificados foram registrados por diff e SHA256 antes dos testes. Todos os 26 hashes continuaram iguais após a extração. O índice estava vazio. Arquivos novos desta frente ficam exclusivamente em `src/components/rich-message/`, `tests/` e neste relatório. Além deles, só a página previamente limpa e o script de testes em `package.json` mudaram.

Evidências locais: `/home/lol/.jcode/scratch/refactor-luca-1139459/`, com status, diff e hashes prévios, cópia da página, HTML baseline e logs antes/depois. Não contém `.env` ou dados de sessão.

Sem push, deploy, release, acesso à produção, início do runtime da aplicação ou subagentes. Não houve alterações em auth, autosave, debounce, sessão, servidor, worker ou dados reais. Execução herdada da missão `cx/gpt-6-astra-high`, sem troca de modelo pelo executor.

A primeira tentativa interativa encontrou `CHROMIUM_PERFIL_AUSENTE`. A coordenação confirmou a rota autorizada de preparo inicial pelo seed estático `/home/lol/.agents/desktop/browser-seed/chromium`. Verificados destino inexistente, seed sem `Singleton*` e ausência de processo usando origem/destino, foi feita uma única cópia para o perfil exclusivo. Nenhum perfil humano, outra bancada ou banco ativo foi copiado.

A bancada `refactor-luca` foi então revalidada: display `:83`, workspace 9, controle do agente, clipboard separado, `lives_in=refactor-luca`, Chromium 151 e diretório próprio. O harness rodou pelo `agent-bench exec` no CDP retornado pela ferramenta da bancada. Uma página local estática montou o `LucaMissionCanvas` real com CSS do build, sem backend, e bloqueou requests fora da origem loopback.

Passaram no Chromium real: abrir e fechar resposta, callback `onInspect`, tabela e código, imagem SVG local decodificada, cópia exata no clipboard isolado, cópia sem alterar a abertura do card e ausência de erros JavaScript. A captura estreita também não apresentou overflow horizontal. O viewport solicitado foi 390px, com largura CSS efetiva observada de 355px no perfil herdado, `documentWidth=355` e imagem com largura aproximada de 309px. Houve captura desktop solicitada em 1280×900 e estreita em 390×844. A captura estreita foi inspecionada visualmente.

Artefatos no diretório scratch citado acima: `browser-interactions.mjs`, `browser-interactions.log`, `canvas-desktop.png`, `canvas-narrow.png`, `bench-validated.json` e `browser-validated.json`. A aba própria foi fechada, o servidor estático encerrado e a bancada liberada após os testes. O perfil preparado foi preservado.

Limites: foi exercitado o componente real com props de fixture, não o fluxo autenticado integral da aplicação. Não foram exercitados rede, sessão, persistência, seleção real de personas ou execução de missão. SSR demonstra equivalência exata do HTML nos casos cobertos, não equivalência universal de pixels ou hidratação. A página ainda concentra estado e outras responsabilidades, fora desta rodada.

Ao alterar futuramente o comportamento, não atualize os hashes automaticamente para fazer testes passarem. Confira a diferença HTML e revise as asserções semânticas antes de aceitar uma nova baseline.
