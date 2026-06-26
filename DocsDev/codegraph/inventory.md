# Inventario CodeGraph - LUCA-AI

Gerado a partir do indice CodeGraph reindexado com `codegraph index . --force`.

Resumo do indice atual:

- Arquivos indexados: 130
- Nos: 1.531
- Arestas: 4.046
- Linguagens: JavaScript, TSX, Python, TypeScript
- Rotas detectadas: 38
- Observacao: o indice inicial tinha 65 arquivos e omitia `shared/`, `worker/` e paginas recentes do frontend. Foi necessario forcar reindexacao.

Arquivos de apoio:

- `DocsDev/codegraph/codegraph-status.txt`
- `DocsDev/codegraph/codegraph-files.json`
- `DocsDev/codegraph/codegraph-context.md`
- `DocsDev/codegraph/codegraph-visual.html`

## 1. Funcoes de uso do cliente / usuario comum

### 1.1 Cockpit operacional / ativacao de missao

- Nome: Ativar missao operacional
- Descricao: usuario escreve um briefing, opcionalmente usa template Sompo, e dispara uma missao para o runtime LUCA-AI.
- Arquivos relacionados: `src/components/MissionBar.tsx`, `src/hooks/useLucaState.tsx`, `src/lib/api.ts`, `server/index.js`, `server/state.js`, `worker/src/index.js`.
- Como e acessada/usada: UI em `MissionBar` chama `activateMission`, que usa `POST /api/mission/activate`; no cloud worker existe handler equivalente.
- Dependencias internas: `normalizeMissionContext`, `classifyMissionIntent`, `createRun`, `runCycle`, `buildPublicState`, `requestJson`.
- Status: funcional.
- Observacoes tecnicas: ha trava de concorrencia baseada em missao ativa/eventos recentes; no worker, falha de Durable Object Storage cai em execucao transitoria degradada.

### 1.2 Canvas executivo da missao

- Nome: Visualizar canvas executivo
- Descricao: renderiza dashboard temporario com metricas, paineis e blocos executivos derivados dos agentes ou fallback deterministico.
- Arquivos relacionados: `src/components/MissionCanvas.tsx`, `src/components/DashboardBlock.tsx`, `src/lib/canvas.ts`, `shared/executive-dashboard.js`, `shared/dashboard-contract.js`, `server/index.js`.
- Como e acessada/usada: pagina Operacional renderiza `MissionCanvas`; backend atualiza `temporaryDashboard`.
- Dependencias internas: `resolveBlocks`, `buildCanvasMarkdown`, `buildExecutiveDashboard`, `validateDashboardContract`, `executiveCanvasCoverageGaps`.
- Status: funcional.
- Observacoes tecnicas: designer possui fallback local quando roteador/LLM esta indisponivel; contrato de dashboard tem testes dedicados.

### 1.3 Painel de agentes

- Nome: Esquadrao de agentes
- Descricao: lista supervisor, heartbeat, database, maestro, transformador, planejador, pesquisador e designer com status e terminal.
- Arquivos relacionados: `src/pages/AgentesPage.tsx`, `src/components/AgentCard.tsx`, `src/components/AgentRail.tsx`, `src/components/AgentTerminal.tsx`, `src/lib/agents.ts`, `server/config.js`, `server/state.js`.
- Como e acessada/usada: navegacao `agentes` e trilho lateral; clique abre terminal ou pagina Database.
- Dependencias internas: `ALL_AGENT_DEFS`, `findAgentDef`, `getAgentStatus`, `getAgentLines`, `POST /api/agent/run`.
- Status: funcional.
- Observacoes tecnicas: `src/lib/agents.ts` deve continuar espelhando `server/config.js`; o maestro e forcado como habilitado no backend.

### 1.4 Terminal de agente e controle manual

- Nome: Terminal e execucao manual de agente
- Descricao: mostra logs por agente, heartbeat filtrado e botoes de acao para rodar agente, iniciar/pausar heartbeat e limpar contexto.
- Arquivos relacionados: `src/components/AgentTerminal.tsx`, `src/components/CopyLogButton.tsx`, `src/lib/format.ts`, `src/hooks/useLucaState.tsx`, `server/index.js`, `server/state.js`.
- Como e acessada/usada: modal aberto pelo painel de agentes/trilho; API `POST /api/agent/run`, `POST /api/heartbeat/start`, `POST /api/heartbeat/pause`, `POST /api/agents/clear`.
- Dependencias internas: `runAgentOnce`, `appendLine`, `setAgentStatus`, `addHeartbeat`, `clearAgentContexts`.
- Status: funcional.
- Observacoes tecnicas: execucao manual tambem suporta personas importadas por slug.

### 1.5 Chat global

- Nome: Chat global de missao
- Descricao: permite registrar mensagem humana no chat compartilhado para orientar agentes e gerar historico operacional.
- Arquivos relacionados: `src/components/GlobalChat.tsx`, `src/lib/api.ts`, `server/index.js`, `server/state.js`.
- Como e acessada/usada: UI envia `POST /api/tools/global-chat/message`; backend persiste em `globalChatMessages` e emite evento WebSocket.
- Dependencias internas: `addGlobalChatMessage`, `publishChatMessage`, `latestChatMessageId`, `unreadChatContext`.
- Status: funcional.
- Observacoes tecnicas: mensagens entram no contexto lido por agentes e tambem sao usadas no relatorio final.

### 1.6 Historico e relatorio de missao

- Nome: Historico operacional e relatorios
- Descricao: lista missoes arquivadas/ativas, permite abrir relatorio consolidado e exportar markdown/canvas.
- Arquivos relacionados: `src/pages/HistoricoPage.tsx`, `src/components/ReportModal.tsx`, `src/lib/canvas.ts`, `server/mission-report.js`, `server/index.js`.
- Como e acessada/usada: navegacao `historico`; API `GET /api/report/mission`.
- Dependencias internas: `buildMissionReport`, `buildReportText`, `buildReportFilename`, `eventFlows`, `missionHistory`.
- Status: funcional.
- Observacoes tecnicas: relatorio combina findings, evidencias do chat, governanca, heartbeat e trilhas de eventos.

### 1.7 Database operacional

- Nome: Database em tres camadas
- Descricao: exibe pesquisa bruta, processamento e integracao de dashboard, com regras de visibilidade.
- Arquivos relacionados: `src/pages/DatabasePage.tsx`, `src/lib/database.ts`, `server/state.js`.
- Como e acessada/usada: navegacao `database` ou clique no agente Database.
- Dependencias internas: `getDatabaseLayers`, `countDatabaseItems`, `upsertDashboardItem`, estado `database.layers`.
- Status: funcional.
- Observacoes tecnicas: nao ha banco externo; e estado JSON persistido em `.luca/state.json`.

### 1.8 Personas do Yume via Kamui

- Nome: Importar/remover personas Yume
- Descricao: lista personas do Yume, importa para LUCA-AI e permite remover personas importadas.
- Arquivos relacionados: `src/pages/PersonasPage.tsx`, `src/pages/LucaAiPage.tsx`, `src/lib/api.ts`, `server/kamui-client.js`, `server/index.js`, `server/state.js`.
- Como e acessada/usada: navegacao `personas` e `luca-ai`; APIs `GET /api/personas/available`, `POST /api/agent/persona/add`, `POST /api/agent/persona/remove`.
- Dependencias internas: `listYumePersonas`, `fetchYumePersonaSystemPrompt`, `getYumePersonaVersion`, `addPersonaAgent`, `updatePersonaAgent`.
- Status: parcial.
- Observacoes tecnicas: depende de Kamui em `KAMUI_BASE`; em modo cloud usa ponte local `LOCAL_LUCA_BRIDGE_URL`.

### 1.9 Time de personas LUCA-AI

- Nome: Rodada de time de personas
- Descricao: organiza personas importadas em papeis de workflow e executa conversa/rodada com trace de eventos.
- Arquivos relacionados: `src/pages/LucaAiPage.tsx`, `server/persona-team.js`, `server/index.js`, `server/kamui-client.js`, `server/event-log.js`.
- Como e acessada/usada: pagina `luca-ai`; API `POST /api/luca-ai/persona-team/run`; eventos consultados por `GET /api/events`.
- Dependencias internas: `normalizeWorkflowAssignments`, `runLucaAiPersonaTeamWorkflow`, `runLucaAiPersonaTeamMember`, `appendLucaAiTraceEvent`.
- Status: funcional com dependencia externa.
- Observacoes tecnicas: exige personas importadas e roteador/Kamui disponiveis; UI faz polling de eventos durante a execucao.

### 1.10 Catalogo de ferramentas e endpoints

- Nome: Ferramentas e endpoints
- Descricao: mostra catalogo HTTP de endpoints/ferramentas e auditoria de cobertura.
- Arquivos relacionados: `src/pages/ToolsPage.tsx`, `src/pages/EndpointsPage.tsx`, `shared/tool-catalog.js`, `shared/endpoint-catalog.js`, `shared/catalog-audit.js`, `server/index.js`.
- Como e acessada/usada: navegacao `ferramentas` e `endpoints`; APIs `GET /api/catalog/tools`, `GET /api/catalog/endpoints`, `GET /api/catalog/audit`.
- Dependencias internas: `buildToolCatalog`, `buildEndpointCatalog`, `auditEndpointCatalog`.
- Status: funcional.
- Observacoes tecnicas: catalogo declara ferramentas executaveis e seus endpoints; e util para agentes e QA.

### 1.11 Heartbeat e runtime readiness

- Nome: Monitor de heartbeat
- Descricao: monitora disponibilidade/status de agentes e runtime, incluindo logs de processo Python local.
- Arquivos relacionados: `heartbeat_monitor.py`, `src/pages/HeartbeatPage.tsx`, `src/components/AgentTerminal.tsx`, `server/runtime-readiness.js`, `server/index.js`, `server/state.js`.
- Como e acessada/usada: pagina `heartbeat`, terminal do agente heartbeat e APIs `POST /api/heartbeat/start/pause`.
- Dependencias internas: `startHeartbeatMonitor`, `appendHeartbeatLog`, `runtimeReadinessSnapshot`, `publicStateSnapshot`.
- Status: funcional.
- Observacoes tecnicas: subprocesso Python e best-effort; logs sao limitados e persistidos no estado local.

### 1.12 Site visual separado

- Nome: Site visual em `site/src/main.js`
- Descricao: cena/landing visual separada do app React principal.
- Arquivos relacionados: `site/src/main.js`, `site/postcss.config.js`.
- Como e acessada/usada: nao ha ligacao estrutural detectada com `src/App.tsx` ou servidor principal.
- Dependencias internas: animacao local em JS.
- Status: nao conectada.
- Observacoes tecnicas: parece artefato paralelo/experimental; manter fora do fluxo principal ate haver rota/build definido.

## 2. Funcoes de estrutura e backend

### 2.1 Servidor Express local

- Nome: Runtime local Express
- Descricao: serve SPA, API REST, WebSocket `/ws`, assets e orquestracao de missoes/agentes.
- Arquivos relacionados: `server/index.js`, `server/config.js`, `server/state.js`, `vite.config.ts`.
- Como e acessada/usada: scripts `npm run server`, `npm run dev:full`, `npm start`.
- Dependencias internas: Express, `ws`, estado local, roteador LLM, modulos `shared/*`.
- Status: funcional.
- Observacoes tecnicas: `server/index.js` e um arquivo grande com muitas responsabilidades; candidato a divisao por dominios.

### 2.2 Estado persistido local

- Nome: State store `.luca`
- Descricao: persiste missao ativa, run, historico, dashboard, database, chat, schedules, fila, personas e agentes em JSON.
- Arquivos relacionados: `server/state.js`, `server/state-response.js`, `shared/state-payload.js`.
- Como e acessada/usada: usado por quase todas as rotas e pelo ciclo de agentes.
- Dependencias internas: `makeInitialState`, `loadPersistedState`, `persistState`, `buildStatePayload`.
- Status: funcional.
- Observacoes tecnicas: writes sao sincronos e silenciam erro; bom para desktop/local, risco para concorrencia alta.

### 2.3 WebSocket/event stream

- Nome: Broadcast de estado e eventos
- Descricao: envia snapshots de estado e eventos em tempo real para UI.
- Arquivos relacionados: `server/index.js`, `src/hooks/useLucaState.tsx`, `src/lib/api.ts`, `src/lib/types.ts`.
- Como e acessada/usada: frontend abre `wsUrl()` em `/ws`; backend usa `emitState` e `emitEvent`.
- Dependencias internas: `WebSocketServer`, `appendEvent`, `publicStateSnapshot`.
- Status: funcional.
- Observacoes tecnicas: frontend tem fallback por polling quando WebSocket/backend falha.

### 2.4 Ciclo supervisor/agentes

- Nome: Run cycle de missao
- Descricao: classifica intencao, transforma briefing, aciona agentes contribuintes, gera canvas e faz fechamento/supervisao.
- Arquivos relacionados: `server/index.js`, `server/intent.js`, `shared/mission-intent.js`, `server/run-cycle-gate.js`, `server/closure.js`.
- Como e acessada/usada: `activateMissionInternal` chama `runCycle`; supervisor timer tambem avanca ciclos.
- Dependencias internas: `runMissionTransformer`, `runAgentOnce`, `supervisorTick`, `missionReadyForAgents`, `missionHasEnoughWorkerCoverage`.
- Status: funcional.
- Observacoes tecnicas: regras de fechamento exigem contribuicoes de agentes especificos para alguns intents.

### 2.5 Cliente do roteador LLM

- Nome: Router client
- Descricao: chama endpoint OpenAI-compatible configurado por `ROUTER_BASE_URL` e modelos por agente.
- Arquivos relacionados: `server/router-client.js`, `server/config.js`, `shared/model-selector.js`.
- Como e acessada/usada: agentes e personas chamam `callRouter`.
- Dependencias internas: `ROUTER_API_KEY`, `ROUTER_MODEL`, `ROUTER_TIMEOUT_MS`, `selectModelForAgent`.
- Status: funcional com dependencia externa.
- Observacoes tecnicas: sem roteador local/credencial, varios fluxos caem em fallback ou erro operacional.

### 2.6 Integracao Kamui/Yume

- Nome: Cliente Kamui read-only
- Descricao: le personas e prompts do Yume via Kamui; nao escreve em tether irmao.
- Arquivos relacionados: `server/kamui-client.js`, `server/persona-cards.js`, `server/yume-memory-event.js`.
- Como e acessada/usada: endpoints de personas e integracao `GET /api/integrations/yume/memory-event`.
- Dependencias internas: `KAMUI_BASE`, `kamuiGet`, `fetchYumePersonaSystemPrompt`, `buildYumeMemoryEvent`.
- Status: parcial.
- Observacoes tecnicas: comentarios deixam regra dura de somente leitura; indisponibilidade do Kamui deve ser tratada pela UI.

### 2.7 Schedules e fila de missoes

- Nome: Missoes agendadas
- Descricao: cria agendamentos recorrentes, enfileira vencidos, pausa/retoma/cancela e inicia jobs quando runtime esta livre.
- Arquivos relacionados: `server/scheduler.js`, `server/index.js`, `server/state.js`.
- Como e acessada/usada: APIs `POST /api/mission/schedule`, `/api/schedule/cancel`, `/api/schedule/pause`, `/api/schedule/resume`.
- Dependencias internas: `buildSchedule`, `tickSchedules`, `setScheduledMissions`, `setMissionQueue`, `processScheduledMissions`.
- Status: funcional.
- Observacoes tecnicas: funcoes de scheduler sao puras e testaveis; fila limitada a 80 itens.

### 2.8 Governanca e preflight

- Nome: Guardrails operacionais
- Descricao: resume regras de concorrencia, acoes irreversiveis, endpoints obrigatorios e orcamento padrao.
- Arquivos relacionados: `shared/governance.js`, `shared/preflight.js`, `server/index.js`, `worker/src/index.js`.
- Como e acessada/usada: `GET /api/governance`, `GET /api/preflight`, payload publico de estado.
- Dependencias internas: `buildGovernanceSummary`, `missionConcurrency`, `buildPreflightStatus`.
- Status: funcional.
- Observacoes tecnicas: bloqueio de concorrencia aparece no frontend como `missionLockReason`.

### 2.9 Event log e flows

- Nome: Observabilidade de eventos
- Descricao: registra eventos em `.luca/runtime-events.jsonl`, lista eventos, sumariza por tipo/source e infere flows por janela/trace.
- Arquivos relacionados: `server/event-log.js`, `server/index.js`, `worker/src/index.js`, `src/pages/LucaAiPage.tsx`.
- Como e acessada/usada: APIs `GET /api/events`, `/api/events/summary`, `/api/events/flows`.
- Dependencias internas: `appendEvent`, `listEvents`, `eventSummary`, `eventFlows`.
- Status: funcional.
- Observacoes tecnicas: no worker, eventos ficam em SQLite do Durable Object; local usa JSONL.

### 2.10 Worker Cloudflare / Durable Object

- Nome: Runtime cloud LUCA
- Descricao: implementa API similar ao backend local em Cloudflare Worker com Durable Object, SQLite interno, jobs, eventos e snapshots.
- Arquivos relacionados: `worker/src/index.js`.
- Como e acessada/usada: deploy Cloudflare; frontend distingue `runtimeMode` backend/cloud e pode usar ponte local para recursos nao-cloud.
- Dependencias internas: `LucaRuntime`, Durable Object Storage SQL, handlers `activateMission`, `getState`, jobs de missao.
- Status: parcial/incerta.
- Observacoes tecnicas: arquivo e grande e concentra runtime completo; funcionalidade depende de configuracao/deploy nao verificada nesta automacao.

### 2.11 Catalogos e auditoria

- Nome: Endpoint/tool catalog
- Descricao: declara endpoints e ferramentas, audita cobertura e expoe para UI/agentes.
- Arquivos relacionados: `shared/endpoint-catalog.js`, `shared/tool-catalog.js`, `shared/catalog-audit.js`, `server/catalog-audit.js`, `server/endpoint-catalog.js`.
- Como e acessada/usada: endpoints `/api/catalog/*` e paginas frontend.
- Dependencias internas: `buildEndpointCatalog`, `buildToolCatalog`, `auditEndpointCatalog`.
- Status: funcional.
- Observacoes tecnicas: ha duplicidade intencional de wrappers em `server/` apontando para `shared/`.

### 2.12 Testes de backend e simulacoes PraisonAI

- Nome: Suites Node test e exemplos PraisonAI
- Descricao: testes cobrem contratos, eventos, scheduler, run-cycle, Kamui, router, qualidade e casos de simulacao de agentes Python.
- Arquivos relacionados: `server/*.test.js`, `praisonai-tests/*.py`.
- Como e acessada/usada: `npm test` para Node test; scripts Python manuais em `praisonai-tests`.
- Dependencias internas: modulos `server/*` e `shared/*`.
- Status: funcional para testes Node; exemplos Python incertos.
- Observacoes tecnicas: exemplos Python usam `praisonaiagents` e base local `127.0.0.1:20128`, dependencia nao declarada no `package.json`.

## 3. Funcoes de estrutura frontend

### 3.1 Aplicacao React/Vite

- Nome: Shell de aplicacao
- Descricao: app React com navegacao interna persistida e layout lateral.
- Arquivos relacionados: `src/App.tsx`, `src/main.tsx`, `src/components/Layout.tsx`, `src/hooks/usePersistentState.ts`, `vite.config.ts`.
- Como e acessada/usada: Vite build/dev; `App` renderiza paginas por `PageId`.
- Dependencias internas: `ThemeProvider`, `LucaStateProvider`, `Layout`, paginas em `src/pages`.
- Status: funcional.
- Observacoes tecnicas: nao usa roteador URL; estado de pagina fica em localStorage.

### 3.2 Provider de estado LUCA

- Nome: `LucaStateProvider`
- Descricao: centraliza estado do backend/cloud, conexao WebSocket, polling, acoes API e helpers de status.
- Arquivos relacionados: `src/hooks/useLucaState.tsx`, `src/lib/api.ts`, `src/lib/types.ts`, `src/lib/database.ts`.
- Como e acessada/usada: hook `useLuca()` em paginas/componentes.
- Dependencias internas: `fetchState`, `lucaApi`, `wsUrl`, `missionUiPhaseForState`, `missionLockReasonForState`.
- Status: funcional.
- Observacoes tecnicas: tem politicas de polling diferentes para local/cloud e fallback quando storage cloud esta degradado.

### 3.3 Tema visual

- Nome: Tema LUCA
- Descricao: define tokens de cor/superficie/texto/status para UI.
- Arquivos relacionados: `src/hooks/useTheme.tsx`, `src/index.css`, `tailwind.config.js`.
- Como e acessada/usada: `useTheme()` em componentes.
- Dependencias internas: `ThemeContext`, classes Tailwind/CSS.
- Status: funcional.
- Observacoes tecnicas: paleta escura/gold/fleet bem acoplada ao design atual.

### 3.4 Layout e navegacao

- Nome: Sidebar e paginas
- Descricao: navega entre Inicio, Operacional, LUCA-AI, Agentes, Personas, Database, Ferramentas, Endpoints, Heartbeat e Historico.
- Arquivos relacionados: `src/components/Layout.tsx`, `src/App.tsx`.
- Como e acessada/usada: clique nos itens do menu; `PageId` controla renderizacao.
- Dependencias internas: `useLuca`, `BrandMark`, `StatePill`.
- Status: funcional.
- Observacoes tecnicas: `PageId` e lista de imports precisam ficar sincronizados.

### 3.5 Pagina inicial

- Nome: LandingPage operacional
- Descricao: apresenta estado do sistema e atalhos para fluxos principais.
- Arquivos relacionados: `src/pages/LandingPage.tsx`, `src/components/LucaOwl.tsx`, `src/components/StatCard.tsx`.
- Como e acessada/usada: pagina `inicio`.
- Dependencias internas: `useLuca`, `useTheme`, navegacao `onNavigate`.
- Status: funcional.
- Observacoes tecnicas: usa assets de coruja em `public/v2-design` e icones.

### 3.6 Pagina operacional

- Nome: Centro operacional
- Descricao: combina barra de missao, trilho de agentes, canvas, chat global e log do supervisor.
- Arquivos relacionados: `src/pages/OperacionalPage.tsx`, `src/components/MissionBar.tsx`, `src/components/AgentRail.tsx`, `src/components/MissionCanvas.tsx`, `src/components/GlobalChat.tsx`, `src/components/SupervisorLog.tsx`.
- Como e acessada/usada: pagina `operacional`.
- Dependencias internas: `useLuca`, `countDatabaseItems`, `formatMissionRuntime`.
- Status: funcional.
- Observacoes tecnicas: e o primeiro fluxo integrado para usuario comum.

### 3.7 Pagina LUCA-AI/persona team

- Nome: Orquestrador de personas
- Descricao: seleciona/importa personas, organiza workflow, executa rodada e mostra transcript/eventos.
- Arquivos relacionados: `src/pages/LucaAiPage.tsx`, `src/lib/api.ts`, `src/hooks/usePersistentState.ts`.
- Como e acessada/usada: pagina `luca-ai`.
- Dependencias internas: `lucaApi.listYumePersonas`, `lucaApi.runLucaAiPersonaTeam`, `lucaApi.listEvents`.
- Status: funcional com dependencia externa.
- Observacoes tecnicas: grande componente com muitas funcoes internas; candidato a separar componentes menores.

### 3.8 Pagina de personas

- Nome: Gerenciamento de personas
- Descricao: filtra, importa e remove personas Yume.
- Arquivos relacionados: `src/pages/PersonasPage.tsx`, `src/lib/api.ts`.
- Como e acessada/usada: pagina `personas`.
- Dependencias internas: `normalizePersonaAssetUrls`, `buildApiErrorMessage`, `refresh`.
- Status: funcional com dependencia externa.
- Observacoes tecnicas: modo cloud depende de ponte local.

### 3.9 Paginas Heartbeat, Historico, Database, Tools e Endpoints

- Nome: Paineis secundarios
- Descricao: superficies especificas para observabilidade, historico, database, ferramentas e endpoints.
- Arquivos relacionados: `src/pages/HeartbeatPage.tsx`, `src/pages/HistoricoPage.tsx`, `src/pages/DatabasePage.tsx`, `src/pages/ToolsPage.tsx`, `src/pages/EndpointsPage.tsx`.
- Como e acessada/usada: navegacao lateral.
- Dependencias internas: `useLuca`, `lucaApi`, `getDatabaseLayers`, `ReportModal`.
- Status: funcional.
- Observacoes tecnicas: Tools/Endpoints dependem dos catalogos `shared/*`; Historico depende do estado arquivado.

### 3.10 Cliente HTTP com timeout

- Nome: Request timeout compartilhado
- Descricao: wrapper de fetch com timeout, erros HTTP/network e mensagens amigaveis.
- Arquivos relacionados: `shared/request-timeout.js`, `src/lib/requestTimeout.ts`, `src/types/shared-request-timeout.d.ts`, `src/lib/api.ts`.
- Como e acessada/usada: todas as chamadas API do frontend.
- Dependencias internas: `RequestTimeoutError`, `RequestHttpError`, `RequestNetworkError`, `buildApiErrorMessage`.
- Status: funcional.
- Observacoes tecnicas: bridge TS importa implementacao JS compartilhada.

### 3.11 Assets e helpers de icones

- Nome: Pipeline de icones/assets
- Descricao: scripts Python para preview/refino de icones e assets em `public/icons` / `public/v2-design`.
- Arquivos relacionados: `scripts/preview_icons.py`, `scripts/refine_white_icons.py`, `public/icons`, `public/v2-design`, `src/lib/agents.ts`.
- Como e acessada/usada: scripts manuais e componentes visuais.
- Dependencias internas: assets referenciados por caminho estatico.
- Status: funcional/incerta.
- Observacoes tecnicas: scripts nao aparecem nos scripts NPM; uso provavelmente manual.

## Mapa dos principais fluxos do sistema

1. Missao local:
   `MissionBar.submit` -> `lucaApi.activateMission` -> `POST /api/mission/activate` -> `activateMissionInternal` -> `createRun` -> `runCycle` -> `runMissionTransformer` -> agentes contribuintes -> `setTemporaryDashboard` -> `emitState` -> `MissionCanvas`.

2. Evento em tempo real:
   acao backend -> `emitEvent`/`appendEvent` -> WebSocket `/ws` -> `LucaStateProvider` -> paginas e componentes atualizados.

3. Persona Yume:
   `PersonasPage`/`LucaAiPage` -> `lucaApi.listYumePersonas` -> `server/kamui-client.js` -> Kamui/Yume -> `addPersonaAgent`/cache de prompt -> execucao por `runPersonaAgentChat` ou `runLucaAiPersonaTeamWorkflow`.

4. Relatorio:
   missao encerrada/arquivada -> `missionHistory` + eventos + chat + dashboard -> `GET /api/report/mission` -> `buildMissionReport` -> `ReportModal`/download markdown.

5. Cloud:
   frontend em `runtimeMode=cloud` -> Worker API -> `LucaRuntime` Durable Object -> SQLite DO para eventos/snapshots/jobs/goals -> estado publico -> UI; recursos Yume podem usar ponte local.

## Dependencias principais

- Runtime/app: React 19, Vite 7, TypeScript, Tailwind, Framer Motion, Lucide, Recharts.
- Backend local: Express 5, `ws`, Node test runner, fetch nativo.
- LLM/router: endpoint OpenAI-compatible em `ROUTER_BASE_URL`, modelos `cx/gpt-5.4-mini-xhigh`/`cx/gpt-5.5` por padrao.
- Integracao externa: Kamui/Yume em `KAMUI_BASE`.
- Cloud: Cloudflare Worker + Durable Object SQL em `worker/src/index.js`.
- Persistencia local: `.luca/state.json` e `.luca/runtime-events.jsonl`.
- Observabilidade: event log local/DO, governance/preflight, heartbeat Python.

## Pontos criticos/riscos/inconsistencias

- Indice CodeGraph estava inconsistente antes do `index --force`: futuros agentes devem confiar no status atual e reindexar se arquivos esperados sumirem.
- `server/index.js` e `worker/src/index.js` concentram muitas responsabilidades e devem ser refatorados com cuidado.
- Dependencias externas nao garantidas localmente: roteador LLM, Kamui/Yume e PraisonAI Python.
- Worker cloud e backend local duplicam conceitos; risco de divergencia de contrato entre rotas/estado.
- Estado local usa JSON com escrita sincrona e catch silencioso; adequado para desktop, menos robusto para concorrencia.
- `site/src/main.js` esta desconectado do app principal.
- Scripts Python e helpers de automacao/desktop parecem manuais; nao ha contrato NPM claro.
- Exemplos PraisonAI setam chave placeholder e base local; devem ser tratados como demos/testes manuais, nao producao.
- `LucaAiPage.tsx`, `server/index.js` e `worker/src/index.js` sao areas de alto custo cognitivo.

## Proximos passos recomendados

1. Separar `server/index.js` em rotas por dominio: mission, agents, personas, catalog, events, reports, runtime.
2. Criar teste de paridade de contrato local vs worker para `/api/state`, `/api/mission/activate`, eventos e governance.
3. Formalizar `.luca` como storage adapter para permitir troca futura por DB real.
4. Extrair subcomponentes de `LucaAiPage.tsx` para workflow, transcript, persona picker e event timeline.
5. Documentar prerequisitos externos: ROUTER, Kamui/Yume, Cloudflare env e PraisonAI.
6. Decidir destino de `site/src/main.js` e helpers manuais: integrar, arquivar ou remover.
7. Adicionar rotina de CI/documentacao para `codegraph status` apos alteracoes grandes.
