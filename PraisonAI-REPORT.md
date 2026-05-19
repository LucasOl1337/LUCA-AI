# Relatório Completo: PraisonAI — Análise e Integração com LUCA-AI

**Data:** 2026-05-13
**Repo:** `https://github.com/MervinPraison/PraisonAI`
**Licença:** MIT
**Localização:** `C:\Users\user\desktop\luca-ai\PraisonAI\`

---

## 1. Visão Geral

PraisonAI é um framework multi-agente de IA, low-code, production-ready, que suporta **100+ provedores LLM** (OpenAI, Anthropic, Google Gemini, DeepSeek, Azure, Ollama, Groq, Mistral, etc.). Focado em simplicidade, customização e colaboração humano-agente.

**Desempenho:** Instanciação de agentes em **~3.77 μs**. Highlighted por Elon Musk no X (tweet sobre "Grok 3 customer support" usando PraisonAI).

---

## 2. Estrutura do Repositório

```
PraisonAI/
├── src/
│   ├── praisonai/          # Framework principal (CLI, UI, bots, gateway, deploy)
│   ├── praisonai-agents/   # SDK Python core (Agent, AgentTeam, Tools, MCP, Memory, RAG)
│   ├── praisonai-platform/ # Plataforma web (dashboard)
│   ├── praisonai-ts/       # SDK TypeScript
│   └── praisonai-rust/     # SDK Rust (experimental)
├── examples/               # 60+ categorias de exemplos (Python, JS, YAML)
├── docker/                 # Dockerfiles e docker-compose para deploy
├── LICENSE                 # MIT
├── README.md
└── api.md
```

**Estatísticas:**
- **4.396 arquivos** | **3.317 Python** | **476 JS/TS** | **106 YAML**
- **~100MB** tamanho total

---

## 3. Arquitetura — Os 2 Pacotes Principais

### 3.1 `praisonaiagents` (SDK Core)

O pacote leve para coding direto. Instalação: `pip install praisonaiagents`

**57 subpacotes organizados por responsabilidade:**

| Categoria | Subpacotes | Descrição |
|-----------|-----------|-----------|
| **Agentes** | `agent/`, `agents/` | Agent único, AgentTeam, AutoAgents, delegação, handoffs |
| **Workflows** | `workflows/` | AgentFlow (route, parallel, loop, repeat, conditional) |
| **Tools** | `tools/` | 100+ ferramentas, registry, decorator `@tool`, MCP |
| **Memory** | `memory/` | Short/long-term, file-based (zero deps), learn/forget |
| **Knowledge** | `knowledge/` | RAG, chunking, vector store, readers, rerankers |
| **Planning** | `planning/` | Plan, PlanStep, TodoList, PlanningAgent |
| **MCP** | `mcp/` | Model Context Protocol (stdio, HTTP, WS, SSE) |
| **LLM** | `llm/` | OpenAI client, LiteLLM, model router, failover, rate limiter |
| **Guardrails** | `guardrails/` | Input/output validation |
| **Embedding** | `embedding/` | Embeddings, dimensões |
| **Context** | `context/` | FastContext, ContextManager, compaction |
| **Plugins** | `plugins/` | Plugin system, discovery, SDK |
| **Telemetry** | `telemetry/` | OpenTelemetry, performance monitoring |
| **Session** | `session/` | Session management, hierarchy |
| **Skills** | `skills/` | Skill management, discovery, validation |
| **UI** | `ui/` | AGUI, A2A protocols |
| **Storage** | `storage/`, `db/` | Multi-backend persistence (SQLite, Postgres, MongoDB, Redis) |
| **Segurança** | `sandbox/`, `policy/`, `permissions/`, `audit/` | Sandbox execution, policy engine, permission management |
| **Outros** | `eval/`, `scheduler/`, `bus/`, `hooks/`, `background/`, `escalation/`, `compaction/`, `thinking/`, `output/` | Avaliação, scheduling, event bus, hooks, background tasks, doom loop detection, context compaction, thinking budgets |

**Dependências core mínimas:**
- `pydantic>=2.10.0`, `rich`, `openai>=1.68.2`, `posthog>=3.0.0`, `aiohttp>=3.8.0`

### 3.2 `praisonai` (Framework Wrapper)

O framework completo com CLI, UI, bots, gateway, deploy. Instalação: `pip install praisonai`

**Principais módulos:**
- `cli/` — CLI completo com TUI (Textual), comandos de agent/workflow/memory/knowledge/MCP
- `claw/` — Dashboard UI (13 páginas: Chat, Agents, Memory, Knowledge, Channels, Guardrails, Cron)
- `bots/` — Telegram, Discord, Slack, WhatsApp bots
- `gateway/` — Bot gateway multi-canal
- `ui/` — Interface de chat limpa
- `flow/` — Integração Langflow (visual flow builder)
- `api/` — REST API (FastAPI/Flask)
- `deploy/` — Deploy para produção
- `code/` — Integração com Claude Code, Gemini CLI, Codex CLI, Cursor
- `recipe/` — YAML-based agent recipes
- `browser/` — Browser automation
- `train/` — Training/fine-tuning

---

## 4. Capacidades Principais

### 4.1 Agentes
- **Single Agent** — `Agent(instructions="...").start("task")`
- **Multi Agents** — `AgentTeam(agents=[a1, a2]).start()`
- **Auto Agents** — Geração automática de agentes via YAML
- **Handoffs** — Passagem de conversa entre agentes
- **Self Reflection** — Agente revisa próprio output
- **Deep Research** — Pesquisa multi-step autônoma
- **Specialized Agents** — Data Analyst, Finance, Shopping, Wikipedia, Programming, Math, etc.
- **Media Agents** — Image Generation, Image-to-Text, Video, Camera, OCR, Vision, Audio, Realtime

### 4.2 Workflows (AgentFlow)
- `route()` — Roteamento condicional
- `parallel()` — Execução paralela
- `loop()` — Iteração sobre listas/CSVs
- `repeat()` — Evaluator-Optimizer
- `when()` — Condições
- Conditional steps, branching, early stop, checkpoints

### 4.3 MCP (Model Context Protocol)
- stdio — Local NPX/Python servers
- HTTP Streamable — Production servers
- WebSocket — Real-time bidirectional
- SSE — Server-Sent Events
- OAuth, security, resumability

### 4.4 Memory & Knowledge
- **Memory** — Short/long-term, file-based (zero deps), graph memory (Neo4j)
- **Knowledge** — RAG com quality scoring, multiple vector stores
- **Chunking** — Múltiplas estratégias (semantic, sentence, etc.)
- **Retrieval** — Sub-question query engine, rerankers

### 4.5 Integrações
- **100+ LLM providers** via OpenAI SDK e LiteLLM
- **Bots** — Telegram, Discord, Slack, WhatsApp
- **LangChain** — Compatibilidade
- **Langflow** — Visual flow builder
- **External Agents** — Claude Code, Gemini CLI, Codex CLI, Cursor
- **Databases** — PostgreSQL, MySQL, SQLite, MongoDB, Redis, DynamoDB, 20+

### 4.6 Production Features
- **Docker** — Dockerfiles e docker-compose para todos os modos
- **CLI completo** — agents, workflows, memory, knowledge, sessions, tools, MCP, scheduler
- **Telemetry** — OpenTelemetry traces, spans, metrics
- **Policy Engine** — Controle declarativo de comportamento
- **Sandbox** — Execução isolada de código
- **Checkpoints** — Shadow git auto-rollback
- **Context Compaction** — Nunca atingir limites de token
- **Doom Loop Detection** — Auto-recovery de agentes travados
- **Background Tasks** — Fire-and-forget agents

---

## 5. Quick Start Reference

```python
# Single Agent
from praisonaiagents import Agent
agent = Agent(instructions="You are a helpful AI assistant")
agent.start("Write a movie script about a robot in Mars")

# Multi Agents
from praisonaiagents import Agent, AgentTeam
research_agent = Agent(instructions="Research about AI")
summarise_agent = Agent(instructions="Summarise findings")
agents = AgentTeam(agents=[research_agent, summarise_agent])
agents.start()

# MCP Tools
from praisonaiagents import Agent, MCP
agent = Agent(tools=MCP("npx @modelcontextprotocol/server-memory"))

# Custom Tools
from praisonaiagents import Agent, tool
@tool
def search(query: str) -> str:
    """Search the web."""
    return f"Results for: {query}"

agent = Agent(tools=[search])
agent.start("Search for AI news")
```

---

## 6. Comparação: PraisonAI vs LUCA-AI

| Aspecto | LUCA-AI | PraisonAI |
|---------|---------|-----------|
| **Tipo** | App frontend (React + Vite) | Framework multi-agente completo |
| **Linguagem** | JavaScript/JSX | Python + TypeScript + Rust |
| **Stack** | React 19, Vite 7, Express 5, WebSocket | OpenAI SDK, LiteLLM, FastAPI, Chainlit |
| **Agentes** | Definidos em Markdown (Agentes/) | Agentes Python/YAML com execução real |
| **LLM** | Via API externa | 100+ providers diretos |
| **UI** | Dashboard heartbeat custom | Dashboard Claw, Chat UI, Chainlit |
| **Persistência** | JSON local | 20+ backends de banco |
| **Deploy** | Dev server local | Docker, cloud, CLI |
| **Maturidade** | Protótipo v2 | Framework production-ready, MIT |

---

## 7. Oportunidades de Integração

### 7.1 Adicionar agentes reais ao LUCA-AI
PraisonAI pode ser o backend de agentes para LUCA-AI:
- `pesquisador.md` → `Agent(instructions="Research Analyst", tools=[web_search])`
- `planejador.md` → `PlanningAgent`
- `supervisor.md` → `AgentTeam` coordinator

### 7.2 UI como frontend
LUCA-AI pode servir como frontend visual, chamando a API REST do PraisonAI (`praisonai/api/`).

### 7.3 Memory compartilhada
Usar o sistema de memory do PraisonAI (file-based, zero deps) para persistir estado entre sessões.

### 7.4 Bots
Integrar bots Telegram/Discord/WhatsApp do PraisonAI para notificações do LUCA-AI.

---

## 8. Estrutura Final no Projeto

```
luca-ai/
├── PraisonAI/              ← IMPORTADO (repo completo)
│   ├── src/
│   │   ├── praisonai/      # Framework wrapper
│   │   ├── praisonai-agents/ # SDK core
│   │   ├── praisonai-ts/   # SDK TypeScript
│   │   ├── praisonai-rust/ # SDK Rust
│   │   └── praisonai-platform/
│   ├── examples/           # 60+ categorias de exemplos
│   ├── docker/             # Configs de deploy
│   ├── LICENSE (MIT)
│   └── README.md
├── index.html
├── package.json
├── server/
├── src/
├── Agentes/
└── ...
```

---

*Relatório gerado automaticamente por análise completa do repositório MervinPraison/PraisonAI.*
