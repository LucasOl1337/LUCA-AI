# Handoff — Bancada: tools, profundidade e motores (onda 1)

**Data:** 2026-08-10  
**Repo:** `C:/Projetos/luca-ai`  
**Sessão:** inteligência da bancada (personas) + deploy de teste prático  
**Commit da onda:** `e7d88ce` — `feat(bancada): web_search+calc nas tools, motores heterogeneos nos presets e seletor de profundidade 1/2/3 no modo individual`  
**HEAD local ao escrever o handoff:** `1093212` (main; há commits posteriores de outras frentes — anexos, home, equipe visual, Sompo, deploy)

Documentação canônica do produto continua em `docs/` (não mover). Esta pasta `DocsDev/` é passagem de bastão operacional.

---

## Objetivo central da sessão

Elevar a qualidade de decisão da bancada de personas do LUCA-AI para problemas diversos (código, esportes, seguros agrícolas/Sompo etc.), com modelos que debatem e chegam a veredito.

Divisão acordada:

- **Inteligência / produto** (protocolos, profundidade, triagem, ledger): usuário + assistente Hermes.
- **Execução de código**: agentes Sol via `delegate_task` (`delegation.provider=9router`, `delegation.model=cx/gpt-5.6-sol-xhigh`).

Foco da sessão: diagnosticar 6 gargalos, implementar onda 1 (tools + diversidade de motor + depth 1/2 parcial) e **subir para produção** para teste prático do usuário.

---

## Decisões tomadas

### Gargalos (usuário concordou com todos)

1. Poucas ferramentas (só fetch/http) — sem busca.
2. Modo individual: uma rodada cega + juiz, sem réplica.
3. Orçamento de tokens por participante insuficiente (era ~900).
4. Homogeneidade de motor: default `persona.model || ROUTER_MODEL` → falso consenso correlacionado.
5. Pipeline/formato único para qualquer domínio.
6. Contexto por concatenação bruta dilui e estoura orçamento.

### Spec de profundidade (modo individual)

| Depth | Nome UI | Tokens (participante) | Comportamento |
|------|---------|------------------------|---------------|
| 1 | Padrão | 1100 | Cega + juiz (default) |
| 2 | Deliberação | 3000 | Cega → **réplica anonimizada** (A/B/C, sem slug/nome/motor) → juiz |
| 3 | Máx. | 20000 | Orçamento alto; **protocolo de consenso ainda NÃO implementado** (igual 2 + mais tokens) |

Guarda inegociável (assistente): no futuro modo 3 de consenso, **teto de ciclos** (default 5) + veredito sempre (consenso OU juiz com dissenso registrado).

### Outras decisões de implementação

- `web_search` em cascata por env: Brave → Tavily → DuckDuckGo (sem chave).
- `calc` aritmético fail-closed (sem eval).
- Presets seed com rotas 9Router **heterogêneas** por participante; juiz em `cx/gpt-5.6-sol-xhigh`.
- Catálogo fechado de rotas 9Router (sanitização via `isAllowed9RouterModel` / `sanitizeAgentModel`).
- Agentes delegados **não** commitam/pusham; review + commit pelo orquestrador.
- Deploy autorizado pelo usuário para teste prático (sem esperar onda 2).

### Decisões ainda **pendentes do usuário** (bloqueiam onda 2)

1. **Triagem (gargalo 5):** (a) automático com override manual *(recomendado)* vs (b) 100% manual.
2. **Protocolo modo 3:** round-robin + quadro de negociação + pressão a partir do ciclo 3 + teto 5 + dissenso no veredito — aprovar ou ajustar.
3. **Ledger “Diário da Missão” (gargalo 6):** estado estruturado `{decisões, evidências, pendências, divergências}` — aprovação pendente.

---

## O que foi implementado / alterado (onda 1)

### Frente A — Tools (`deleg_af2a9276` task-0)

- `server/agent-tools.js`, `server/agent-loop.js`
- Ferramentas: `web_search`, `calc`
- Addon operacional: fato externo sem URL → buscar primeiro
- Testes: `server/agent-tools-search.test.js`, ajustes em `server/agent-tools.test.js` (anexos inline via `buildUserContent`)

### Frente B — Motores heterogêneos (`deleg_af2a9276` task-1)

- `shared/luca-preset-seed.js` (+ `.d.ts`)
- `server/team-templates.js` (+ testes)
- `server/luca-preset-models.test.js` (novo)
- `src/lib/lucaPresets.ts`, `src/lib/types.ts`, toques em `src/pages/LucaAiPage.tsx`
- Preset aplica `models` como `modelOverrides` (prioridade preset > persona.model)
- Templates legados sem `models` continuam válidos

### Frente C — Depth 1/2 (+ orçamento 3) (`deleg_af2a9276` task-2 + `deleg_7cb059d3`)

- `server/persona-team.js`: `DEPTH_BUDGETS`, sanitização depth default 1, `buildIndividualRevisionPrompt`, réplica anonimizada depth≥2, TODO(depth-3) consenso
- `server/index.js`: orçamentos, fase `revision`, events `roleId: 'revision'`, phases `blind|revision|judge`, depth no trace
- UI: seletor **1 Padrão / 2 Deliberação / 3 Máx.** no painel individual (ordem: juiz → participantes → profundidade → presets)
- Client: `depth` no `POST /api/luca-ai/persona-team/run`; badges Cega/Revisão/Juiz no transcript
- Tipos: `LucaAiIndividualDepth`, phases em replies/steps
- Testes: `server/persona-team.test.js`, `server/luca-individual-depth-ui.test.js`
- Polling client ampliado para 30 min (timeout 9Router por chamada ainda 120s — não verificado em rodada depth 3 longa real)

### Gate local da onda (verificado pelo orquestrador)

- `npm test`: **358/358** pass
- `npm run typecheck`: ok
- `npm run build`: ok (warning de chunk >500kB pré-existente)

### Deploy produção (nesta sessão)

| Item | Valor |
|------|--------|
| Commit staged | `e7d88ce` / release dir `e7d88ce299df` |
| Host | Azure VM `sennin@57.156.59.165` (`sennin-core-01`) |
| Path | `/opt/sennin/luca-ai/releases/e7d88ce299df` → link `current` |
| SSH key | `C:/Users/user/.ssh/oracle-9router` |
| Service | `systemctl restart luca-ai` → **active** |
| Health local VM | `GET :4242/api/health` → `ok:true`, version `0.2.0` (no momento do deploy) |
| Público | `https://luca-ai.com.br` → HTTP 200 |
| Preflight sem auth | `authentication_required` (esperado) |

**Nota:** o `main` local avançou depois (anexos, home, equipe visual, Sompo, v0.3.0 etc.). Produção **atual** pode já estar em SHA mais novo se outras sessões redeployaram — **não verificado neste handoff** se a VM ainda aponta para `e7d88ce299df`.

### Merge posterior relevante

- `f4cb4c4` — merge consolidando anexos revisados com tools/profundidade da main (onda 1 entrou no tronco com anexos).

---

## Pendências e próximos passos recomendados

### Imediato (operador)

1. Teste prático em produção (roteiro da sessão):
   - Missão **sem URL** → personas devem usar `web_search` (DDG se sem chave).
   - Mesma missão em depth **1** vs **2** → badges Cega/Revisão/Juiz no 2.
   - Preset → motores de famílias diferentes + juiz Sol xhigh.
2. Se busca fraca: colocar `BRAVE_SEARCH_API_KEY` (ou Tavily) no env da VM (`/etc/sennin/luca-ai.env` ou stack de env referenciado).
3. Confirmar SHA vivo em prod: `readlink /opt/sennin/luca-ai/current` + health/version.

### Onda 2 (após decisões do usuário)

1. Protocolo **depth 3**: fila de fala round-robin, quadro de negociação, teto de ciclos, juiz com dissenso.
2. **Ledger** compacto por missão (gargalo 6).
3. **Triagem** de formato/domínio (gargalo 5) — auto+override ou manual.
4. Reavaliar timeout 9Router 120s vs depth 3 / 20k tokens.
5. Revisar se juiz deve ser de família **diferente** da maioria dos participantes (hoje Sol xhigh também pode aparecer como participante em presets).

### Não fazer sem pedido

- Reabrir NexARQ Linear polish (cancelado no perfil do usuário).
- Escrever no Yume (GET-only via Kamui).
- Usar `worker/` legado em produção.

---

## Bugs, riscos e pontos de atenção

| Item | Status |
|------|--------|
| Depth 3 ≠ consenso | **Risco de UX:** UI diz “Máx.” mas comportamento = depth 2 + 20k tokens. Documentado; TODO no código. |
| Timeout 9Router 120s | Rodadas longas (depth 3) podem falhar — **não verificado** em carga real. |
| DuckDuckGo sem chave | Funciona out-of-box; qualidade inferior a Brave/Tavily. |
| Juiz = mesma rota Sol xhigh que alguns participantes | Prompt do juiz manda não favorecer identidade; viés de família ainda possível. |
| Releases sob `/opt/sennin/luca-ai` owned by root | Deploy precisa `sudo mkdir/chown` + `sudo ln -sfn` + `sudo systemctl restart`. |
| Working tree com `.scratch/luca-deploy-*` untracked | Lixo de stage local; não commitar. |
| Suite no momento da onda | 358 testes verdes; HEAD atual pode ter mais testes — **re-rodar gate** antes de novo deploy. |
| Falha intermediária de teste de anexos | Resolvida na onda: `buildUserContent` inlina anexos; teste antigo esperava texto puro. |

### Regras de arquitetura (invioláveis)

- Yume: **GET-only** via Kamui; LUCA não escreve no Yume.
- Rotas 9Router: catálogo fechado (`server/config.js`, `server/state.js` + sanitização de templates).
- `worker/`: legado, fora de produção.
- Prod: Express :4242; 9Router API prod tipicamente `127.0.0.1:20129` (dashboard :20128 — pitfall de porta); Kamui :1338.

---

## Contexto essencial para continuar

### Paths

- Repo: `C:/Projetos/luca-ai`
- Docs produto: `docs/arquitetura.md`, `docs/operacao.md`, `docs/integracoes.md`
- Runtime skill: `luca-ai-runtime` (Hermes)
- Handoffs irmãos em `DocsDev/`: anexos/v0.3.0, home entrada binária, etc.

### Arquivos-chave da onda 1

```
server/agent-tools.js
server/agent-loop.js
server/agent-tools-search.test.js
server/persona-team.js
server/persona-team.test.js
server/index.js
server/team-templates.js
server/luca-preset-models.test.js
server/luca-individual-depth-ui.test.js
shared/luca-preset-seed.js
shared/luca-preset-seed.d.ts
src/lib/api.ts
src/lib/types.ts
src/lib/lucaPresets.ts
src/pages/LucaAiPage.tsx
```

### Delegações da sessão

| ID | Conteúdo |
|----|----------|
| `deleg_af2a9276` | 3 frentes: tools + models + depth backend |
| `deleg_7cb059d3` | Continuação depth: UI + client + gates |

Transcripts live (podem expirar):  
`C:\Users\user\AppData\Local\hermes\cache\delegation\live\deleg_af2a9276\`  
`C:\Users\user\AppData\Local\hermes\cache\delegation\live\deleg_7cb059d3\`

### Comandos úteis

```bash
# gates
cd /c/Projetos/luca-ai && npm test && npm run typecheck && npm run build

# stage
npm run stage:release

# SSH / deploy (padrão usado na sessão)
ssh -i "C:/Users/user/.ssh/oracle-9router" sennin@57.156.59.165
# release dir: /opt/sennin/luca-ai/releases/<sha>
# current: /opt/sennin/luca-ai/current
# sudo systemctl restart luca-ai
# curl -s http://127.0.0.1:4242/api/health
```

### Estado mental do produto pós-sessão

Onda 1 **entregue e deployada** para teste prático. Inteligência ainda incompleta: sem consenso real no depth 3, sem triagem de domínio, sem ledger. Próximo valor alto depende das **2–3 decisões do usuário** listadas acima, não de mais código aleatório.

---

## O que este handoff **não** cobre

- Commits posteriores a `e7d88ce` (anexos, home cyber, equipe visual, Sompo cases, etc.) — ver handoffs irmãos e `git log`.
- Estado atual exato do symlink de produção após deploys posteriores — **não verificado** ao fechar este arquivo.
- Conteúdo de secrets em `/etc/sennin/*.env` — não copiar para docs.
