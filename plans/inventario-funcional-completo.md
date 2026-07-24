# Inventário funcional completo — LUCA-AI

Data da análise: 2026-07-24  
Commit-base: `4631386` (`docs: add CodeGraph inventory`)  
Escopo: código e configuração do app principal, runtime local, contratos compartilhados, Worker, site separado, testes e utilitários. Foram ignorados `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, caches e estado transitório.

## Método e evidência

- CodeGraph consultado primeiro: 130 arquivos indexados, 1.531 nós, 4.046 arestas e 38 rotas detectadas; índice reportado como atualizado.
- Fontes de verdade atuais: `README.md`, `INDEX.md`, `docs/arquitetura.md`, `docs/integracoes.md`, `docs/operacao.md`, `package.json`, `wrangler.jsonc` e o código.
- Verificações executadas: `npm run typecheck` passou; `npm run build` passou; 159 de 160 testes Node passaram; 13 arquivos Python passaram por parse de AST.
- `npm audit --omit=dev --audit-level=high` reportou 3 vulnerabilidades, incluindo severidade alta em `ws`.
- A abertura do grafo visual por `file://` foi bloqueada pela política do navegador oficial; o HTML autocontido e os artefatos CodeGraph foram lidos diretamente.
- O workspace sofreu uma reorganização documental externa durante a análise. As mudanças alheias foram preservadas. O inventário usa os caminhos atuais, mas o código funcional não foi alterado por esta auditoria.

### Legenda de status

- **funcional**: implementação conectada e com evidência de build, teste ou uso coerente.
- **parcial**: apenas parte da superfície existe, depende de serviço externo ou difere entre local e cloud.
- **quebrada**: falha verificada ou contrato declarado que não corresponde à implementação.
- **não conectada**: código existe, mas não há caminho ativo a partir da UI/runtime principal.
- **incerta**: não foi possível validar o ambiente externo ou deploy real.

## 1. Funções de uso do cliente / usuário comum

### 1.1 Navegação e shell do painel

- **Nome:** Navegação entre áreas do LUCA-AI.
- **Descrição:** shell com sidebar responsiva para Início, Operacional, LUCA-AI, Agentes, Personas, Database, Ferramentas, Endpoints, Heartbeat e Histórico.
- **Arquivos relacionados:** `src/App.tsx`, `src/components/Layout.tsx`, `src/hooks/usePersistentState.ts`.
- **Como é acessada/usada:** abertura do app; a página ativa é trocada internamente e persistida em `localStorage`.
- **Dependências internas:** `ThemeProvider`, `LucaStateProvider`, `PageId`, páginas em `src/pages/`.
- **Status:** **funcional**.
- **Observações técnicas:** não usa roteamento por URL; recarregar mantém a página pelo estado persistido, mas links profundos por página não existem.

### 1.2 Página inicial e atalhos operacionais

- **Nome:** Visão inicial do sistema.
- **Descrição:** resume runtime, missão, heartbeat, database e oferece atalhos para o centro operacional e o caso Sompo.
- **Arquivos relacionados:** `src/pages/LandingPage.tsx`, `src/components/LucaOwl.tsx`, `src/components/StatCard.tsx`, `src/lib/sompo-case.ts`.
- **Como é acessada/usada:** item `Início`; CTAs navegam ou ativam diretamente a missão Sompo.
- **Dependências internas:** `useLuca`, `countDatabaseItems`, `activateMission`, `onNavigate`.
- **Status:** **funcional**, com validação visual **parcial**.
- **Observações técnicas:** build e typecheck passam; o checklist de QA histórico ainda marcava esta página como pendente.

### 1.3 Ativação de missão por texto livre

- **Nome:** Criar e iniciar missão.
- **Descrição:** recebe um briefing livre, cria missão/run e inicia o supervisor.
- **Arquivos relacionados:** `src/components/MissionBar.tsx`, `src/hooks/useLucaState.tsx`, `src/lib/api.ts`, `server/index.js`, `server/state.js`, `worker/src/index.js`.
- **Como é acessada/usada:** caixa única na página Operacional; Enter ou botão `Ativar`; usa `POST /api/mission/activate`.
- **Dependências internas:** trava de missão, `activateMissionInternal`, `createRun`, `triggerRunCycle`, estado público.
- **Status:** **funcional** local; **parcial** no cloud.
- **Observações técnicas:** o Worker valida descrição vazia, mas o Express não; o cloud responde `202` e pode cair em execução transitória degradada quando o Durable Object falha.

### 1.4 Briefing estruturado Sompo

- **Nome:** Caso Sompo rural predefinido/editável.
- **Descrição:** preenche caso, CSV de sinistros, telemetria, lacuna financeira e objetivo executivo; gera briefing que proíbe inventar valores.
- **Arquivos relacionados:** `src/components/MissionBar.tsx`, `src/pages/LandingPage.tsx`, `src/lib/sompo-case.ts`, `shared/mission-intent.js`, `shared/executive-dashboard.js`, `shared/closure-review.js`.
- **Como é acessada/usada:** link `briefing Sompo` no Operacional ou CTA da página inicial.
- **Dependências internas:** ativação de missão, regras de evidência quantitativa/financeira e contrato do dashboard.
- **Status:** **funcional** em desktop; **incerta** no alvo mobile.
- **Observações técnicas:** a QA histórica registra que os cinco campos funcionaram no desktop, mas o último reteste mobile do botão não foi concluído.

### 1.5 Missões de dashboard, chat e conversa entre agentes

- **Nome:** Seleção automática do tipo de missão.
- **Descrição:** classifica o texto como `dashboard_build`, `chat_only` ou `agent_conversation`; conversa pode ocorrer entre Supervisor e Pesquisador por duração solicitada.
- **Arquivos relacionados:** `server/intent.js`, `server/index.js`, `worker/src/index.js`, `server/luca-ai.test.js`.
- **Como é acessada/usada:** o usuário descreve a intenção em linguagem natural; não há seletor explícito na UI.
- **Dependências internas:** expressões de intenção, `runCycle`, `runAgentConversationMission`, `runChatOnlyMission`, fechamento.
- **Status:** **funcional** local; **parcial/inconsistente** entre local e cloud.
- **Observações técnicas:** Express e Worker mantêm classificadores separados; o Worker força termos Sompo/risco/telemetria para dashboard, enquanto o classificador local não usa exatamente a mesma regra.

### 1.6 Canvas executivo e relatório visual

- **Nome:** Resultado executivo da missão.
- **Descrição:** mostra métricas, listas, gráficos e blocos produzidos pelo Designer ou fallback determinístico; oculta painéis que expõem estado interno de agentes/runtime.
- **Arquivos relacionados:** `src/components/MissionCanvas.tsx`, `src/components/DashboardBlock.tsx`, `src/components/ReportModal.tsx`, `src/lib/canvas.ts`, `shared/executive-dashboard.js`, `shared/dashboard-contract.js`.
- **Como é acessada/usada:** centro da página Operacional; relatório abre em modal, pode ser copiado e baixado como Markdown.
- **Dependências internas:** `temporaryDashboard`, `resolveBlocks`, `isOperationalCanvas`, `buildReportText`, contrato e gates de fechamento.
- **Status:** **funcional**.
- **Observações técnicas:** há ampla cobertura de testes para contrato executivo, caso Sompo, evidências e bloqueio de conteúdo técnico.

### 1.7 Comunicação global entre agentes

- **Nome:** Feed de comunicação.
- **Descrição:** exibe mensagens tipadas dos agentes, com cor por autor, timestamp, rolagem automática e cópia do log.
- **Arquivos relacionados:** `src/components/GlobalChat.tsx`, `src/lib/format.ts`, `server/index.js`, `server/state.js`.
- **Como é acessada/usada:** painel `Comunicação` na página Operacional.
- **Dependências internas:** `globalChatMessages`, WebSocket/polling, `publishChatMessage`.
- **Status:** **funcional** como visualização; envio humano pela UI **não conectado**.
- **Observações técnicas:** existe `POST /api/tools/global-chat/message` e wrapper `sendChatMessage`, mas `GlobalChat.tsx` não possui campo de entrada e nenhum componente chama `sendChatMessage`. O endpoint também não existe no Worker.

### 1.8 Painel, cartões e terminais de agentes

- **Nome:** Inspeção do esquadrão.
- **Descrição:** lista Supervisor, Maestro, Transformador, Planejador, Pesquisador, Designer, Heartbeat e Database; abre logs em modal e permite copiá-los.
- **Arquivos relacionados:** `src/pages/AgentesPage.tsx`, `src/components/AgentCard.tsx`, `src/components/AgentRail.tsx`, `src/components/AgentTerminal.tsx`, `src/components/CopyLogButton.tsx`, `src/lib/agents.ts`.
- **Como é acessada/usada:** página Agentes, trilho do Operacional ou modal de terminal.
- **Dependências internas:** `ALL_AGENT_DEFS`, `getAgentStatus`, `getAgentLines`, estado WebSocket.
- **Status:** **funcional** para inspeção.
- **Observações técnicas:** existe API/wrapper para `runAgent`, mas nenhum componente chama essa ação; execução manual de agentes é API-only. Database abre página própria.

### 1.9 Controle do Supervisor

- **Nome:** Ligar/pausar supervisão.
- **Descrição:** alterna o timer de supervisão e dispara ciclo imediato ao ligar.
- **Arquivos relacionados:** `src/components/AgentRail.tsx`, `src/hooks/useLucaState.tsx`, `server/index.js`.
- **Como é acessada/usada:** botão do Supervisor no trilho lateral; `POST /api/supervisor/start|pause`.
- **Dependências internas:** `setSupervisorMode`, `startSupervisorTimer`, `triggerRunCycle`.
- **Status:** **funcional** local; **quebrada no cloud**.
- **Observações técnicas:** o Worker não implementa os endpoints do Supervisor, embora a mesma UI seja servida no domínio cloud.

### 1.10 Heartbeat, diagnóstico e limpeza de contexto

- **Nome:** Monitor operacional.
- **Descrição:** mostra frescor, logs, agentes, eventos, governança, metas recentes e oferece play, pause, smoke diagnostic e limpeza dos terminais/contexto.
- **Arquivos relacionados:** `src/pages/HeartbeatPage.tsx`, `src/components/AgentTerminal.tsx`, `heartbeat_monitor.py`, `server/runtime-readiness.js`, `server/index.js`, `worker/src/index.js`.
- **Como é acessada/usada:** página Heartbeat ou terminal Heartbeat.
- **Dependências internas:** `POST /api/heartbeat/start|pause`, `POST /api/harness/smoke`, `POST /api/agents/clear`, estado público.
- **Status:** **funcional** local; **parcial** no cloud.
- **Observações técnicas:** start/pause/smoke existem nos dois runtimes; limpeza de agentes existe só no Express. No local, o monitor é um subprocesso Python que grava `heartbeat-report.json`.

### 1.11 Database em três camadas

- **Nome:** Navegação do database operacional.
- **Descrição:** mostra pesquisa bruta, processamento e integração com canvas, incluindo registros, seções públicas e links Obsidian/externos.
- **Arquivos relacionados:** `src/pages/DatabasePage.tsx`, `src/lib/database.ts`, `server/state.js`.
- **Como é acessada/usada:** página Database ou cartão Database.
- **Dependências internas:** `getDatabaseLayers`, `getLayerLinks`, `getPublicRecordSections`, `obsidianUrl`.
- **Status:** **funcional como visualização de estado**; pipeline de dados **parcial**.
- **Observações técnicas:** não há banco externo nem CRUD do usuário; o “database” é parte do JSON local e é alimentado pelos agentes via `upsertDashboardItem`.

### 1.12 Histórico e relatórios arquivados

- **Nome:** Revisão de missões passadas.
- **Descrição:** lista missões arquivadas, abre/copia relatórios válidos e exibe status/data.
- **Arquivos relacionados:** `src/pages/HistoricoPage.tsx`, `src/lib/canvas.ts`, `server/state.js`, `server/mission-report.js`.
- **Como é acessada/usada:** página Histórico; relatórios da UI são montados do snapshot arquivado.
- **Dependências internas:** `missionHistory`, `buildReportText`, `isOperationalCanvas`.
- **Status:** **funcional**, com QA visual **incerta**.
- **Observações técnicas:** não há paginação; o estado limita histórico no backend, e o snapshot público compacta payloads.

### 1.13 Gerenciamento de agendamentos existentes

- **Nome:** Pausar, retomar e cancelar agendas.
- **Descrição:** mostra missões agendadas e permite controlar entradas existentes.
- **Arquivos relacionados:** `src/pages/HistoricoPage.tsx`, `src/lib/api.ts`, `server/scheduler.js`, `server/index.js`.
- **Como é acessada/usada:** seção `Agendadas` no Histórico.
- **Dependências internas:** `scheduledMissions`, endpoints `/api/schedule/*`, `refresh`.
- **Status:** **parcial**.
- **Observações técnicas:** criação de agenda existe em `POST /api/mission/schedule` e no catálogo de ferramentas, mas não há formulário/wrapper de criação na UI. Agendamento não existe no Worker.

### 1.14 Catálogo e importação de personas Yume

- **Nome:** Descobrir/importar/remover personas.
- **Descrição:** pesquisa e filtra personas do Yume, exibe avatar/modelo/status e as adiciona ao runtime local.
- **Arquivos relacionados:** `src/pages/PersonasPage.tsx`, `src/lib/api.ts`, `server/kamui-client.js`, `server/persona-cards.js`, `server/state.js`.
- **Como é acessada/usada:** página Personas; botão também abre o dashboard Yume local em `127.0.0.1:2222`.
- **Dependências internas:** Kamui, cache de prompt/versão, proxy de avatar, ponte local `127.0.0.1:4242` no modo cloud.
- **Status:** **parcial**.
- **Observações técnicas:** depende de Kamui/Yume; no site cloud o navegador do usuário precisa ter o Express local ativo. O Worker não oferece endpoints de persona.

### 1.15 Workflow LUCA-AI com personas

- **Nome:** Bancada de equipe de personas.
- **Descrição:** atribui personas importadas a cinco papéis (Supervisor, Decisor, Executores, Aprovação e Exibição), executa as etapas, mostra terminal de processo, transcript, resultado final e eventos correlacionados.
- **Arquivos relacionados:** `src/pages/LucaAiPage.tsx`, `server/persona-team.js`, `server/index.js`, `server/kamui-client.js`, `server/event-log.js`.
- **Como é acessada/usada:** página LUCA-AI; requer todos os cinco papéis preenchidos; usa `POST /api/luca-ai/persona-team/run`.
- **Dependências internas:** personas importadas, 9router, workflow sequencial com executores paralelos por etapa, traceId e polling de eventos.
- **Status:** **funcional com dependências externas** no local; **parcial** no cloud via ponte local.
- **Observações técnicas:** `LucaAiPage.tsx` tem 1.667 linhas e concentra UI, persistência, transformação de transcript, polling e workflow.

### 1.16 Catálogo de ferramentas

- **Nome:** Explorar e copiar contratos de ferramentas.
- **Descrição:** lista ferramentas LUCA e catálogos irmãos consultivos, mostra schema, invoke, payload de exemplo, tags e disponibilidade.
- **Arquivos relacionados:** `src/pages/ToolsPage.tsx`, `server/tool-catalog.js`, `shared/tool-catalog.js`, `server/tool-catalog-manifests/*.json`.
- **Como é acessada/usada:** página Ferramentas; `GET /api/catalog/tools`.
- **Dependências internas:** manifests locais e diretórios irmãos TARS/Yume.
- **Status:** **quebrada no gate de teste / parcial em runtime**.
- **Observações técnicas:** o catálogo local funciona e carrega 13 ferramentas LUCA + 19 Yume consultivas nesta máquina, mas a suíte exige `tars:mission_log` de um diretório TARS ausente.

### 1.17 Catálogo de endpoints

- **Nome:** Explorar API por módulo e direção.
- **Descrição:** mostra rotas de entrada/saída, disponibilidade local/cloud e payloads de exemplo.
- **Arquivos relacionados:** `src/pages/EndpointsPage.tsx`, `shared/endpoint-catalog.js`, `server/endpoint-catalog.js`.
- **Como é acessada/usada:** página Endpoints; `GET /api/catalog/endpoints`.
- **Dependências internas:** catálogo estático compartilhado.
- **Status:** **parcial/inconsistente**.
- **Observações técnicas:** o catálogo não é gerado das rotas reais. Há três rotas locais não declaradas e, no cloud, uma rota real omitida e uma rota declarada inexistente.

### 1.18 Site visual/marketing separado

- **Nome:** Landing premium independente.
- **Descrição:** site estático com Three.js, hero 3D, seções de produto e assets de marketing.
- **Arquivos relacionados:** `site/index.html`, `site/src/main.js`, `site/src/styles.css`, `site/package.json`, `site/public/assets/`.
- **Como é acessada/usada:** build/dev próprios dentro de `site/`.
- **Dependências internas:** Three.js, CSS e assets próprios.
- **Status:** **não conectada** ao app principal.
- **Observações técnicas:** `docs/arquitetura.md` confirma que `site/` não entra no build raiz. Já `public/v2-design/` é diferente: serve como fallback do Express quando `dist/` não existe.

## 2. Funções de estrutura e backend

### 2.1 Runtime Express, SPA e WebSocket

- **Nome:** Servidor local unificado.
- **Descrição:** serve API REST, WebSocket `/ws`, assets, `dist/` e fallback visual.
- **Arquivos relacionados:** `server/index.js`, `server/config.js`, `vite.config.ts`, `package.json`.
- **Como é acessada/usada:** `npm run server`, `npm run dev:full` ou `npm start`; porta padrão 4242.
- **Dependências internas:** Express, Node HTTP, `ws`, estado, módulos `server/` e `shared/`.
- **Status:** **funcional**.
- **Observações técnicas:** escuta em `0.0.0.0` e concentra 35 rotas reais em um arquivo de 2.561 linhas.

### 2.2 Estado local persistido

- **Nome:** Store `.luca/system-state.json`.
- **Descrição:** mantém missão/run, histórico, dashboard, database, chat, agendas, fila, personas e agentes.
- **Arquivos relacionados:** `server/state.js`, `shared/state-payload.js`, `server/state-response.js`.
- **Como é acessada/usada:** todas as mutações do runtime chamam helpers de `server/state.js`.
- **Dependências internas:** `makeInitialState`, normalização de agentes, snapshots públicos.
- **Status:** **funcional com risco**.
- **Observações técnicas:** escrita síncrona, não atômica e com `catch` silencioso; JSON corrompido ou falha de I/O faz o processo voltar ao estado inicial sem alerta.

### 2.3 Snapshot público e compactação

- **Nome:** Contrato de estado para a UI.
- **Descrição:** remove payload pesado do histórico, normaliza missão encerrada, injeta governança, heartbeat, eventos e horário de Brasília.
- **Arquivos relacionados:** `shared/state-payload.js`, `shared/public-state.js`, `shared/time.js`, `server/state-response.js`.
- **Como é acessada/usada:** `GET /api/state`, respostas de mutação e broadcasts WebSocket.
- **Dependências internas:** `buildGovernanceSummary`, `serializePublicState`, `buildPublicStateSnapshot`.
- **Status:** **funcional**.
- **Observações técnicas:** possui testes para compactação, timestamps e coerência de missão/run.

### 2.4 Eventos persistidos e reconstrução de flows

- **Nome:** Event store local.
- **Descrição:** appenda JSONL, consulta do fim do arquivo, filtra por tipo/missão/meta/trace, resume e agrupa trilhas.
- **Arquivos relacionados:** `server/event-log.js`, `server/event-log.test.js`, `server/index.js`.
- **Como é acessada/usada:** `/api/events`, `/api/events/summary`, `/api/events/flows`; emissão interna em quase todos os fluxos.
- **Dependências internas:** `.luca/runtime-events.jsonl`, `appendEvent`, `eventSummary`, `eventFlows`.
- **Status:** **funcional**.
- **Observações técnicas:** I/O é síncrono; falhas de observabilidade são ignoradas por `emitEvent` para não interromper o runtime.

### 2.5 Sincronização em tempo real

- **Nome:** Broadcast de estado/eventos.
- **Descrição:** transmite snapshots e eventos a todos os clientes WebSocket conectados.
- **Arquivos relacionados:** `server/index.js`, `src/hooks/useLucaState.tsx`, `src/lib/api.ts`.
- **Como é acessada/usada:** `/ws` no local; frontend usa polling como fallback e sempre no cloud.
- **Dependências internas:** `emitState`, `emitEvent`, `publicStateSnapshot`.
- **Status:** **funcional** local.
- **Observações técnicas:** não há autenticação nem segmentação por usuário/tenant.

### 2.6 Ativação, lock e escopo de missão

- **Nome:** Lifecycle de abertura/reset.
- **Descrição:** bloqueia concorrência, arquiva escopo anterior, cria missão/run, registra eventos e aciona ciclo.
- **Arquivos relacionados:** `server/index.js`, `server/state.js`, `shared/governance.js`, `worker/src/index.js`.
- **Como é acessada/usada:** `/api/mission/activate` e `/api/mission/reset`.
- **Dependências internas:** `missionActivationBlocker`, `startNewMissionScope`, `createRun`, `missionConcurrency`.
- **Status:** **funcional**, com paridade **parcial**.
- **Observações técnicas:** Express aceita missão sem descrição pela API; Worker rejeita com `description_required`.

### 2.7 Contexto estruturado e sinais em tempo real

- **Nome:** Enriquecimento de missão ativa.
- **Descrição:** mescla dados históricos/previsivos/causas/falhas e injeta até 50 sinais com severidade.
- **Arquivos relacionados:** `server/problem-context.js`, `server/index.js`, `server/problem-context.test.js`.
- **Como é acessada/usada:** `POST /api/mission/context` e `POST /api/mission/signal`.
- **Dependências internas:** `normalizeMissionContext`, `mergeMissionContext`, `normalizeSignal`, `persist`, chat/eventos.
- **Status:** **funcional via API local**; **não conectada à UI** e ausente no cloud.
- **Observações técnicas:** existem manifests para sinal, mas não há formulário visual.

### 2.8 Classificação de intenção

- **Nome:** Roteamento semântico de missão.
- **Descrição:** identifica conversa, ação de chat ou construção de dashboard por regras determinísticas.
- **Arquivos relacionados:** `server/intent.js`, `worker/src/index.js`, `shared/mission-intent.js`.
- **Como é acessada/usada:** antes do ciclo local/cloud e pelos gates de fechamento.
- **Dependências internas:** texto da missão, regras de todos os agentes e julgamento.
- **Status:** **funcional**, porém **duplicada/inconsistente**.
- **Observações técnicas:** há três centros de regras relacionados; só parte está compartilhada.

### 2.9 Orquestração Supervisor → agentes → Designer

- **Nome:** Ciclo multiagente.
- **Descrição:** transforma briefing, chama Planejador/Pesquisador, gera canvas com Designer, revisa e encerra.
- **Arquivos relacionados:** `server/index.js`, `server/run-cycle-gate.js`, `shared/agent-playbooks.js`, `server/agent-quality.js`.
- **Como é acessada/usada:** ativação de missão, timer do Supervisor ou start manual.
- **Dependências internas:** `runCycle`, `supervisorTick`, `runMissionTransformer`, `runAgent`, `runDesignerAgent`, single-flight.
- **Status:** **funcional** local.
- **Observações técnicas:** execução é majoritariamente sequencial; o gate single-flight evita ciclos simultâneos no mesmo processo.

### 2.10 Configuração e execução manual de agentes

- **Nome:** Administração de agentes.
- **Descrição:** altera modelo/habilitação, roda agente builtin ou persona e limpa contextos.
- **Arquivos relacionados:** `server/index.js`, `server/config.js`, `server/state.js`, `src/lib/api.ts`.
- **Como é acessada/usada:** `POST /api/agent/config`, `/api/agent/run`, `/api/agents/clear`.
- **Dependências internas:** aliases, modelos, tarefas, missão ativa e cache de persona.
- **Status:** **funcional via API local**; parcialmente **não conectada** à UI.
- **Observações técnicas:** não há tela de configuração; `runAgent` existe no provider frontend, mas não é acionado por componentes.

### 2.11 Chat e contexto colaborativo

- **Nome:** Mensageria interna de missão.
- **Descrição:** persiste mensagens, publica eventos, calcula mensagens não lidas e injeta histórico nos prompts.
- **Arquivos relacionados:** `server/index.js`, `server/state.js`, `src/components/GlobalChat.tsx`.
- **Como é acessada/usada:** agentes publicam internamente; API `POST /api/tools/global-chat/message` permite entrada externa.
- **Dependências internas:** `publishChatMessage`, `latestChatMessageId`, `unreadChatContext`.
- **Status:** **funcional** local.
- **Observações técnicas:** não existe no Worker e a UI atual é somente leitura.

### 2.12 Gates de qualidade, fechamento e verificação

- **Nome:** Revisão determinística + modelo.
- **Descrição:** exige contribuições, evidência do briefing, números, disciplina financeira, canvas, relatório final e veredito quando necessário.
- **Arquivos relacionados:** `shared/closure-review.js`, `server/closure.js`, `shared/mission-intent.js`, `server/agent-quality.js`, `server/index.js`.
- **Como é acessada/usada:** `attemptMissionClosure` antes de completar/arquivar.
- **Dependências internas:** chat, agentes esperados, dashboard, `finalReport`, Maestro/model review.
- **Status:** **funcional**, com dívida de duplicação.
- **Observações técnicas:** `server/closure.js` e `shared/closure-review.js` contêm versões divergentes; o Express mistura helpers dos dois módulos.

### 2.13 Relatório final e dashboard determinístico

- **Nome:** Fallback executivo confiável.
- **Descrição:** normaliza saída do Supervisor, deriva findings/mustShow/critérios e monta dashboard mesmo quando LLM falha.
- **Arquivos relacionados:** `shared/supervisor-final-report.js`, `shared/executive-dashboard.js`, `shared/dashboard-contract.js`, `server/index.js`, `worker/src/index.js`.
- **Como é acessada/usada:** fase de encerramento/designer no local e cloud.
- **Dependências internas:** evidências da missão, contratos Sompo, `normalizeSupervisorFinalReport`.
- **Status:** **funcional**.
- **Observações técnicas:** é uma das áreas mais testadas do projeto.

### 2.14 Relatório consolidado de missão

- **Nome:** API de relatório.
- **Descrição:** combina missão, dashboard, relatório final, chat, governança, heartbeat, flows e evidências em estrutura + Markdown.
- **Arquivos relacionados:** `server/mission-report.js`, `server/index.js`, `server/mission-report.test.js`.
- **Como é acessada/usada:** `GET /api/report/mission?missionId=` no Express.
- **Dependências internas:** `findMissionReportTarget`, `eventFlows`, `buildMissionReport`.
- **Status:** **funcional local**; **quebrada no contrato cloud**.
- **Observações técnicas:** o catálogo declara disponibilidade `both`, mas o Worker não implementa a rota.

### 2.15 Preview de memória Yume

- **Nome:** Conversão para `MemoryEventIn`.
- **Descrição:** gera payload compacto para memória longa do Yume sem enviar/escrever automaticamente.
- **Arquivos relacionados:** `server/yume-memory-event.js`, `server/index.js`, `server/yume-memory-event.test.js`.
- **Como é acessada/usada:** `GET /api/integrations/yume/memory-event`.
- **Dependências internas:** relatório, flows e missão arquivada/ativa.
- **Status:** **funcional via API local**, **não conectada** a sincronização.
- **Observações técnicas:** respeita a regra read-only do Yume; é preview, não webhook.

### 2.16 Agendamento e fila recorrente

- **Nome:** Scheduler local.
- **Descrição:** cria agendas finitas/infinitas, calcula vencimentos, enfileira, evita duplicata, pausa/retoma/cancela e dispara quando o runtime está livre.
- **Arquivos relacionados:** `server/scheduler.js`, `server/index.js`, `server/state.js`, `server/luca-ai.test.js`.
- **Como é acessada/usada:** `/api/mission/schedule` e `/api/schedule/*`; timer de 15 s.
- **Dependências internas:** `tickSchedules`, `missionQueue`, `activateMissionInternal`.
- **Status:** **funcional local**.
- **Observações técnicas:** fila e agendas têm limites; não existe no Worker.

### 2.17 Heartbeat Python e readiness local

- **Nome:** Monitor de processo e preflight.
- **Descrição:** subprocesso escreve pulso a cada 5 s; readiness verifica Node/Python/script, roteador, Kamui e endpoints essenciais.
- **Arquivos relacionados:** `heartbeat_monitor.py`, `server/runtime-readiness.js`, `server/index.js`, `shared/preflight.js`.
- **Como é acessada/usada:** inicialização do Express, `/api/health`, `/api/preflight`, `/api/harness/smoke`.
- **Dependências internas:** `spawn`, arquivo `heartbeat-report.json`, probes HTTP.
- **Status:** **funcional**.
- **Observações técnicas:** o subprocesso é best-effort; stdout/stderr entram no estado e no WebSocket.

### 2.18 Cliente do 9router

- **Nome:** Chamada OpenAI-compatible local.
- **Descrição:** envia system/user/model, aceita JSON, SSE, blocos de texto e payload estilo Gemini; aplica timeout e health-check.
- **Arquivos relacionados:** `server/router-client.js`, `server/config.js`, `shared/request-timeout.js`.
- **Como é acessada/usada:** agentes builtin e personas no Express.
- **Dependências internas:** `ROUTER_BASE_URL`, chaves opcionais, seleção por agente.
- **Status:** **funcional com dependência externa**.
- **Observações técnicas:** sem roteador disponível, partes do sistema usam fallback; outras retornam erro operacional.

### 2.19 Integração Kamui/Yume read-only

- **Nome:** Cliente e cache de personas.
- **Descrição:** lista persona, lê detalhes/prompt/versão e testa saúde somente com GET; guarda cache local.
- **Arquivos relacionados:** `server/kamui-client.js`, `server/persona-cards.js`, `server/state.js`, `server/kamui-bridge.test.js`.
- **Como é acessada/usada:** endpoints de persona e workflows LUCA-AI.
- **Dependências internas:** `KAMUI_BASE`, `KAMUI_TIMEOUT_MS`, headers de caller.
- **Status:** **funcional com dependência externa**.
- **Observações técnicas:** testes verificam que o cliente nunca escreve no Yume.

### 2.20 Proxy de avatar Yume

- **Nome:** Proxy seguro de imagem.
- **Descrição:** aceita apenas paths normalizados, busca imagem via Kamui e valida `content-type`.
- **Arquivos relacionados:** `server/persona-cards.js`, `server/index.js`.
- **Como é acessada/usada:** `GET /api/personas/avatar?src=`; URLs normalizadas nos cards.
- **Dependências internas:** `normalizeYumeAvatarPath`, `buildKamuiYumeAvatarUrl`.
- **Status:** **funcional local**.
- **Observações técnicas:** rota real não aparece no catálogo de endpoints.

### 2.21 Workflow backend de personas

- **Nome:** Execução de bancada por papéis.
- **Descrição:** valida missão/equipe, carrega prompts, executa cinco etapas, paraleliza membros dentro de uma etapa e acumula contexto entre etapas.
- **Arquivos relacionados:** `server/persona-team.js`, `server/index.js`, `server/persona-team.test.js`.
- **Como é acessada/usada:** `POST /api/luca-ai/persona-team/run`.
- **Dependências internas:** Kamui, 9router, `PERSONA_WORKFLOW_ROLES`, event log.
- **Status:** **funcional local**.
- **Observações técnicas:** rota real não está no catálogo de endpoints; timeout do frontend é 180 s.

### 2.22 Catálogo de endpoints

- **Nome:** Contrato estático de APIs.
- **Descrição:** agrupa rotas por runtime, missão, agentes, heartbeat, agenda, goals e comunicação.
- **Arquivos relacionados:** `shared/endpoint-catalog.js`, `server/endpoint-catalog.js`.
- **Como é acessada/usada:** UI, agentes e auditoria de catálogo.
- **Dependências internas:** filtro por `availability`.
- **Status:** **parcial/inconsistente**.
- **Observações técnicas:** Express real: 35 rotas, catálogo local: 32; Worker real: 17, catálogo cloud: 17, mas com uma troca incorreta (`preflight` omitido e `report/mission` fantasma).

### 2.23 Catálogo de ferramentas e manifests

- **Nome:** Registro de ferramentas LUCA.
- **Descrição:** carrega JSONs, valida forma, filtra por runtime e agrega catálogos TARS/Yume como advisory não executável.
- **Arquivos relacionados:** `server/tool-catalog.js`, `shared/tool-catalog.js`, `server/tool-catalog-manifests/*.json`.
- **Como é acessada/usada:** `/api/catalog/tools` e página Ferramentas.
- **Dependências internas:** filesystem, catálogos irmãos co-localizados.
- **Status:** **parcial/quebrada nos testes**.
- **Observações técnicas:** implementação local por manifests e implementação cloud em `shared/` divergem: o manifest contém `event_flow_report`, ausente na lista compartilhada.

### 2.24 Auditoria de catálogos

- **Nome:** Verificador estático de contratos.
- **Descrição:** valida schemas, payloads e se invokes das ferramentas aparecem no catálogo de endpoints.
- **Arquivos relacionados:** `shared/catalog-audit.js`, `server/catalog-audit.js`, `server/index.js`, `worker/src/index.js`.
- **Como é acessada/usada:** `GET /api/catalog/audit`.
- **Dependências internas:** catálogos endpoint/tool.
- **Status:** **funcional dentro do modelo estático**, mas **insuficiente**.
- **Observações técnicas:** retorna nota A mesmo quando catálogo e rotas reais divergem, porque não inspeciona o roteador Express/Worker.

### 2.25 Governança e preflight

- **Nome:** Guardrails operacionais.
- **Descrição:** expõe budget padrão, ações irreversíveis, lock de concorrência, regras e prontidão de endpoints.
- **Arquivos relacionados:** `shared/governance.js`, `shared/preflight.js`, `server/index.js`, `worker/src/index.js`.
- **Como é acessada/usada:** `/api/governance`, `/api/preflight`, estado e Heartbeat.
- **Dependências internas:** eventos recentes, goals, probes e timeout de lock.
- **Status:** **funcional** nos dois runtimes.
- **Observações técnicas:** o catálogo marca governança apenas cloud apesar da rota existir no Express; marca preflight apenas local apesar de existir no Worker.

### 2.26 Worker Cloudflare e Durable Object

- **Nome:** Runtime cloud.
- **Descrição:** serve assets, processa missões, grava eventos/snapshots/jobs/goals em SQLite do Durable Object e executa lifecycle assíncrono.
- **Arquivos relacionados:** `worker/src/index.js`, `wrangler.jsonc`, `shared/*.js`.
- **Como é acessada/usada:** domínio configurado `app.luca-ai.com.br`; binding `LUCA_RUNTIME`.
- **Dependências internas:** Cloudflare Workers, Durable Object, assets `dist`, migration `v1_luca_runtime`.
- **Status:** **parcial/incerta**.
- **Observações técnicas:** não foi testado contra produção; o repo não fixa Wrangler, não possui script de deploy nem CI. Em limite/falha de storage, cai para estado transitório em memória.

### 2.27 Goals cloud

- **Nome:** Registro persistido de objetivos.
- **Descrição:** cria/lista goals com status, prioridade, budgets, definition of done, resultados e verifier.
- **Arquivos relacionados:** `shared/goals.js`, `worker/src/index.js`, `server/goals.test.js`, manifests `goal_*.json`.
- **Como é acessada/usada:** `GET/POST /api/goals` no Worker; estado aparece no Heartbeat.
- **Dependências internas:** tabela SQL `goals`, `normalizeGoalInput`, `summarizeGoals`.
- **Status:** **parcial**.
- **Observações técnicas:** não existe no Express nem no wrapper `lucaApi`; a UI apenas visualiza goals recebidos no snapshot e não cria/filtra.

### 2.28 Provider GLM e seleção de modelo cloud

- **Nome:** Cliente de modelo do Worker.
- **Descrição:** escolhe modelo por mapa/configuração e chama endpoint GLM com timeout de 120 s.
- **Arquivos relacionados:** `worker/src/index.js`, `shared/model-selector.js`, `wrangler.jsonc`, `server/model-selector.test.js`.
- **Como é acessada/usada:** lifecycle de missão cloud.
- **Dependências internas:** secret `GLM_API_KEY`, `GLM_BASE`, `GLM_MODEL_OPTIONS`, `MODEL_SELECTOR_KEY`.
- **Status:** **funcional por código/testes unitários; incerta em produção**.
- **Observações técnicas:** health expõe somente o booleano de presença do secret, não o valor.

### 2.29 Request timeout, erros e tempo brasileiro

- **Nome:** Utilitários cross-runtime.
- **Descrição:** padroniza timeout/erro HTTP/network e formatação `America/Sao_Paulo`.
- **Arquivos relacionados:** `shared/request-timeout.js`, `src/lib/requestTimeout.ts`, `src/types/shared-request-timeout.d.ts`, `shared/time.js`.
- **Como é acessada/usada:** cliente frontend, testes e serialização do estado.
- **Dependências internas:** `AbortController`, `Intl.DateTimeFormat`.
- **Status:** **funcional**.
- **Observações técnicas:** TypeScript usa bridge/declaration sobre implementação JS compartilhada.

### 2.30 Testes Node e baseline de verificação

- **Nome:** Suíte de contratos e regras.
- **Descrição:** cobre intent, fechamento, dashboard, eventos, goals, governança, Kamui, personas, scheduler, timeout, router, state e catálogos.
- **Arquivos relacionados:** `server/**/*.test.js`, `package.json`.
- **Como é acessada/usada:** `npm test`, `npm run typecheck`, `npm run build`.
- **Dependências internas:** Node test runner e TypeScript.
- **Status:** **quebrada como gate único**.
- **Observações técnicas:** 159/160 passam; falha fixa causada por catálogo TARS externo ausente. Não há testes de componente/frontend nem E2E automatizado.

### 2.31 Experimentos PraisonAI

- **Nome:** Laboratório Python de agentes.
- **Descrição:** exemplos de agente único, multiagente, tools, múltiplos modelos, reflection, workflow, memory, providers e simulação LUCA.
- **Arquivos relacionados:** `praisonai-tests/*.py`, `praisonai-tests/README.md`, `praisonai-tests/run.bat`, `PraisonAI/`.
- **Como é acessada/usada:** execução manual com Python e 9router local.
- **Dependências internas:** pacote externo `praisonaiagents`, não declarado no ecossistema Node.
- **Status:** **incerta/não conectada** ao runtime principal.
- **Observações técnicas:** sintaxe dos 13 Python files foi validada; comportamento não foi executado por exigir dependências/serviços externos.

### 2.32 Helpers de Computer Use

- **Nome:** Scripts manuais para automação de Paint/desktop.
- **Descrição:** bootstrap e helpers de demonstração Goblin para plugin Computer Use.
- **Arquivos relacionados:** `computer-use-goblin-helper.js`, `computer-use-goblin-helper-v2.js`, `COMPUTER_USE_TUDO_EM_UM.js`, `PASTE_ME_IN_NEW_CONVERSATION.js`.
- **Como é acessada/usada:** copiar/importar manualmente em outra sessão.
- **Dependências internas:** caminho absoluto de uma versão específica do plugin na máquina do autor.
- **Status:** **não conectada**.
- **Observações técnicas:** não são importados pelo app, servidor ou Worker; são frágeis a mudança de versão/caminho.

### 2.33 Scripts de assets e vídeos de marketing

- **Nome:** Ferramentas manuais de iconografia/marketing.
- **Descrição:** preview/refino de ícones e acervo de vídeos gerados.
- **Arquivos relacionados:** `scripts/preview_icons.py`, `scripts/refine_white_icons.py`, `grokimaginevideos/`, `public/`, `brand/`, `release-assets/`.
- **Como é acessada/usada:** execução manual e consumo estático de assets.
- **Dependências internas:** bibliotecas Python/arquivos locais; não há scripts NPM.
- **Status:** **parcial/não conectada como pipeline**.
- **Observações técnicas:** assets usados pelo app são funcionais; os geradores não fazem parte do build.

## 3. Funções de estrutura frontend

### 3.1 Entry point e providers

- **Nome:** Bootstrap React.
- **Descrição:** monta React 19 com tema e provider de estado.
- **Arquivos relacionados:** `src/main.tsx`, `src/App.tsx`, `index.html`.
- **Como é acessada/usada:** entry do Vite.
- **Dependências internas:** `ThemeProvider`, `LucaStateProvider`, `Layout`.
- **Status:** **funcional**.
- **Observações técnicas:** build de produção gerou bundle JS de 487,93 kB (146,35 kB gzip).

### 3.2 Layout responsivo e navegação

- **Nome:** `Layout`.
- **Descrição:** sidebar, indicador de runtime e colapso mobile.
- **Arquivos relacionados:** `src/components/Layout.tsx`, `src/App.tsx`.
- **Como é acessada/usada:** envolve todas as páginas.
- **Dependências internas:** `PageId`, `useLuca`, `useTheme`.
- **Status:** **funcional**.
- **Observações técnicas:** página é estado interno, não rota URL.

### 3.3 Provider de estado LUCA

- **Nome:** `LucaStateProvider`.
- **Descrição:** normaliza snapshots, gerencia conexão, polling adaptativo, eventos, locks, ações e erros.
- **Arquivos relacionados:** `src/hooks/useLucaState.tsx`, `src/lib/types.ts`, `src/lib/api.ts`.
- **Como é acessada/usada:** `useLuca()` por todas as páginas operacionais.
- **Dependências internas:** WebSocket local, polling cloud, `fetchState`, `lucaApi`.
- **Status:** **funcional**.
- **Observações técnicas:** arquivo de 575 linhas; expõe ações que a UI não usa (`runAgent`, `sendChatMessage`).

### 3.4 Cliente REST/WebSocket

- **Nome:** `lucaApi`.
- **Descrição:** wrappers tipados para missão, supervisor, agente, heartbeat, chat, agenda, personas, workflow e eventos.
- **Arquivos relacionados:** `src/lib/api.ts`, `src/lib/requestTimeout.ts`, `shared/request-timeout.js`.
- **Como é acessada/usada:** provider e páginas especializadas.
- **Dependências internas:** origem atual ou base da ponte local.
- **Status:** **funcional**, com cobertura de contrato **parcial**.
- **Observações técnicas:** não possui wrappers para contexto, sinal, complete, config, criação de agenda, relatórios, governança, catálogos, memória ou goals.

### 3.5 Persistência de preferências e bancada

- **Nome:** `usePersistentState`.
- **Descrição:** persiste página ativa, draft, workflow, transcript, resultado e persona ativa no `localStorage`.
- **Arquivos relacionados:** `src/hooks/usePersistentState.ts`, `src/App.tsx`, `src/pages/LucaAiPage.tsx`.
- **Como é acessada/usada:** automaticamente nos hooks de estado.
- **Dependências internas:** JSON parse/stringify e fallback.
- **Status:** **funcional**.
- **Observações técnicas:** erros de storage são silenciados; transcript local pode ficar desatualizado em relação ao backend.

### 3.6 Tema e design system

- **Nome:** Tokens LUCA e estilos globais.
- **Descrição:** paleta navy/gold, superfícies, tipografia, status, painéis, terminais e responsividade.
- **Arquivos relacionados:** `src/hooks/useTheme.tsx`, `src/index.css`, `tailwind.config.js`, `postcss.config.js`, `public/v2-design/assets/`.
- **Como é acessada/usada:** `useTheme()` e classes globais.
- **Dependências internas:** Tailwind/CSS e fontes locais.
- **Status:** **funcional**.
- **Observações técnicas:** é um tema fixo; não há alternância dark/light.

### 3.7 Composição da página Operacional

- **Nome:** `OperacionalPage`.
- **Descrição:** organiza MissionBar, AgentRail, MissionCanvas, GlobalChat e SupervisorLog.
- **Arquivos relacionados:** `src/pages/OperacionalPage.tsx` e componentes citados.
- **Como é acessada/usada:** página `operacional`.
- **Dependências internas:** provider LUCA e navegação.
- **Status:** **funcional**.
- **Observações técnicas:** é o principal fluxo integrado; QA desktop passou, QA mobile permanece incompleta.

### 3.8 Barra de missão

- **Nome:** `MissionBar`.
- **Descrição:** draft, template Sompo, submit/reset, status, lock e indicadores.
- **Arquivos relacionados:** `src/components/MissionBar.tsx`.
- **Como é acessada/usada:** topo do Operacional.
- **Dependências internas:** `useLuca`, `useRuntimeTick`, database e governança.
- **Status:** **funcional**, mobile **incerto**.
- **Observações técnicas:** registra muitos handlers pointer/mouse/touch para o mesmo botão e usa debounce manual; aumenta complexidade de interação.

### 3.9 Canvas, blocos e modal de relatório

- **Nome:** Camada de apresentação executiva.
- **Descrição:** filtra canvas interno, renderiza blocos/gráficos e exporta relatório.
- **Arquivos relacionados:** `src/components/MissionCanvas.tsx`, `DashboardBlock.tsx`, `ReportModal.tsx`, `src/lib/canvas.ts`.
- **Como é acessada/usada:** centro do Operacional.
- **Dependências internas:** `temporaryDashboard`, Recharts/CSS, clipboard e Blob download.
- **Status:** **funcional**.
- **Observações técnicas:** `isOperationalCanvas` é um filtro de segurança visual, não indicação de validade geral do dashboard.

### 3.10 Componentes de agentes

- **Nome:** Cards, trilho, terminal e cópia.
- **Descrição:** exibe agentes, estados, modal de log e controles específicos do Heartbeat.
- **Arquivos relacionados:** `src/components/AgentCard.tsx`, `AgentRail.tsx`, `AgentTerminal.tsx`, `CopyLogButton.tsx`, `src/lib/agents.ts`.
- **Como é acessada/usada:** Operacional e página Agentes.
- **Dependências internas:** estado LUCA, assets em `public/agents`/`public/icons`.
- **Status:** **funcional** para inspeção.
- **Observações técnicas:** terminal de agente normal não oferece botão de execução; só Heartbeat tem controles.

### 3.11 Comunicação e log do Supervisor

- **Nome:** `GlobalChat` e `SupervisorLog`.
- **Descrição:** feeds read-only, formatação e cópia de logs.
- **Arquivos relacionados:** `src/components/GlobalChat.tsx`, `SupervisorLog.tsx`, `src/lib/format.ts`.
- **Como é acessada/usada:** colunas laterais do Operacional.
- **Dependências internas:** mensagens/linhas do provider.
- **Status:** **funcional**.
- **Observações técnicas:** apesar do nome Chat, não há composer para o operador.

### 3.12 Página LUCA-AI

- **Nome:** Orquestrador visual de personas.
- **Descrição:** setup dos cinco papéis, execução, polling, transcript, resultado, catálogo e terminais.
- **Arquivos relacionados:** `src/pages/LucaAiPage.tsx`.
- **Como é acessada/usada:** página `luca-ai`.
- **Dependências internas:** `lucaApi`, `usePersistentState`, personas importadas.
- **Status:** **funcional com ponte/serviços externos**.
- **Observações técnicas:** maior arquivo frontend e principal candidato a decomposição.

### 3.13 Página Personas

- **Nome:** Gerência visual de personas.
- **Descrição:** busca, filtros, cards, importação/remoção e link para Yume.
- **Arquivos relacionados:** `src/pages/PersonasPage.tsx`.
- **Como é acessada/usada:** página `personas`.
- **Dependências internas:** Kamui via Express e ponte local cloud.
- **Status:** **parcial**.
- **Observações técnicas:** erro de ponte externa é tratado e exibido.

### 3.14 Página Database e helpers

- **Nome:** Explorer do estado em camadas.
- **Descrição:** tabs, itens, seções públicas, payloads e links Obsidian.
- **Arquivos relacionados:** `src/pages/DatabasePage.tsx`, `src/lib/database.ts`.
- **Como é acessada/usada:** página `database`.
- **Dependências internas:** `database` do provider.
- **Status:** **funcional como leitura**.
- **Observações técnicas:** links Obsidian dependem do protocolo/app instalado no cliente.

### 3.15 Páginas Tools e Endpoints

- **Nome:** Exploradores de contrato.
- **Descrição:** carregam catálogos, selecionam módulo/tool e mostram detalhes.
- **Arquivos relacionados:** `src/pages/ToolsPage.tsx`, `src/pages/EndpointsPage.tsx`.
- **Como é acessada/usada:** páginas `ferramentas` e `endpoints`.
- **Dependências internas:** fetch direto para `/api/catalog/*`, não o wrapper `lucaApi`.
- **Status:** **parcial** por inconsistência dos catálogos.
- **Observações técnicas:** `ToolsPage` mescla `tools` e `advisoryTools`; itens externos nunca são executáveis pela tela.

### 3.16 Página Heartbeat

- **Nome:** Painel de observabilidade.
- **Descrição:** status, agentes, eventos, governança, budgets, diagnóstico e goals recentes.
- **Arquivos relacionados:** `src/pages/HeartbeatPage.tsx`, `src/lib/format.ts`.
- **Como é acessada/usada:** página `heartbeat`.
- **Dependências internas:** snapshot público e `runHarnessSmoke`.
- **Status:** **funcional** local; **parcial** cloud.
- **Observações técnicas:** goals são somente leitura; clear agents falha no cloud por rota ausente.

### 3.17 Página Histórico

- **Nome:** Histórico/agendas.
- **Descrição:** lista agendas e missões passadas, controla agendas e abre/copia relatório.
- **Arquivos relacionados:** `src/pages/HistoricoPage.tsx`.
- **Como é acessada/usada:** página `historico`.
- **Dependências internas:** snapshot público, `lucaApi` de agenda e `buildReportText`.
- **Status:** **funcional local**, **quebrada/parcial no cloud** para agendas.
- **Observações técnicas:** criação de agenda e paginação não existem na UI.

## Matriz de APIs reais

### Express local — 35 rotas

- **Runtime/observabilidade:** `GET /api/health`, `/api/state`, `/api/events`, `/api/events/summary`, `/api/events/flows`, `/api/governance`, `/api/preflight`; `POST /api/harness/smoke`.
- **Catálogos/relatórios:** `GET /api/catalog/endpoints`, `/api/catalog/tools`, `/api/catalog/audit`, `/api/report/mission`, `/api/integrations/yume/memory-event`.
- **Missão:** `POST /api/mission/activate`, `/api/mission/context`, `/api/mission/signal`, `/api/mission/complete`, `/api/mission/reset`, `/api/mission/schedule`.
- **Agentes/personas:** `POST /api/agent/config`, `/api/agent/run`, `/api/agent/persona/add`, `/api/agent/persona/remove`, `/api/agents/clear`, `/api/luca-ai/persona-team/run`; `GET /api/personas/available`, `/api/personas/avatar`.
- **Supervisor/heartbeat/chat/agenda:** `POST /api/supervisor/start`, `/api/supervisor/pause`, `/api/heartbeat/start`, `/api/heartbeat/pause`, `/api/tools/global-chat/message`, `/api/schedule/cancel`, `/api/schedule/pause`, `/api/schedule/resume`.

### Worker cloud — 17 rotas

- `GET /api/health`, `/api/state`, `/api/governance`, `/api/preflight`, `/api/catalog/endpoints`, `/api/catalog/tools`, `/api/catalog/audit`, `/api/goals`, `/api/events`, `/api/events/summary`, `/api/events/flows`.
- `POST /api/goals`, `/api/mission/activate`, `/api/mission/reset`, `/api/heartbeat/start`, `/api/heartbeat/pause`, `/api/harness/smoke`.

### Divergência catálogo ↔ implementação

- Express reais mas não declaradas: `GET /api/governance`, `GET /api/personas/avatar`, `POST /api/luca-ai/persona-team/run`.
- Worker real mas não declarado: `GET /api/preflight`.
- Declarada como cloud, mas inexistente no Worker: `GET /api/report/mission`.

## Mapa dos principais fluxos do sistema

### Fluxo local de missão

```text
MissionBar/Landing
  -> POST /api/mission/activate
  -> lock + startNewMissionScope + createRun
  -> classificar intent
     -> dashboard_build: Transformador -> Planejador/Pesquisador -> Supervisor -> Designer -> closure
     -> chat_only: agentes publicam no chat -> closure
     -> agent_conversation: Supervisor <-> Pesquisador por turnos -> closure
  -> persistir .luca + event log
  -> emitir WebSocket
  -> LucaStateProvider
  -> Canvas/Chat/Terminais/Histórico
```

### Fluxo cloud

```text
Frontend
  -> Worker /api/mission/activate (202)
  -> LucaRuntime Durable Object
  -> SQLite: eventos + snapshots + mission_jobs + goals
  -> GLM
  -> snapshot público por polling
  -> fallback transitório em memória se storage falhar
```

### Personas e bancada LUCA-AI

```text
PersonasPage/LucaAiPage
  -> ponte Express local (direto no local; 127.0.0.1:4242 no cloud)
  -> Kamui GET
  -> Yume personas/system-prompt/version
  -> cache em .luca
  -> workflow de 5 papéis
  -> 9router por persona
  -> eventos por traceId + transcript/resultado na UI
```

### Histórico e relatório

```text
closure/reset
  -> missionHistory + dashboard + finalReport + chat + evidence
  -> snapshot compacto
  -> Histórico/ReportModal
  -> copiar ou baixar Markdown

API local alternativa:
  GET /api/report/mission
  -> buildMissionReport + eventFlows
```

### Agenda

```text
POST /api/mission/schedule (API/tool; sem formulário UI)
  -> scheduledMissions
  -> tick a cada 15s
  -> missionQueue
  -> activateMissionInternal quando livre
  -> Histórico permite pause/resume/cancel
```

## Dependências principais

### Runtime raiz

- React 19.1.1, React DOM 19.1.1, Vite resolvido em 7.3.2, TypeScript 5.9.3.
- Tailwind CSS 3.4.17, PostCSS, Autoprefixer.
- Framer Motion 12, Lucide React, Recharts 3.8.1.
- Express 5.2.1, `ws` resolvido em 8.20.0, Node fetch/HTTP/test runner.

### Site separado

- Three.js 0.178 e Vite próprios em `site/package.json`.

### Infraestrutura externa

- 9router OpenAI-compatible em `127.0.0.1:20128/v1` por padrão.
- Kamui em `127.0.0.1:1338`, com leitura de Yume.
- Dashboard Yume em `127.0.0.1:2222` para o botão de criação.
- Cloudflare Workers/Durable Objects e secret `GLM_API_KEY`.
- Python 3 para heartbeat; `praisonaiagents` para experimentos.
- Obsidian para links `obsidian://`.

### Persistência

- Local: `.luca/system-state.json`, `.luca/runtime-events.jsonl`, `heartbeat-report.json`.
- Cloud: SQLite do Durable Object para eventos, snapshots, jobs e goals.
- Cliente: `localStorage` para página e bancada LUCA-AI.

## Pontos críticos, riscos e inconsistências

| Prioridade | Finding | Evidência | Impacto | Esforço | Confiança |
| --- | --- | --- | --- | --- | --- |
| P0 | APIs mutáveis sem autenticação, CORS `*` e Express em `0.0.0.0` | `server/index.js:112-126`, `server/index.js:2755`, `worker/src/index.js:41-44` | Qualquer origem/rede que alcance o runtime pode iniciar/resetar missões, controlar supervisor/heartbeat, alterar agentes e ler estado/eventos. | M/L | Alta |
| P0 | `ws` com advisories de alta severidade | `package-lock.json:3959`, `package.json` | Risco de disclosure de memória e DoS segundo `npm audit`; o WebSocket é parte do caminho principal local. | S | Alta |
| P1 | Gate `npm test` está vermelho por dependência em checkout irmão | `server/tool-catalog.js:4-14`, `server/tool-catalog.test.js:29` | CI/validação local não produz baseline verde fora da máquina que contém TARS. | S | Alta |
| P1 | Catálogo não corresponde às rotas reais e a auditoria dá falso “A” | `shared/endpoint-catalog.js:24-26,177`, rotas em `server/index.js:2156,2336,2382`, `worker/src/index.js:2321` | Consumidores recebem rota cloud inexistente e não descobrem rotas reais; o self-check não detecta. | M | Alta |
| P1 | Contratos local/cloud divergem | `server/intent.js:12-53`, `worker/src/index.js:1403-1430`; matriz de rotas acima | A mesma UI apresenta ações que retornam 404 no cloud e a mesma missão pode seguir fluxo diferente. | L | Alta |
| P1 | Express aceita missão vazia pela API | `server/index.js:2014-2072` versus `worker/src/index.js:2132-2143` | Clientes externos podem criar run sem briefing/sucesso, gerando lixo operacional e chamadas LLM sem objetivo. | S | Alta |
| P1 | Persistência local pode perder estado silenciosamente | `server/state.js:76-126` | JSON truncado ou falha de escrita reinicia em estado inicial sem diagnóstico; escrita não é atômica. | M | Alta |
| P1 | Não há autenticação/tenant no WebSocket | `server/index.js:129,291-303,2750-2753` | Todo cliente conectado recebe todo o snapshot e eventos; não serve para exposição multiusuário. | M/L | Alta |
| P1 | Sem testes frontend/E2E e QA visual incompleta | `package.json`, `DocsDev/arquivados/qa/qa-browser-loop.md:16-36` (histórico) | Regressões de interação, responsividade e rotas cloud não são bloqueadas automaticamente. | M/L | Alta |
| P2 | Estado/event log usam I/O síncrono em hot paths | `server/state.js:108-126`, `server/event-log.js:106-125` | Bloqueia o event loop sob volume; aceitável para desktop, inadequado para concorrência. | M | Alta |
| P2 | Monólitos concentram regras e UI | `server/index.js` (2.561 linhas), `worker/src/index.js` (2.321), `src/pages/LucaAiPage.tsx` (1.667) | Alto custo de mudança, revisão e paridade; maior risco de regressão cruzada. | L | Alta |
| P2 | Duplicação de intent/closure/tool catalog | `server/intent.js`, `worker/src/index.js`, `shared/mission-intent.js`, `server/closure.js`, `shared/closure-review.js`, `server/tool-catalog.js`, `shared/tool-catalog.js` | Correções precisam ser replicadas e já há comportamento divergente. | L | Alta |
| P2 | RepoContext aponta para arquivos frontend inexistentes | `server/index.js:185-191` | Missões que analisam a própria repo recebem `src/main.jsx`/`src/styles.css` como indisponíveis em vez de `src/main.tsx`/`src/index.css`. | S | Alta |
| P2 | Cloud sem fluxo de build/deploy reproduzível | `docs/operacao.md`, `package.json`, `wrangler.jsonc` | Não há script de deploy, CI, staging ou Wrangler fixado; validação depende de ferramenta global/manual. | M | Alta |
| P2 | Operações client-side expostas mas sem UI | `src/hooks/useLucaState.tsx:128-160,485-606`, `src/components/GlobalChat.tsx`, `src/components/AgentTerminal.tsx` | Inventário aparente e API sugerem execução/chat manual, mas usuário comum não consegue acioná-los. | S/M | Alta |
| P3 | Site, Computer Use e PraisonAI são ilhas de código | `site/`, helpers raiz, `praisonai-tests/` | Aumentam superfície de manutenção e confundem o produto principal sem integração/build comum. | S | Alta |

### Outros achados de dependência

- `body-parser@2.2.2` e `qs@6.15.1` também aparecem no audit; `qs` foi classificado como moderado. O relatório do audit indicou correção disponível via atualização de lockfile.
- `package.json` usa ranges; o lock resolveu versões acima dos mínimos declarados (`vite@7.3.2`, `@vitejs/plugin-react@5.2.0`).
- O build raiz passa, mas não testa o build do diretório `site/` nem o bundle do Worker.

## Próximos passos recomendados

1. **Fechar a fronteira de segurança:** autenticação/autorização para API e WebSocket, allowlist de origens, bind local configurável e política específica para produção cloud. Tratar local desktop e domínio público como perfis distintos.
2. **Atualizar dependências vulneráveis e reexecutar os gates:** corrigir `ws` primeiro; registrar versões resultantes e `npm audit` limpo para high/critical.
3. **Restabelecer baseline verde de testes:** tornar os catálogos TARS/Yume fixtures explícitas nos testes ou opcionais; não depender de checkouts irmãos reais.
4. **Criar teste automático de paridade:** extrair rotas reais de Express/Worker e comparar com `shared/endpoint-catalog.js`; incluir também wrappers frontend e disponibilidade local/cloud.
5. **Definir produto cloud:** esconder/desabilitar ações local-only na UI cloud ou implementar endpoints equivalentes. Priorizar Supervisor, agente manual, chat, agendas, report e personas.
6. **Unificar intent, closure e catálogos:** mover regras comuns para `shared/` e manter adaptadores finos por runtime; eliminar versões divergentes.
7. **Fortalecer persistência local:** escrita atômica `temp + fsync/rename`, backup/recuperação, logs de falha e validação do schema carregado.
8. **Adicionar testes de integração e frontend:** API Express sem subir serviços externos, componentes críticos e E2E para Operacional/Heartbeat/Histórico; incluir matriz local/cloud e mobile.
9. **Corrigir superfícies desconectadas:** ou conectar composer de chat, execução manual, config de agente, criação de agenda/contexto/sinais/goals, ou remover wrappers/claims para não prometer função inexistente.
10. **Decompor os três monólitos com testes de caracterização primeiro:** rotas Express por domínio, serviços Worker por storage/lifecycle/API e subcomponentes da bancada LUCA-AI.
11. **Tornar cloud reproduzível:** fixar Wrangler, adicionar scripts de dry-run/build/validate, documentar secret/bindings e criar CI sem deploy automático.
12. **Decidir o destino das ilhas:** integrar, mover para pacote/documentação de exemplos ou arquivar `site/`, Computer Use, PraisonAI e geradores de assets.

## Ordem de dependência sugerida

```text
baseline de testes + segurança
  -> paridade catálogo/rotas
  -> contrato único local/cloud
  -> testes de integração/frontend
  -> decomposição dos monólitos
  -> novas superfícies de UI e evolução de storage
```

## O que não foi validado

- Deploy e estado real de `app.luca-ai.com.br`/Durable Object.
- Chamadas reais ao 9router, GLM, Kamui e Yume.
- Execução comportamental dos exemplos PraisonAI.
- QA visual completa de todas as páginas e breakpoints.
- Build separado de `site/` e deploy Worker com Wrangler.

