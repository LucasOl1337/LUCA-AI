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

A rodada inicial acima usou props de fixture. O follow-up abaixo fechou adicionalmente o fluxo autenticado local real de leitura e cópia de conversa persistida. SSR continua demonstrando equivalência exata do HTML nos casos cobertos, não equivalência universal de pixels ou hidratação. A página ainda concentra estado e outras responsabilidades, fora desta rodada.

## Follow-up: workflow autenticado local real

Em 22/09/2026, a coordenação autorizou iniciar o runtime oficial em ambiente descartável para fechar a validação integrada, sem missão, provider ou produção. Nenhum código de produto foi acrescentado ou modificado para fabricar o teste.

Antes de iniciar, foram inspecionados `server/index.js`, configuração, auth, chat library, source de telemetria e cliente Kamui. O bootstrap sempre agenda o scheduler e a sincronização de personas. `LUCA_SOMPO_OFFLINE=true` desliga o heartbeat Python e o Firebase SSE, mas não basta sozinho para isolar os demais destinos.

O isolamento efetivo foi:

- Entry point real `/home/lol/Projects/LUCA-AI/server/index.js`, não uma cópia. Build real `dist/` do checkout, sem substituir componentes ou backend por mocks.
- `env -i`, HOME e cwd descartáveis, `LUCA_DATA_DIR`/`LUCA_AUTH_DATA_PATH` no scratch. Nenhum `.env`, credencial ou dado privado foi lido.
- Node `--permission` com leitura limitada a `server`, `shared`, `node_modules`, `dist`, `package.json` e scratch, escrita somente no diretório de dados do teste. Sem permissão para subprocessos.
- Namespace `unshare -Urmn` apenas com loopback e nenhuma rota externa. Probe no endereço reservado para documentação `192.0.2.1:443` retornou `ENETUNREACH` antes do start. Kamui/9Router apontados a `127.0.0.1:1`, sem serviço no namespace.
- Relay de transporte TCP loopback → Unix socket → loopback do namespace. HTTP e WebSocket continuam atendidos pelo runtime Express oficial, sem respostas simuladas.

A primeira tentativa do harness encontrou HTTP 404 porque o cwd estava sob `.jcode`, e o `sendFile` do Express recusa caminhos ocultos. Isso foi corrigido somente no launcher de teste: bind-mount do cwd descartável em `/mnt` dentro do namespace. O runtime foi reiniciado, mantendo os dados sintéticos já persistidos. Não houve ajuste no produto.

Pelas APIs reais foram criados conta sintética (`refactor-luca@example.test`), sessão e imagem PNG local. O transcript foi salvo com `PATCH`, ativado e recuperado com `GET`. A autenticação do Chromium usou exclusivamente o cookie emitido pelo registro real. O fluxo não testa digitação no formulário de login, mas autentica de verdade pela API oficial e valida `/api/auth/session` na interface.

Na bancada `refactor-luca`, workspace 9, display `:83`, perfil exclusivo validado, a aplicação built completa em `/luca-ai?sessao=...` carregou a conversa pela API, abriu a resposta, exibiu tabela/código/imagem do anexo autenticado e copiou exatamente o texto persistido no clipboard isolado. Depois do reload completo, o conteúdo foi recuperado novamente. Como houve reinício do runtime antes do passe, a leitura também comprova persistência entre processos, não apenas estado em memória.

Resultados: `passed=true`, `authenticated=true`, `copyExact=true`, `reloadRestored=true`. Todas as respostas observadas no browser foram HTTP 200, `errors=[]`, `blocked=[]`, `activeMission=null` e nenhuma missão agendada. A única mutação observada da UI foi o PATCH normal da própria sessão sintética. Nenhum endpoint de execução de missão/persona foi chamado. Foram capturadas telas desktop e estreita, com a desktop inspecionada visualmente.

Evidências em `/home/lol/.jcode/scratch/refactor-luca-1139459/e2e/`:

- `start-isolated.sh`, `runtime-process-proof.json`, `egress-proof.log`, `net-address.json`, `net-routes.json`: comando, permissões e contenção de rede.
- `seed-proof.json`, `workflow-proof.json`, `workflow.log`: APIs reais, autenticação, requests/responses, cópia e reload.
- `authenticated-desktop.png`, `authenticated-narrow.png`: interface built real com conversa persistida.
- `seed.mjs`, `workflow.mjs`: harness usado, mantido fora do produto.

Teardown: aba própria fechada, bancada encerrada, runtime namespace e ambos os relays terminados. O storage sintético permanece apenas no scratch como evidência, sem serviço ativo. Sem push/deploy. A limitação residual agora é execução real de providers/missões e produção, deliberadamente não exercitadas, não a leitura/renderização/cópia autenticada local.

Ao alterar futuramente o comportamento, não atualize os hashes automaticamente para fazer testes passarem. Confira a diferença HTML e revise as asserções semânticas antes de aceitar uma nova baseline.
