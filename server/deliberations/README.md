# Deliberações

Este módulo transforma a bancada multipersona do LUCA em um motor de decisão consumível por Claude Code, Codex, Hermes e outros harnesses.

## Decisão arquitetural

O LUCA delibera; o harness executa.

```text
Harness externo
  ├─ possui repositório, credenciais, shell e worktree
  ├─ seleciona evidências e executa mudanças/testes
  └─ envia um ContextBundle
             ↓
LUCA /api/deliberations
  ├─ valida e separa instruções de dados externos
  ├─ executa as personas Yume pelo runtime existente
  └─ devolve um DecisionPackage consultivo
             ↓
Harness + operador humano decidem e executam
```

O LUCA não recebe credenciais Git, não clona repositórios, não executa código de terceiros e não autoriza push, PR ou deploy. O parecer nunca concede autoridade operacional.

## Fronteiras de confiança

| Origem | Confiança | Tratamento |
| --- | --- | --- |
| `objective`, `constraints`, `operatorNotes` | instruções do operador | permanecem fora dos blocos de evidência |
| `artifacts[].content` | dado externo não confiável | cercado por delimitadores únicos, com delimitadores forjados e esquemas de URL neutralizados |
| resultado das personas | parecer consultivo | convertido em pacote versionado; nunca executado pelo LUCA |

Todas as tools e todo egress ficam desativados nas deliberações. URLs presentes em artifacts também são neutralizadas como segunda camada contra regressão no gate. A bancada decide somente com o bundle recebido; o harness coleta qualquer evidência externa antes da consulta.

## Interface

`createDeliberations(dependencies)` expõe somente `registerRoutes(app)`. O Express principal injeta o engine existente, a autenticação de usuário, um job store próprio, as funções de workspace e `LUCA_MACHINE_TOKEN`. O módulo não importa nem inicializa `server/index.js`.

## ContextBundle v1

`POST /api/deliberations` aceita:

```json
{
  "schema": "luca.context-bundle.v1",
  "objective": "Decidir a correção mais segura para o bug",
  "constraints": ["Preservar compatibilidade", "Não alterar produção"],
  "operatorNotes": "Avalie as duas alternativas",
  "team": {
    "mode": "individual",
    "slugs": ["arquiteto", "revisor"],
    "judgeSlug": "juiz",
    "modelOverrides": {}
  },
  "artifacts": [
    { "id": "diff-1", "kind": "diff", "label": "Alteração proposta", "content": "diff --git ..." }
  ],
  "traceId": "opcional"
}
```

Limites v1: corpo 256 KiB; missão 120.000 caracteres; `objective` 4.000; até 20 `constraints` de 500; `operatorNotes` 4.000; até 16 artifacts de 48.000 caracteres. Tipos: `diff`, `file`, `test-output`, `log`, `doc`, `note`.

A equipe reutiliza `parallel`, `workflow` e `individual`. As personas continuam vindo do Yume somente por leitura via Kamui.

## API assíncrona

```text
POST /api/deliberations
  → 202 { deliberationId, traceId, status: "running", startedAt }

GET /api/deliberations/:deliberationId
  → 200 DecisionPackage
  → 404 para ID inexistente, outro owner ou job perdido após restart
```

O job store v1 permanece em memória. Após restart, o consumidor recebe `404` e pode reenviar. `Idempotency-Key` será entregue junto com persistência; prometê-lo sobre um store volátil criaria garantia falsa.

## DecisionPackage v1

```json
{
  "schema": "luca.decision-package.v1",
  "deliberationId": "uuid",
  "traceId": "trace",
  "status": "running",
  "objective": "Decidir a correção mais segura para o bug",
  "verdict": null,
  "contributions": [],
  "engine": { "mode": null, "team": [] },
  "timing": { "startedAt": "ISO-8601", "completedAt": null, "durationMs": null },
  "error": null
}
```

No modo `individual`, o juiz fornece o veredito. Em `workflow`, a exibição final fornece o veredito. Em `parallel`, o LUCA não inventa consenso: `verdict` fica `null` e as contribuições permanecem separadas.

## Autenticação e ownership

- Navegador: sessão LUCA existente, com as mesmas proteções de origem.
- Harness: `Authorization: Bearer <LUCA_MACHINE_TOKEN>`.
- O token de máquina só habilita com pelo menos 32 caracteres e usa comparação em tempo constante.
- O primeiro corte possui um owner de máquina único, `machine:default`.
- Token e conteúdo de artifacts não entram no event log.

## Aceite e roadmap

O corte está completo quando testes específicos, `npm run test`, `npm run typecheck`, `npm run build` e um smoke local `202 → complete|failed` passam.

Roadmap: persistência/cancelamento/idempotência; API keys por conta com rotação/escopos/quotas; adapter MCP fino; riscos/dissenso estruturados; callback de conclusão.

Fora do roadmap: GitHub App, checkout, shell, containers, worktrees, edição de código, CI, PR e deploy dentro do LUCA.
