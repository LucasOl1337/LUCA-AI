// The command contract drives help, JSON discovery and request construction.
// No runtime/server imports: discovery must work offline, before npm ci.
const field = (name, type = 'string', description = '', required = false, key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())) => ({ name, key, type, description, required });
const s = (name, description = '', required = false, key) => field(name, 'string', description, required, key);
const j = (name, description = '', required = false, key) => field(name, 'json', description, required, key);
const n = (name, description = '', required = false, key) => field(name, 'number', description, required, key);
const b = (name, description = '', key) => field(name, 'boolean', description, false, key);
const csv = (name, description = '', required = false, key) => field(name, 'list', description, required, key);
const cmd = (name, method, path, description, fields = [], extra = {}) => ({
  name, method, path, description, fields, auth: 'session', ...extra,
});
const local = (name, description, fields = [], extra = {}) => cmd(name, null, null, description, fields, { auth: 'none', ...extra });
const chat = '/api/luca-ai/chat';
const templates = '/api/luca-ai/team-templates';
const telemetry = '/api/sompo/telemetry';
const events = [n('limit'), s('type'), s('mission-id'), s('goal-id'), s('trace-id')];
const history = [s('fonte', 'firebase ou simulacao'), s('trator'), n('janela-min')];
const mission = [s('title'), s('description', 'Objetivo da missão', true), s('success'), j('context')];
const labFiles = [s('csv', 'Arquivo CSV', true), j('metadata', 'Manifest JSON ou @arquivo'), j('map', 'GeoJSON ou @arquivo'), j('schema', 'Dicionário JSON ou @arquivo')];
const scenario = [s('scenario', 'ID de sompo scenarios', true), s('outcome', 'ID do desfecho'), n('elapsed-ms', 'Instante desde o começo, em ms')];

export const commands = [
  cmd('health', 'GET', '/api/health', 'Saúde e versão do servidor', [], { auth: 'none' }),
  cmd('state', 'GET', '/api/state', 'Estado completo da conta; aceita --watch'),
  cmd('preflight', 'GET', '/api/preflight', 'Diagnóstico das integrações e do runtime'),
  cmd('governance', 'GET', '/api/governance', 'Governança da missão'),
  cmd('models', 'GET', '/api/router/models', 'Modelos e capacidades do roteador'),
  ...['endpoints', 'tools', 'audit'].map(kind => cmd(`catalog ${kind}`, 'GET', `/api/catalog/${kind}`, `Catálogo do runtime: ${kind}`)),
  ...['list', 'summary', 'flows'].map(kind => cmd(`events ${kind}`, 'GET', `/api/events${kind === 'list' ? '' : `/${kind}`}`, `Eventos: ${kind}; --watch emite snapshots NDJSON`, events)),
  cmd('harness smoke', 'POST', '/api/harness/smoke', 'Executar smoke do runtime (pode alterar estado/chamar integrações)'),

  cmd('auth session', 'GET', '/api/auth/session', 'Usuário e impersonação da sessão atual', [], { auth: 'none' }),
  cmd('auth register', 'POST', '/api/auth/register', 'Criar conta e salvar sessão no perfil', [s('name', '', true), s('email', '', true)], { auth: 'none', credentials: true, example: 'auth register --name Agente --email agente@example.test --password-stdin' }),
  cmd('auth login', 'POST', '/api/auth/login', 'Entrar e salvar sessão no perfil', [s('email', '', true)], { auth: 'none', credentials: true, example: 'auth login --email agente@example.test --password-stdin' }),
  cmd('auth logout', 'POST', '/api/auth/logout', 'Revogar sessão atual e apagar cookie do perfil'),
  cmd('auth stop-impersonation', 'POST', '/api/auth/stop-impersonation', 'Voltar à conta admin'),
  local('profile list', 'Listar perfis sem expor sessões'),
  local('profile show', 'Mostrar perfil efetivo sem expor sessão'),
  local('profile set', 'Salvar URL de um perfil; troca de origem apaga a sessão', [s('url', 'Origem HTTP(S)', true)], { args: ['name'] }),
  local('profile use', 'Selecionar perfil padrão', [], { args: ['name'] }),
  local('profile delete', 'Apagar perfil local (não revoga sessão no servidor)', [], { args: ['name'] }),

  cmd('mission activate', 'POST', '/api/mission/activate', 'Criar e ativar missão', mission, { example: 'mission activate --title Revisão --description "Revisar o plano"' }),
  cmd('mission context', 'POST', '/api/mission/context', 'Atualizar contexto da missão', [j('context', '', true)]),
  cmd('mission signal', 'POST', '/api/mission/signal', 'Adicionar sinal à missão', [s('label'), j('value'), s('unit'), s('note'), s('severity'), s('source')]),
  cmd('mission complete', 'POST', '/api/mission/complete', 'Solicitar encerramento; --force pula revisão', [b('force')]),
  cmd('mission reset', 'POST', '/api/mission/reset', 'Resetar missão ativa e seu estado'),
  cmd('mission report', 'GET', '/api/report/mission', 'Relatório da missão atual ou arquivada', [s('mission-id')]),
  cmd('mission memory-event', 'GET', '/api/integrations/yume/memory-event', 'Ler evento de memória; não escreve no Yume', [s('mission-id')]),
  cmd('schedule list', 'GET', '/api/state', 'Agendamentos e fila da conta', [], { select: ['scheduledMissions', 'missionQueue'] }),
  cmd('schedule create', 'POST', '/api/mission/schedule', 'Agendar missão', mission.filter(f => f.name !== 'context').concat([s('schedule-name'), n('interval-value'), n('interval-ms'), s('interval-unit', 'minutes, hours ou days'), s('total-runs', 'Número de execuções ou infinite'), b('start-immediately')])),
  ...['cancel', 'pause', 'resume'].map(action => cmd(`schedule ${action}`, 'POST', `/api/schedule/${action}`, `${action} agendamento`, action === 'pause' ? [s('reason')] : [], { args: ['scheduleId'], bodyArgs: true })),
  cmd('agents list', 'GET', '/api/state', 'Agentes e personas importadas', [], { select: ['agents', 'personaAgents'] }),
  cmd('agents config', 'POST', '/api/agent/config', 'Alterar modelo/habilitação de agente', [b('enabled'), s('model')], { args: ['agentId'], bodyArgs: true }),
  cmd('agents run', 'POST', '/api/agent/run', 'Executar agente na missão ativa', [], { args: ['agentId'], bodyArgs: true }),
  cmd('agents clear', 'POST', '/api/agents/clear', 'Limpar terminais e conversas dos agentes'),
  ...['supervisor', 'heartbeat'].flatMap(group => ['start', 'pause'].map(action => cmd(`${group} ${action}`, 'POST', `/api/${group}/${action}`, `${action} ${group}`))),
  cmd('personas list', 'GET', '/api/personas/available', 'Personas disponíveis, lidas do Kamui/Yume'),
  cmd('personas avatar', 'GET', '/api/personas/avatar', 'Baixar avatar por caminho do Yume', [s('src', '', true)], { binary: true }),
  ...['add', 'remove'].map(action => cmd(`personas ${action}`, 'POST', `/api/agent/persona/${action}`, `${action} persona no workspace`, [], { args: ['slug'], bodyArgs: true })),

  cmd('chat library', 'GET', `${chat}/library`, 'Biblioteca de sessões e pastas'),
  cmd('chat message', 'POST', '/api/tools/global-chat/message', 'Publicar mensagem no chat global da missão', [s('content', '', true), s('agent-id'), s('type')]),
  cmd('chat folders create', 'POST', `${chat}/folders`, 'Criar pasta', [s('name', '', true)]),
  cmd('chat folders rename', 'PATCH', `${chat}/folders/:folderId`, 'Renomear pasta', [s('name', '', true)]),
  cmd('chat folders delete', 'DELETE', `${chat}/folders/:folderId`, 'Apagar pasta; --cascade-sessions inclui sessões', [b('cascade-sessions')]),
  cmd('chat sessions create', 'POST', `${chat}/sessions`, 'Criar sessão', [s('title'), s('folder-id'), b('seed-from-active')]),
  cmd('chat sessions get', 'GET', `${chat}/sessions/:sessionId`, 'Ler sessão e transcrição'),
  cmd('chat sessions update', 'PATCH', `${chat}/sessions/:sessionId`, 'Editar sessão; --data aceita o patch completo', [s('title'), j('folder-id', 'String JSON ou null'), s('operation-mode'), j('workflow-assignments'), j('individual-assignments'), s('mission-draft'), j('draft-attachments'), j('transcript'), j('append-transcript'), j('final-result'), j('visual-pack'), j('mission-ledger'), s('mission-domain'), b('mission-domain-override'), s('active-persona-slug'), j('active-persona-run')]),
  cmd('chat sessions activate', 'POST', `${chat}/sessions/:sessionId/activate`, 'Ativar sessão no workspace'),
  cmd('chat sessions delete', 'DELETE', `${chat}/sessions/:sessionId`, 'Remover sessão da biblioteca (soft delete)'),
  cmd('chat attachments upload', 'POST', `${chat}/sessions/:sessionId/attachments`, 'Enviar arquivo binário', [s('file', 'Arquivo local', true), s('mime', 'MIME opcional')], { upload: true }),
  cmd('chat attachments get', 'GET', `${chat}/sessions/:sessionId/attachments/:attachmentId`, 'Baixar anexo', [], { binary: true }),
  cmd('chat attachments delete', 'DELETE', `${chat}/sessions/:sessionId/attachments/:attachmentId`, 'Apagar anexo'),
  ...[['get', 'GET'], ['create', 'POST'], ['revoke', 'DELETE']].map(([action, method]) => cmd(`chat share ${action}`, method, `${chat}/sessions/:sessionId/share`, `${action} link público da sessão`)),
  cmd('share get', 'GET', '/api/public/share/:token', 'Ler compartilhamento público', [], { auth: 'none' }),
  cmd('share artifact', 'GET', '/api/public/share/:token/artifacts/:traceId/:artifactId', 'Baixar artefato público', [], { auth: 'none', binary: true }),
  cmd('artifacts get', 'GET', '/api/luca-ai/visual-artifacts/:traceId/:artifactId', 'Baixar artefato visual da conta', [], { binary: true }),
  cmd('templates list', 'GET', templates, 'Listar templates'),
  cmd('templates create', 'POST', templates, 'Criar template de equipe/individual', [s('kind', 'team ou individual', true), j('template', '', true)]),
  cmd('templates update', 'PUT', `${templates}/:kind/:id`, 'Editar template', [j('template', '', true)]),
  cmd('templates delete', 'DELETE', `${templates}/:kind/:id`, 'Excluir template'),
  cmd('templates reorder', 'PUT', `${templates}/:kind/order`, 'Reordenar todos os IDs do tipo', [csv('ids', 'IDs separados por vírgula', true)]),
  cmd('team run', 'POST', '/api/luca-ai/persona-team/run', 'Iniciar rodada; --wait aguarda resultado', [s('mission'), csv('slugs'), s('mode', 'parallel, workflow ou individual'), s('judge-slug'), s('visual-slug'), n('depth'), j('workflow'), j('model-overrides'), s('session-id'), csv('attachment-ids'), s('trace-id'), s('domain'), b('domain-override')], { job: 'team', example: 'team run --mission "Avaliar o plano" --slugs arquiteto,revisor --wait' }),
  cmd('team status', 'GET', '/api/luca-ai/persona-team/runs/:runId', 'Consultar ou retomar rodada com --wait', [], { job: 'team' }),
  cmd('deliberations create', 'POST', '/api/deliberations', 'Enviar ContextBundle v1; --wait aguarda parecer', [s('schema'), s('objective', '', true), csv('constraints'), s('operator-notes'), j('team', '', true), j('artifacts'), s('trace-id')], { auth: 'session-or-machine', job: 'deliberation', defaults: { schema: 'luca.context-bundle.v1' } }),
  cmd('deliberations get', 'GET', '/api/deliberations/:deliberationId', 'Consultar parecer ou retomar espera', [], { auth: 'session-or-machine', job: 'deliberation' }),

  cmd('sompo telemetry', 'GET', telemetry, 'Telemetria atual do ESP32'),
  cmd('sompo fleet', 'GET', `${telemetry}/fleet`, 'Frota, safra e indicadores registrados'),
  cmd('sompo history', 'GET', `${telemetry}/history`, 'Histórico da telemetria', history),
  cmd('sompo export', 'GET', `${telemetry}/export`, 'Exportar CSV/JSON para laboratório', [...history, s('format', 'csv ou json'), s('episode-id')], { download: true }),
  cmd('sompo simulation record', 'POST', `${telemetry}/simulation`, 'Gravar amostras declaradas de simulação', [j('samples', '', true), s('episode-id')]),
  cmd('sompo episodes start', 'POST', `${telemetry}/episode`, 'Iniciar episódio de simulação', [s('kind', 'colisao ou roteiro', true), s('trator'), s('scenario-label'), s('scenario-id'), s('outcome-id')]),
  cmd('sompo episodes get', 'GET', `${telemetry}/episode/:publicId`, 'Ler episódio, resumo e frames'),
  cmd('sompo episodes finish', 'POST', `${telemetry}/episode/:publicId/finish`, 'Fechar episódio', [s('status', 'complete ou aborted')]),
  cmd('sompo episodes frames upload', 'POST', `${telemetry}/episode/:publicId/frames`, 'Enviar frames com dataUrl, offsetMs, fase e label', [j('frames', '', true)]),
  cmd('sompo episodes frames get', 'GET', `${telemetry}/episode/:publicId/frames/:seq`, 'Baixar frame do episódio', [], { binary: true }),
  cmd('sompo risk list', 'GET', '/api/sompo/risk', 'Avaliações registradas', [s('trator'), s('fonte')]),
  cmd('sompo risk assess', 'POST', '/api/sompo/risk', 'Calcular e registrar avaliação de risco', [s('source-kind', 'simulation ou firebase', true), j('raw'), j('context', '', true)]),
  cmd('lab cases list', 'GET', '/api/lab/cases', 'Listar casos do laboratório'),
  cmd('lab cases create', 'POST', '/api/lab/cases', 'Importar caso JSON com rawCsv e sourceName', [s('name'), s('source-name', '', true), s('raw-csv', '', true), j('metadata'), j('map'), j('schema')]),
  cmd('lab cases import', 'POST', '/api/lab/cases', 'Importar diretamente de arquivo CSV', [...labFiles, s('name')], { csvImport: true }),
  cmd('lab cases get', 'GET', '/api/lab/cases/:id', 'Ler caso, versões de análises e conclusões'),
  cmd('lab cases analyze', 'POST', '/api/lab/cases/:id/analyses', 'Investigar caso com IA (síncrono; timeout ajustável)', [s('focus')], { timeout: 600000 }),
  cmd('lab cases conclude', 'POST', '/api/lab/cases/:id/conclusions', 'Registrar conclusão e revisão de hipóteses', [s('observations', '', true), s('category', 'operational, mechanical, environmental, combined ou inconclusive', true), s('action', '', true), j('hypothesis-reviews')]),

  cmd('admin overview', 'GET', '/api/admin/overview', 'Visão geral administrativa', [], { auth: 'admin' }),
  cmd('admin users list', 'GET', '/api/admin/users', 'Listar contas e uso', [s('search'), s('sort')], { auth: 'admin' }),
  cmd('admin report', 'GET', '/api/admin/report', 'Relatório administrativo', [n('limit')], { auth: 'admin' }),
  cmd('admin users library', 'GET', '/api/admin/users/:userId/chat/library', 'Biblioteca da conta para suporte', [], { auth: 'admin' }),
  cmd('admin users session', 'GET', '/api/admin/users/:userId/chat/sessions/:sessionId', 'Transcrição da conta para suporte', [], { auth: 'admin' }),
  cmd('admin users impersonate', 'POST', '/api/admin/users/:userId/impersonate', 'Entrar na conta para suporte; atualiza sessão local', [], { auth: 'admin' }),
  cmd('admin personas list', 'GET', '/api/admin/personas', 'Catálogo administrativo de personas', [], { auth: 'admin' }),
  cmd('admin personas set', 'PUT', '/api/admin/personas/:slug', 'Editar override local do catálogo, sem escrever no Yume', [s('model'), b('visible'), s('name'), s('description'), s('purpose'), s('system-prompt'), s('avatar-url')], { auth: 'admin' }),
  cmd('admin personas reset', 'DELETE', '/api/admin/personas/:slug', 'Remover override local', [], { auth: 'admin' }),

  local('lab inspect', 'Validar CSV e calcular eventos, offline', labFiles),
  local('lab replay', 'Reconstruir leitura no instante escolhido, offline', [...labFiles, n('elapsed-ms', '', true)]),
  local('lab convert', 'Converter dataset SOMPO JSON (--data) em CSV, offline', [], { binary: true }),
  local('lab report', 'Relatório HTML do caso salvo (--data); mesmo relatório do painel', [s('author', 'Responsável pela exportação', true)], { binary: true }),
  local('sompo scenarios', 'Listar cenários e desfechos rodoviários/agrícolas'),
  local('sompo simulate', 'Gerar snapshot/brief de cenário sem gravar no servidor', scenario),
  local('sompo normalize', 'Normalizar telemetria raw; --data @arquivo é obrigatório', []),
  local('sompo risk calculate', 'Avaliar snapshot local; --data {snapshot,context}', []),
  local('geofence evaluate', 'Avaliar proximidade; --data {position,rules,polygons,machine}', []),
  local('sensor scenarios', 'Listar ensaios e parâmetros da física MEMS'),
  local('sensor sample', 'Leitura física determinística; não renderiza 3D', [s('scenario', '', true), n('parameter'), n('time', 'Tempo em segundos')]),
  local('drowsiness evaluate', 'Reproduzir observações de olhos; sem câmera/inferência/som', [s('sensitivity', 'low, normal ou high')]),
  local('api', 'Requisição para rota /api/ na origem selecionada', [], { args: ['method', 'path'], raw: true, auth: 'session' }),
];

for (const command of commands) {
  command.args ??= [...(command.path || '').matchAll(/:([A-Za-z]+)/g)].map(match => match[1]);
}
