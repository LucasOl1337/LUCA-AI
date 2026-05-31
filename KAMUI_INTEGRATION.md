# Integração LUCA-AI ↔ Kamui

## Visão Geral

O LUCA-AI consome **personas do Yume** (via Kamui) como agentes especialistas especializados. Esta integração é **read-only**: o LUCA-AI lê personas e system prompts do Yume, mas **nunca escreve** no Yume.

- **Padrão**: Todas as chamadas ao Yume passam pelo Kamui (`{KAMUI_BASE}/kamui/<tether>/<path>`)
- **Caller**: `luca`
- **User-Agent**: `luca-ai-service (kamui-client)`

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `KAMUI_BASE` | `http://127.0.0.1:1338` | URL base do Kamui |
| `KAMUI_TIMEOUT_MS` | `8000` | Timeout das requisições Kamui (ms) |

---

## Módulo Cliente: `server/kamui-client.js`

### Funções de Saída (LUCA → Kamui/Yume)

Todas as funções são **GET only** e lançam `KamuiError` em falha.

#### `listYumePersonas()`
- **Endpoint**: `GET /kamui/yume/personas`
- **Retorno**: `[{ slug, name, model, ... }]`
- **Uso**: Lista todas as personas disponíveis no Yume

#### `fetchYumePersona(slug)`
- **Endpoint**: `GET /kamui/yume/personas/{slug}`
- **Retorno**: `{ persona: {...} }` ou o objeto persona diretamente
- **Uso**: Detalhes completos de uma persona

#### `fetchYumePersonaSystemPrompt(slug)`
- **Endpoint**: `GET /kamui/yume/personas/{slug}/system-prompt`
- **Retorno**: `{ slug, name, model, system_prompt, ... }`
- **Uso**: Obtém o system prompt composto da persona (principal para execução)

#### `getYumePersonaVersion(slug)`
- **Endpoint**: `GET /kamui/yume/personas/{slug}/version`
- **Retorno**: `{ slug, version, updated_at }`
- **Uso**: Verificação leve de cache (evita re-fetch desnecessário)

#### `isKamuiReachable(timeoutMs = 1500)`
- **Endpoint**: `GET /kamui/yume/health`
- **Retorno**: `boolean` (não lança em falha)
- **Uso**: Health-check best-effort do Kamui

---

## Endpoints de Entrada (API LUCA-AI)

Estes endpoints permitem que sistemas externos (incluindo via Kamui) interajam com o LUCA-AI.

### Health & Estado

#### `GET /api/health`
- **Resposta**:
  ```json
  {
    "ok": true,
    "service": "luca-ai",
    "supervisorMode": "running" | "standby",
    "agents": 6,
    "personaAgents": 0,
    "activeMission": false,
    "scheduledMissions": 0,
    "kamuiBase": "http://127.0.0.1:1338"
  }
  ```

#### `GET /api/state`
- Retorna o estado completo do LUCA-AI (missão ativa, agentes, chat, etc.)

---

### Personas do Yume (Integração Kamui)

#### `GET /api/personas/available`
- **Descrição**: Lista personas do Yume via Kamui + status de importação
- **Resposta**:
  ```json
  {
    "ok": true,
    "personas": [
      {
        "slug": "tars",
        "name": "TARS",
        "model": "cx/gpt-5.5",
        "description": "...",
        "avatar_url": "...",
        "version": 1,
        "imported": false
      }
    ]
  }
  ```
- **Erro (Kamui indisponível)**: `502` com `source: "kamui"`

#### `POST /api/agent/persona/add`
- **Body**: `{ "slug": "tars" }`
- **Descrição**: Importa uma persona do Yume como agente especialista do LUCA-AI (read-only)
- **Resposta**:
  ```json
  {
    "ok": true,
    "agent": {
      "id": "yume-tars",
      "slug": "tars",
      "name": "TARS",
      "model": "cx/gpt-5.5",
      "enabled": true,
      "cachedSystemPrompt": "...",
      "cachedVersion": 1,
      "cachedAt": "2026-05-31T..."
    }
  }
  ```
- **Erro**: `400` (slug_required), `502` (Kamui falhou)

#### `POST /api/agent/persona/remove`
- **Body**: `{ "slug": "tars" }`
- **Descrição**: Remove uma persona-agent importada
- **Resposta**: `{ "ok": true, "removed": true }`

---

### Execução de Persona (Saída via Chat)

#### `POST /api/agent/run` (persona Yume)
- **Body**: `{ "agentId": "yume:tars" }` ou `{ "agentId": "tars" }`
- **Contexto**: Requer missão ativa
- **Comportamento**: Executa a persona como especialista no chat da missão ativa (modo `chat_only`)
- **Resposta**: `{ "ok": true, "result": {...} }`

---

## Fluxo de Integração Completo

```
1. Yume Persona existe (ex: "tars")
        ↓
2. LUCA-AI chama GET /api/personas/available
        ↓ (via Kamui)
3. Usuário importa via POST /api/agent/persona/add { slug: "tars" }
        ↓
4. Persona fica disponível em getPersonaAgents()
        ↓
5. Em missões chat_only ou agent_conversation:
        ↓
6. runPersonaAgentChat("tars") resolve system prompt via Kamui
        ↓
7. Persona contribui no Chat Global com sua personalidade
```

---

## Regras de Ouro

1. **Nunca escreva no Yume** — Apenas leitura via Kamui
2. **Sempre use Kamui** — Não chame Yume diretamente
3. **Cache de version** — Use `getYumePersonaVersion` antes de re-fetch
4. **Fallback graceful** — `isKamuiReachable` não lança; personas com erro usam cache se disponível
5. **Header de rastreamento** — Todas as chamadas Kamui enviam `X-Kamui-Caller: luca`

---

## Testes

```bash
npm test -- server/kamui-bridge.test.js
```

Os testes validam:
- Apenas helpers de leitura expostos
- GET-only para todos os endpoints Yume
- Desembrulho correto do envelope Kamui
- Tratamento de erro (`KamuiError`)
- Health-check não-lançante

---

## Status da Integração

- [x] Cliente Kamui implementado (`kamui-client.js`)
- [x] Endpoints de listagem/importação de personas
- [x] Execução de personas em missões
- [x] Cache de system prompt por versão
- [x] Testes de integração
- [ ] Documentação de contrato OpenAPI/Swagger (futuro)
- [ ] Health-check composto (LUCA + Kamui + Yume) (futuro)
