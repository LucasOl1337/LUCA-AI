## Code Context

**Query:** LUCA-AI architecture server Express routes WebSocket state mission supervisor agents persona frontend React pages hooks API

### Entry Points

- **state** (constant) - server/state.js:106
  `= loadPersistedState()`
- **AGENTS** (constant) - server/config.js:10
  `= [
  { id: 'maestro', role: 'router', name: 'Maestro', model: MAESTRO_MODEL },
  { id: 'transformador...`
- **PersonaCardProps** (interface) - src/pages/PersonasPage.tsx:231

### Related Symbols

- server/index.js: agentRuntime:254, agentDisplayName:465, workerAgents:543, contributorAgents:547, designerAgent:551, runCycle:1186, supervisorTick:1226, runAgentChat:1496
- server/state.js: makeInitialState:44, normalizeAgentList:61

### Code

#### state (server/state.js:106)

```javascript
const state = loadPersistedState();
```

#### AGENTS (server/config.js:10)

```javascript
export const AGENTS = [
  { id: 'maestro', role: 'router', name: 'Maestro', model: MAESTRO_MODEL },
  { id: 'transformador-missao', role: 'mission-transformer', name: 'Transformador de Missao', model: MISSION_TRANSFORMER_MODEL },
  { id: 'supervisor', role: 'supervisor', name: 'Supervisor', model: ROUTER_MODEL },
  { id: 'planejador', role: 'planner', name: 'Planejador', model: ROUTER_MODEL },
  { id: 'pesquisador', role: 'researcher', name: 'Pesquisador', model: ROUTER_MODEL },
  { id: 'designer', role: 'designer', name: 'Designer', model: DESIGNER_MODEL },
];
```

#### PersonaCardProps (src/pages/PersonasPage.tsx:231)

```tsx
interface PersonaCardProps {
  persona: YumePersonaSummary;
  delay: number;
  busy: boolean;
  onImport: () => void;
  onRemove: () => void;
}
```

#### agentRuntime (server/index.js:254)

```javascript
function agentRuntime(agentId) {
  const configured = getState().agents.find((agent) => agent.id === agentId);
  const fallbackModel = AGENTS.find((agent) => agent.id === agentId)?.model ?? ROUTER_MODEL;
  return {
    enabled: configured ? configured.enabled !== false : true,
    model: configured?.model || fallbackModel,
  };
}
```

#### agentDisplayName (server/index.js:465)

```javascript
function agentDisplayName(agentId) {
  const builtin = AGENTS.find((agent) => agent.id === agentId)?.name;
  if (builtin) return builtin;
  const persona = getPersonaAgents().find((p) => p.id === agentId || p.slug === agentId);
  if (persona) return persona.name || persona.slug;
  return agentId;
}
```

#### workerAgents (server/index.js:543)

```javascript
function workerAgents() {
  return AGENTS.filter((agent) => agent.role === 'planner' || agent.role === 'researcher' || agent.role === 'designer');
}
```

#### contributorAgents (server/index.js:547)

```javascript
function contributorAgents() {
  return AGENTS.filter((agent) => agent.role === 'planner' || agent.role === 'researcher');
}
```

#### designerAgent (server/index.js:551)

```javascript
function designerAgent() {
  return AGENTS.find((agent) => agent.role === 'designer');
}
```

#### runCycle (server/index.js:1186)

```javascript
async function runCycle() {
  const mission = getState().activeMission;
  if (!mission) {
    addHeartbeat('supervisor', 'idle', 'sem missao ativa');
    await processScheduledMissions();
    emitState();
    return;
  }

  const intent = classifyMissionIntent(mission);
  if (intent === 'agent_conversation') {
    await runAgentConversationMission(mission);
    return;
  }
  if (intent === 'chat_only') {
    await runChatOnlyMission(mission);
    return;
  }

  // dashboard_build (fluxo padrao): transformer -> contributors -> designer -> canvas.
  const transformer = AGENTS.find((agent) => agent.role === 'mission-transformer');
  if (transformer && !missionReadyForAgents(mission)) {
    await runMissionTransformer(transformer, mission);
    emitState();
  }
  const currentMission = getState().activeMission;
  if (!missionReadyForAgents(currentMission)) return;

  await supervisorTick(currentMission);
}
```

#### supervisorTick (server/index.js:1226)

```javascript
async function supervisorTick(mission) {
  const run = getState().activeRun;
  if (!run || run.status !== 'running') return;
  if (hasRunningWorker()) {
    addHeartbeat('supervisor', 'observing', 'aguardando agente em execucao');
    emitState();
    return;
  }

  const tick = incrementSupervisorTick();
  setAgentStatus('supervisor', 'running');
  appendLine('supervisor', `[orquestrador] observando chat tick ${tick}`);
  markAgentChatSeen('supervisor', latestChatMessageId());

  const contributors = contributorAgents();
  const designer = designerAgent();
  const nextWorker = contributors.find((agent) => !run.tasks.some((task) => task.agentId === agent.id));
  if (nextWorker) {
    const instruction = taskInstructionForAgent(nextWorker);
    const task = createAgentTask(nextWorker.id, instruction);
    publishChatMessage({
      agentId: 'supervisor',
      type: 'decisao',
      content: `Chamando ${agentDisplayName(nextWorker.id)} para contribuir na missao.`,
    });
    setAgentStatus('supervisor', 'ready');
    emitState();
    const result = await runAgent(nextWorker, mission, task);
    if (result?.ok === false) {
      const reason = result.routerDown
        ? 'o 9router local nao respondeu dentro do limite. Verifique se o roteador/modelo esta ativo e retome o supervisor depois.'
        : `o agente ${agentDisplayName(nextWorker.id)} falhou ou produziu saida invalida: ${result.error ?? 'erro desconhecido'}`;
      publishChatMessage({
... (truncated) ...
```

