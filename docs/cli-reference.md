# Referência de comandos LUCA

Gerada por `npm run cli:docs` a partir de `cli/catalog.js`. Não editar à mão.

114 comandos; 93 rotas HTTP distintas. [Instalação, receitas e contrato](cli.md). Todos aceitam `--help`; descoberta estruturada em `luca commands [prefixo]`.

IDs são argumentos posicionais. Campos comuns podem ser flags; corpos completos usam `--data @arquivo.json`. Flags prevalecem sobre o corpo; objetos aninhados não são mesclados. Campos string são literais; apenas campos JSON e `--data` interpretam `@arquivo`/`-`.

### `health`

Saúde e versão do servidor.

`GET /api/health`; autenticação: **none**.

Nenhum; consulte a descrição para entradas por `--data`.

### `state`

Estado completo da conta; aceita --watch.

`GET /api/state`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `preflight`

Diagnóstico das integrações e do runtime.

`GET /api/preflight`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `governance`

Governança da missão.

`GET /api/governance`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `models`

Modelos e capacidades do roteador.

`GET /api/router/models`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `catalog endpoints`

Catálogo do runtime: endpoints.

`GET /api/catalog/endpoints`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `catalog tools`

Catálogo do runtime: tools.

`GET /api/catalog/tools`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `catalog audit`

Catálogo do runtime: audit.

`GET /api/catalog/audit`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `events list`

Eventos: list; --watch emite snapshots NDJSON.

`GET /api/events`; autenticação: **session**.

`--limit` (number)<br>`--type` (string)<br>`--mission-id` (string)<br>`--goal-id` (string)<br>`--trace-id` (string)

### `events summary`

Eventos: summary; --watch emite snapshots NDJSON.

`GET /api/events/summary`; autenticação: **session**.

`--limit` (number)<br>`--type` (string)<br>`--mission-id` (string)<br>`--goal-id` (string)<br>`--trace-id` (string)

### `events flows`

Eventos: flows; --watch emite snapshots NDJSON.

`GET /api/events/flows`; autenticação: **session**.

`--limit` (number)<br>`--type` (string)<br>`--mission-id` (string)<br>`--goal-id` (string)<br>`--trace-id` (string)

### `harness smoke`

Executar smoke do runtime (pode alterar estado/chamar integrações).

`POST /api/harness/smoke`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `auth session`

Usuário e impersonação da sessão atual.

`GET /api/auth/session`; autenticação: **none**.

Nenhum; consulte a descrição para entradas por `--data`.

### `auth register`

Criar conta e salvar sessão no perfil.

`POST /api/auth/register`; autenticação: **none**.

`--name` (string, obrigatório)<br>`--email` (string, obrigatório)

Exemplo: `luca auth register --name Agente --email agente@example.test --password-stdin`

### `auth login`

Entrar e salvar sessão no perfil.

`POST /api/auth/login`; autenticação: **none**.

`--email` (string, obrigatório)

Exemplo: `luca auth login --email agente@example.test --password-stdin`

### `auth logout`

Revogar sessão atual e apagar cookie do perfil.

`POST /api/auth/logout`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `auth stop-impersonation`

Voltar à conta admin.

`POST /api/auth/stop-impersonation`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `profile list`

Listar perfis sem expor sessões.

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.

### `profile show`

Mostrar perfil efetivo sem expor sessão.

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.

### `profile set <name>`

Salvar URL de um perfil; troca de origem apaga a sessão.

Comando local, sem iniciar o runtime.

`--url` (string, obrigatório): Origem HTTP(S)

### `profile use <name>`

Selecionar perfil padrão.

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.

### `profile delete <name>`

Apagar perfil local (não revoga sessão no servidor).

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.

### `mission activate`

Criar e ativar missão.

`POST /api/mission/activate`; autenticação: **session**.

`--title` (string)<br>`--description` (string, obrigatório): Objetivo da missão<br>`--success` (string)<br>`--context` (json)

Exemplo: `luca mission activate --title Revisão --description "Revisar o plano"`

### `mission context`

Atualizar contexto da missão.

`POST /api/mission/context`; autenticação: **session**.

`--context` (json, obrigatório)

### `mission signal`

Adicionar sinal à missão.

`POST /api/mission/signal`; autenticação: **session**.

`--label` (string)<br>`--value` (json)<br>`--unit` (string)<br>`--note` (string)<br>`--severity` (string)<br>`--source` (string)

### `mission complete`

Solicitar encerramento; --force pula revisão.

`POST /api/mission/complete`; autenticação: **session**.

`--force` (boolean)

### `mission reset`

Resetar missão ativa e seu estado.

`POST /api/mission/reset`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `mission report`

Relatório da missão atual ou arquivada.

`GET /api/report/mission`; autenticação: **session**.

`--mission-id` (string)

### `mission memory-event`

Ler evento de memória; não escreve no Yume.

`GET /api/integrations/yume/memory-event`; autenticação: **session**.

`--mission-id` (string)

### `schedule list`

Agendamentos e fila da conta.

`GET /api/state`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `schedule create`

Agendar missão.

`POST /api/mission/schedule`; autenticação: **session**.

`--title` (string)<br>`--description` (string, obrigatório): Objetivo da missão<br>`--success` (string)<br>`--schedule-name` (string)<br>`--interval-value` (number)<br>`--interval-ms` (number)<br>`--interval-unit` (string): minutes, hours ou days<br>`--total-runs` (string): Número de execuções ou infinite<br>`--start-immediately` (boolean)

### `schedule cancel <scheduleId>`

cancel agendamento.

`POST /api/schedule/cancel`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `schedule pause <scheduleId>`

pause agendamento.

`POST /api/schedule/pause`; autenticação: **session**.

`--reason` (string)

### `schedule resume <scheduleId>`

resume agendamento.

`POST /api/schedule/resume`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `agents list`

Agentes e personas importadas.

`GET /api/state`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `agents config <agentId>`

Alterar modelo/habilitação de agente.

`POST /api/agent/config`; autenticação: **session**.

`--enabled` (boolean)<br>`--model` (string)

### `agents run <agentId>`

Executar agente na missão ativa.

`POST /api/agent/run`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `agents clear`

Limpar terminais e conversas dos agentes.

`POST /api/agents/clear`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `supervisor start`

start supervisor.

`POST /api/supervisor/start`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `supervisor pause`

pause supervisor.

`POST /api/supervisor/pause`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `heartbeat start`

start heartbeat.

`POST /api/heartbeat/start`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `heartbeat pause`

pause heartbeat.

`POST /api/heartbeat/pause`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `personas list`

Personas disponíveis, lidas do Kamui/Yume.

`GET /api/personas/available`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `personas avatar`

Baixar avatar por caminho do Yume.

`GET /api/personas/avatar`; autenticação: **session**.

`--src` (string, obrigatório)

### `personas add <slug>`

add persona no workspace.

`POST /api/agent/persona/add`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `personas remove <slug>`

remove persona no workspace.

`POST /api/agent/persona/remove`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `chat library`

Biblioteca de sessões e pastas.

`GET /api/luca-ai/chat/library`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `chat message`

Publicar mensagem no chat global da missão.

`POST /api/tools/global-chat/message`; autenticação: **session**.

`--content` (string, obrigatório)<br>`--agent-id` (string)<br>`--type` (string)

### `chat folders create`

Criar pasta.

`POST /api/luca-ai/chat/folders`; autenticação: **session**.

`--name` (string, obrigatório)

### `chat folders rename <folderId>`

Renomear pasta.

`PATCH /api/luca-ai/chat/folders/:folderId`; autenticação: **session**.

`--name` (string, obrigatório)

### `chat folders delete <folderId>`

Apagar pasta; --cascade-sessions inclui sessões.

`DELETE /api/luca-ai/chat/folders/:folderId`; autenticação: **session**.

`--cascade-sessions` (boolean)

### `chat sessions create`

Criar sessão.

`POST /api/luca-ai/chat/sessions`; autenticação: **session**.

`--title` (string)<br>`--folder-id` (string)<br>`--seed-from-active` (boolean)

### `chat sessions get <sessionId>`

Ler sessão e transcrição.

`GET /api/luca-ai/chat/sessions/:sessionId`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `chat sessions update <sessionId>`

Editar sessão; --data aceita o patch completo.

`PATCH /api/luca-ai/chat/sessions/:sessionId`; autenticação: **session**.

`--title` (string)<br>`--folder-id` (json): String JSON ou null<br>`--operation-mode` (string)<br>`--workflow-assignments` (json)<br>`--individual-assignments` (json)<br>`--mission-draft` (string)<br>`--draft-attachments` (json)<br>`--transcript` (json)<br>`--append-transcript` (json)<br>`--final-result` (json)<br>`--visual-pack` (json)<br>`--mission-ledger` (json)<br>`--mission-domain` (string)<br>`--mission-domain-override` (boolean)<br>`--active-persona-slug` (string)<br>`--active-persona-run` (json)

### `chat sessions activate <sessionId>`

Ativar sessão no workspace.

`POST /api/luca-ai/chat/sessions/:sessionId/activate`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `chat sessions delete <sessionId>`

Remover sessão da biblioteca (soft delete).

`DELETE /api/luca-ai/chat/sessions/:sessionId`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `chat attachments upload <sessionId>`

Enviar arquivo binário.

`POST /api/luca-ai/chat/sessions/:sessionId/attachments`; autenticação: **session**.

`--file` (string, obrigatório): Arquivo local<br>`--mime` (string): MIME opcional

### `chat attachments get <sessionId> <attachmentId>`

Baixar anexo.

`GET /api/luca-ai/chat/sessions/:sessionId/attachments/:attachmentId`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `chat attachments delete <sessionId> <attachmentId>`

Apagar anexo.

`DELETE /api/luca-ai/chat/sessions/:sessionId/attachments/:attachmentId`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `chat share get <sessionId>`

get link público da sessão.

`GET /api/luca-ai/chat/sessions/:sessionId/share`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `chat share create <sessionId>`

create link público da sessão.

`POST /api/luca-ai/chat/sessions/:sessionId/share`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `chat share revoke <sessionId>`

revoke link público da sessão.

`DELETE /api/luca-ai/chat/sessions/:sessionId/share`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `share get <token>`

Ler compartilhamento público.

`GET /api/public/share/:token`; autenticação: **none**.

Nenhum; consulte a descrição para entradas por `--data`.

### `share artifact <token> <traceId> <artifactId>`

Baixar artefato público.

`GET /api/public/share/:token/artifacts/:traceId/:artifactId`; autenticação: **none**.

Nenhum; consulte a descrição para entradas por `--data`.

### `artifacts get <traceId> <artifactId>`

Baixar artefato visual da conta.

`GET /api/luca-ai/visual-artifacts/:traceId/:artifactId`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `templates list`

Listar templates.

`GET /api/luca-ai/team-templates`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `templates create`

Criar template de equipe/individual.

`POST /api/luca-ai/team-templates`; autenticação: **session**.

`--kind` (string, obrigatório): team ou individual<br>`--template` (json, obrigatório)

### `templates update <kind> <id>`

Editar template.

`PUT /api/luca-ai/team-templates/:kind/:id`; autenticação: **session**.

`--template` (json, obrigatório)

### `templates delete <kind> <id>`

Excluir template.

`DELETE /api/luca-ai/team-templates/:kind/:id`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `templates reorder <kind>`

Reordenar todos os IDs do tipo.

`PUT /api/luca-ai/team-templates/:kind/order`; autenticação: **session**.

`--ids` (list, obrigatório): IDs separados por vírgula

### `team run`

Iniciar rodada; --wait aguarda resultado.

`POST /api/luca-ai/persona-team/run`; autenticação: **session**.

`--mission` (string)<br>`--slugs` (list)<br>`--mode` (string): parallel, workflow ou individual<br>`--judge-slug` (string)<br>`--visual-slug` (string)<br>`--depth` (number)<br>`--workflow` (json)<br>`--model-overrides` (json)<br>`--session-id` (string)<br>`--attachment-ids` (list)<br>`--trace-id` (string)<br>`--domain` (string)<br>`--domain-override` (boolean)

Exemplo: `luca team run --mission "Avaliar o plano" --slugs arquiteto,revisor --wait`

### `team status <runId>`

Consultar ou retomar rodada com --wait.

`GET /api/luca-ai/persona-team/runs/:runId`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `deliberations create`

Enviar ContextBundle v1; --wait aguarda parecer.

`POST /api/deliberations`; autenticação: **session-or-machine**.

`--schema` (string)<br>`--objective` (string, obrigatório)<br>`--constraints` (list)<br>`--operator-notes` (string)<br>`--team` (json, obrigatório)<br>`--artifacts` (json)<br>`--trace-id` (string)

### `deliberations get <deliberationId>`

Consultar parecer ou retomar espera.

`GET /api/deliberations/:deliberationId`; autenticação: **session-or-machine**.

Nenhum; consulte a descrição para entradas por `--data`.

### `sompo telemetry`

Telemetria atual do ESP32.

`GET /api/sompo/telemetry`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `sompo fleet`

Frota, safra e indicadores registrados.

`GET /api/sompo/telemetry/fleet`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `sompo history`

Histórico da telemetria.

`GET /api/sompo/telemetry/history`; autenticação: **session**.

`--fonte` (string): firebase ou simulacao<br>`--trator` (string)<br>`--janela-min` (number)

### `sompo export`

Exportar CSV/JSON para laboratório.

`GET /api/sompo/telemetry/export`; autenticação: **session**.

`--fonte` (string): firebase ou simulacao<br>`--trator` (string)<br>`--janela-min` (number)<br>`--format` (string): csv ou json<br>`--episode-id` (string)

### `sompo simulation record`

Gravar amostras declaradas de simulação.

`POST /api/sompo/telemetry/simulation`; autenticação: **session**.

`--samples` (json, obrigatório)<br>`--episode-id` (string)

### `sompo episodes start`

Iniciar episódio de simulação.

`POST /api/sompo/telemetry/episode`; autenticação: **session**.

`--kind` (string, obrigatório): colisao ou roteiro<br>`--trator` (string)<br>`--scenario-label` (string)<br>`--scenario-id` (string)<br>`--outcome-id` (string)

### `sompo episodes get <publicId>`

Ler episódio, resumo e frames.

`GET /api/sompo/telemetry/episode/:publicId`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `sompo episodes finish <publicId>`

Fechar episódio.

`POST /api/sompo/telemetry/episode/:publicId/finish`; autenticação: **session**.

`--status` (string): complete ou aborted

### `sompo episodes frames upload <publicId>`

Enviar frames com dataUrl, offsetMs, fase e label.

`POST /api/sompo/telemetry/episode/:publicId/frames`; autenticação: **session**.

`--frames` (json, obrigatório)

### `sompo episodes frames get <publicId> <seq>`

Baixar frame do episódio.

`GET /api/sompo/telemetry/episode/:publicId/frames/:seq`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `sompo risk list`

Avaliações registradas.

`GET /api/sompo/risk`; autenticação: **session**.

`--trator` (string)<br>`--fonte` (string)

### `sompo risk assess`

Calcular e registrar avaliação de risco.

`POST /api/sompo/risk`; autenticação: **session**.

`--source-kind` (string, obrigatório): simulation ou firebase<br>`--raw` (json)<br>`--context` (json, obrigatório)

### `lab cases list`

Listar casos do laboratório.

`GET /api/lab/cases`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `lab cases create`

Importar caso JSON com rawCsv e sourceName.

`POST /api/lab/cases`; autenticação: **session**.

`--name` (string)<br>`--source-name` (string, obrigatório)<br>`--raw-csv` (string, obrigatório)<br>`--metadata` (json)<br>`--map` (json)<br>`--schema` (json)

### `lab cases import`

Importar diretamente de arquivo CSV.

`POST /api/lab/cases`; autenticação: **session**.

`--csv` (string, obrigatório): Arquivo CSV<br>`--metadata` (json): Manifest JSON ou @arquivo<br>`--map` (json): GeoJSON ou @arquivo<br>`--schema` (json): Dicionário JSON ou @arquivo<br>`--name` (string)

### `lab cases get <id>`

Ler caso, versões de análises e conclusões.

`GET /api/lab/cases/:id`; autenticação: **session**.

Nenhum; consulte a descrição para entradas por `--data`.

### `lab cases analyze <id>`

Investigar caso com IA (síncrono; timeout ajustável).

`POST /api/lab/cases/:id/analyses`; autenticação: **session**.

`--focus` (string)

### `lab cases conclude <id>`

Registrar conclusão e revisão de hipóteses.

`POST /api/lab/cases/:id/conclusions`; autenticação: **session**.

`--observations` (string, obrigatório)<br>`--category` (string, obrigatório): operational, mechanical, environmental, combined ou inconclusive<br>`--action` (string, obrigatório)<br>`--hypothesis-reviews` (json)

### `admin overview`

Visão geral administrativa.

`GET /api/admin/overview`; autenticação: **admin**.

Nenhum; consulte a descrição para entradas por `--data`.

### `admin users list`

Listar contas e uso.

`GET /api/admin/users`; autenticação: **admin**.

`--search` (string)<br>`--sort` (string)

### `admin report`

Relatório administrativo.

`GET /api/admin/report`; autenticação: **admin**.

`--limit` (number)

### `admin users library <userId>`

Biblioteca da conta para suporte.

`GET /api/admin/users/:userId/chat/library`; autenticação: **admin**.

Nenhum; consulte a descrição para entradas por `--data`.

### `admin users session <userId> <sessionId>`

Transcrição da conta para suporte.

`GET /api/admin/users/:userId/chat/sessions/:sessionId`; autenticação: **admin**.

Nenhum; consulte a descrição para entradas por `--data`.

### `admin users impersonate <userId>`

Entrar na conta para suporte; atualiza sessão local.

`POST /api/admin/users/:userId/impersonate`; autenticação: **admin**.

Nenhum; consulte a descrição para entradas por `--data`.

### `admin personas list`

Catálogo administrativo de personas.

`GET /api/admin/personas`; autenticação: **admin**.

Nenhum; consulte a descrição para entradas por `--data`.

### `admin personas set <slug>`

Editar override local do catálogo, sem escrever no Yume.

`PUT /api/admin/personas/:slug`; autenticação: **admin**.

`--model` (string)<br>`--visible` (boolean)<br>`--name` (string)<br>`--description` (string)<br>`--purpose` (string)<br>`--system-prompt` (string)<br>`--avatar-url` (string)

### `admin personas reset <slug>`

Remover override local.

`DELETE /api/admin/personas/:slug`; autenticação: **admin**.

Nenhum; consulte a descrição para entradas por `--data`.

### `lab inspect`

Validar CSV e calcular eventos, offline.

Comando local, sem iniciar o runtime.

`--csv` (string, obrigatório): Arquivo CSV<br>`--metadata` (json): Manifest JSON ou @arquivo<br>`--map` (json): GeoJSON ou @arquivo<br>`--schema` (json): Dicionário JSON ou @arquivo

### `lab replay`

Reconstruir leitura no instante escolhido, offline.

Comando local, sem iniciar o runtime.

`--csv` (string, obrigatório): Arquivo CSV<br>`--metadata` (json): Manifest JSON ou @arquivo<br>`--map` (json): GeoJSON ou @arquivo<br>`--schema` (json): Dicionário JSON ou @arquivo<br>`--elapsed-ms` (number, obrigatório)

### `lab convert`

Converter dataset SOMPO JSON (--data) em CSV, offline.

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.

### `lab report`

Relatório HTML do caso salvo (--data); mesmo relatório do painel.

Comando local, sem iniciar o runtime.

`--author` (string, obrigatório): Responsável pela exportação

### `sompo scenarios`

Listar cenários e desfechos rodoviários/agrícolas.

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.

### `sompo simulate`

Gerar snapshot/brief de cenário sem gravar no servidor.

Comando local, sem iniciar o runtime.

`--scenario` (string, obrigatório): ID de sompo scenarios<br>`--outcome` (string): ID do desfecho<br>`--elapsed-ms` (number): Instante desde o começo, em ms

### `sompo normalize`

Normalizar telemetria raw; --data @arquivo é obrigatório.

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.

### `sompo risk calculate`

Avaliar snapshot local; --data {snapshot,context}.

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.

### `geofence evaluate`

Avaliar proximidade; --data {position,rules,polygons,machine}.

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.

### `sensor scenarios`

Listar ensaios e parâmetros da física MEMS.

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.

### `sensor sample`

Leitura física determinística; não renderiza 3D.

Comando local, sem iniciar o runtime.

`--scenario` (string, obrigatório)<br>`--parameter` (number)<br>`--time` (number): Tempo em segundos

### `drowsiness evaluate`

Reproduzir observações de olhos; sem câmera/inferência/som.

Comando local, sem iniciar o runtime.

`--sensitivity` (string): low, normal ou high

### `api <method> <path>`

Requisição para rota /api/ na origem selecionada.

Comando local, sem iniciar o runtime.

Nenhum; consulte a descrição para entradas por `--data`.
