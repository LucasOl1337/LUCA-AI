# Configuração de equipes + secundárias Yume — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Nova aba **Configuração** na navegação para CRUD de templates de Equipe e Individual (criar, editar, apagar, reordenar), com permissão de usar personas **secundárias do Yume** nesses templates e na bancada.

**Architecture:** Templates saem do hardcode-only de `src/lib/lucaPresets.ts` e passam a viver no workspace da conta (JSON isolado, padrão `chat-library`). Built-ins viram seed. Secundárias entram no run path só via **import local GET** (Kamui/Yume read-only): `personaAgents` deixa de ser só roster `is_official`. UI de Config edita templates; galerias de Equipe/Individual leem a lista ordenada do workspace.

**Tech Stack:** React + Express, workspace JSON (`server/state.js` / store dedicado), Kamui GET-only, testes `node:test`.

---

## Contexto atual (não reinventar)

| Peça | Onde | Comportamento hoje |
| --- | --- | --- |
| Presets hardcode | `src/lib/lucaPresets.ts` | 4 equipes + 5 individuais; só slugs |
| Galeria | `src/pages/LucaAiPage.tsx` (`PresetGallery`, `apply*Preset`) | aplica preset → import oficial + assignments |
| Nav | `src/components/Layout.tsx` `PageId` | `inicio \| luca-ai \| personas \| admin` |
| Secundária UI | picker + `ensurePersonaOfficial` | bloqueada; mensagem “promova no Yume” |
| Secundária API | `executeLucaAiPersonaTeamRun` em `server/index.js` ~2839 | rejeita slug fora do roster oficial |
| Roster | `reconcileOfficialPersonaAgents` | **substitui** `personaAgents` só por `is_official` |
| Workspace | `server/state.js` `system-state.json` | tem `personaAgents`, **sem** templates |

Regra AGENTS.md: **nunca escrever no Yume**. Secundária = GET + cache local no LUCA.

---

## Decisões de produto (fechadas neste plano)

1. **Uma aba** `configuracao` (label **Configuração**), entre Personas e Admin no sidebar; no dock mobile entra junto com as páginas de uso (após Personas).
2. **Dois tipos de template** na mesma página: abas internas **Equipe** e **Individual** (mesmos shapes de hoje).
3. **Ordem** = array order no store; UI com ↑/↓ (ou drag se já houver padrão barato — preferir botões, YAGNI).
4. **Built-ins** (`LUCA_*_PRESETS`) = seed imutável de código. No primeiro GET vazio do workspace, copiar seed para a conta. Usuário pode apagar/editar as cópias; não “reset automático” a cada load.
5. **Secundárias em template e em picker da bancada:** permitido. Ao usar, LUCA faz GET + cache local (`addPersonaAgent` / load system-prompt). Não exige `is_official`.
6. **Ícone do template:** string id de um mapa fechado no frontend (`sprout`, `hardhat`, … + `users` default). Não upload de ícone.
7. **Sem multi-tenant cross-account** e sem admin global de templates: store **por workspace** (como chat-library).

---

## Modelo de dados

Arquivo por conta: `workspaces/<user>/team-templates.json` (espelha isolamento de `chat-library.js`; evita engordar `system-state` e o reconcile de agentes).

```json
{
  "version": 1,
  "team": [
    {
      "id": "risco-agro",
      "label": "Equipe Risco Agro",
      "description": "...",
      "icon": "sprout",
      "assignments": {
        "supervisor": ["supervisor-agentes-ia"],
        "mission": ["planejador-missao"],
        "execution": ["estrategista-risco-agro"],
        "approval": ["curador-personas"],
        "display": ["relator-executivo-risco"]
      }
    }
  ],
  "individual": [
    {
      "id": "comite-risco-agro",
      "label": "Comitê Risco Agro",
      "description": "...",
      "icon": "sprout",
      "participants": ["estrategista-risco-agro"],
      "judge": "relator-executivo-risco"
    }
  ]
}
```

Sanitizers no servidor:

- `id`: slug `[a-z0-9-]{1,64}`; se ausente no create, gerar de label + sufixo curto.
- roles: mesmas caps da bancada (`execution` ≤ 4, `participants` ≤ 5, singles = 1).
- slugs: trim, dedupe, non-empty; **existência no catálogo Yume** validada no create/update (GET list), não só oficiais.
- `icon`: whitelist.

---

## API

Todas autenticadas + `runWithWorkspaceUser` (já no middleware).

| Método | Path | Função |
| --- | --- | --- |
| `GET` | `/api/luca-ai/team-templates` | lista ordenada; seed se vazio |
| `POST` | `/api/luca-ai/team-templates` | body `{ kind: 'team'\|'individual', template }` create append |
| `PUT` | `/api/luca-ai/team-templates/:kind/:id` | replace um template |
| `DELETE` | `/api/luca-ai/team-templates/:kind/:id` | remove |
| `PUT` | `/api/luca-ai/team-templates/:kind/order` | body `{ ids: string[] }` reordena (ids devem ser permutação do kind) |

Registrar em `shared/endpoint-catalog.js`.

Cliente: `src/lib/api.ts` (`listTeamTemplates`, `createTeamTemplate`, …).

---

## Secundárias — mudanças de runtime (obrigatórias)

### 1. `reconcileOfficialPersonaAgents` (`server/persona-cards.js`)

Hoje: roster = só oficiais (apaga o resto).

Novo:

- `official` = personas Yume com `is_official === true` (como hoje).
- `retained` = entradas locais em `personaAgents` cujo slug **ainda existe no catálogo Yume** e **não** é oficial (secundárias importadas/usadas).
- Resultado = `official + retained` (oficiais primeiro, retained estáveis).
- Se Yume não manda `is_official` boolean → manter throw de contrato.

### 2. Gate de run (`executeLucaAiPersonaTeamRun`)

Trocar “só official roster” por:

```js
// slug ok se: está no catálogo Yume (GET) E (is_official || já em personaAgents local OU vamos carregar agora)
```

Fluxo mínimo:

1. Listar catálogo Yume (já via `syncOfficialPersonaRoster` / list).
2. Para cada slug pedido: se não está no catálogo → 400 `persona_not_found`.
3. Se está no catálogo (oficial ou não): `load` system-prompt via Kamui e `addPersonaAgent`/update cache (já existe caminho de load).
4. Remover erro `persona_not_official` **ou** reutilizá-lo só quando slug não existe no Yume.

### 3. UI bancada (`LucaAiPage.tsx`)

- Remover bloqueio duro de `ensurePersonaOfficial` para **seleção em equipe/individual** e apply preset.
- Picker: secundárias **clicáveis** (não `disabled`); badge “Secundária” em vez de cadeado.
- Manter aviso curto: secundária roda via cache local LUCA; promoção no Yume continua opcional (não bloqueante).
- `setPersonaModel` / config de motor: permitir para secundária já cacheada (override local, sem write Yume).

### 4. Import path

Reusar `POST /api/agent/persona/add` (ou load no ensure) para qualquer slug do catálogo, não só oficial — auditar handler em `server/index.js` e alinhar com o gate acima.

---

## Frontend — navegação + página

### Nav

- `PageId` += `'configuracao'`
- `ACTIVE_PAGES` em `App.tsx`
- `navItems` + `dockIds` em `Layout.tsx` (ícone `Settings` / `SlidersHorizontal`)
- `case 'configuracao': return <ConfiguracaoPage />`

### `src/pages/ConfiguracaoPage.tsx` (novo)

Layout denso operador (padrão Personas/Admin):

1. Header: título + contagem equipe/individual.
2. Toggle **Equipe | Individual**.
3. Lista ordenada de cards:
   - label, description, chips de slugs/papéis, ícone
   - ações: Editar, ↑, ↓, Apagar (confirm)
4. Botão **Nova equipe / Nova seleção**.
5. Editor (drawer ou painel lateral):
   - campos label, description, icon select
   - **Equipe:** 5 role rows reutilizando o mesmo picker mental da bancada, mas **com secundárias habilitadas**
   - **Individual:** participantes + juiz
   - Salvar / Cancelar

Não reescrever `LucaAiPage` inteiro: extrair só o que for barato (`PersonaAvatar` já local; picker pode ser componente copiado/enxuto na Config se extrair for >30 min — preferir extrair `PersonaRolePicker` se tocado nos dois lados).

### Galerias na bancada

- `LucaAiPage` deixa de importar listas fixas como única fonte.
- No load: `GET /api/luca-ai/team-templates` → state `teamPresets` / `individualPresets`.
- Mapear `icon` string → `LucideIcon` via mapa em `lucaPresets.ts` (exportar `PRESET_ICON_MAP` + seed constants).
- `match*` / apply continuam iguais, só com dados remotos.

---

## Tasks (bite-sized)

### Task 1: Store workspace de templates + seed

**Objective:** Persistência isolada por conta com seed dos built-ins.

**Files:**

- Create: `server/team-templates.js`
- Create: `server/team-templates.test.js`
- Modify: `src/lib/lucaPresets.ts` (exportar seed serializável sem componentes React — `icon` string no seed; mapa de ícones separado)

**Step 1:** Testes: seed em workspace vazio; create/update/delete/reorder; isolamento user-a vs user-b.

**Step 2:** Implementar load/save JSON, sanitize, seed a partir de constantes espelhadas (duplicar seed no server como data pura OU ler de `shared/luca-preset-seed.js` — preferir **`shared/luca-preset-seed.js`** para um único source de truth de slugs/labels; frontend importa seed só para types/icons).

**Step 3:** `node --test server/team-templates.test.js` PASS.

### Task 2: Rotas HTTP + catalog

**Objective:** Expor CRUD/order autenticado.

**Files:**

- Modify: `server/index.js`
- Modify: `shared/endpoint-catalog.js`
- Modify: `src/lib/api.ts` (+ types em `src/lib/types.ts` se necessário)

**Step 1:** Testes de contrato (status 401 sem auth se o padrão do repo tiver harness; senão unit do handler via import das funções do store).

**Step 2:** Wire rotas.

### Task 3: Secundárias no runtime

**Objective:** Secundária do catálogo Yume pode ser cacheada e rodar.

**Files:**

- Modify: `server/persona-cards.js` (+ testes existentes `persona-roster*`)
- Modify: `server/index.js` (`executeLucaAiPersonaTeamRun`, import persona)
- Modify/Create: testes em `server/persona-team.test.js` ou novo `server/persona-secondary-run.test.js` com mocks de Kamui se o repo já mocka

**Step 1:** Test reconcile retém secundária local presente no catálogo.

**Step 2:** Test run não rejeita secundária com slug no catálogo.

**Step 3:** Implementar mínimo.

### Task 4: UI bancada — desbloquear secundárias

**Objective:** Picker e ensure permitem secundária; badge claro.

**Files:**

- Modify: `src/pages/LucaAiPage.tsx`
- Modify: `server/persona-roster-ui.test.js` (asserts de disabled/secundária)

**Step 1:** Atualizar testes de string/UI que exigem `disabled={secondary`.

**Step 2:** Remover bloqueio; secundárias selecionáveis; copy do painel “bloqueadas para execução” → “disponíveis via cache local”.

### Task 5: Nav + página Configuração (lista + CRUD)

**Objective:** Aba nova com lista, create/edit/delete/reorder.

**Files:**

- Create: `src/pages/ConfiguracaoPage.tsx`
- Modify: `src/App.tsx`, `src/components/Layout.tsx`
- Modify: `src/lib/api.ts`

**Step 1:** Nav + página esqueleto lista GET.

**Step 2:** Create/edit form + DELETE + order buttons.

**Step 3:** Smoke visual localhost (product-local-preview se for validar com o dono).

### Task 6: Bancada consome templates do workspace

**Objective:** Galerias Equipe/Individual usam API, não só hardcode.

**Files:**

- Modify: `src/pages/LucaAiPage.tsx`
- Modify: `src/lib/lucaPresets.ts` (helpers icon + match reutilizados)

**Step 1:** fetch templates no bootstrap da página (junto com personas).

**Step 2:** apply preset inalterado na forma; slugs secundários passam pelo novo ensure.

### Task 7: Verificação composta

**Commands:**

```bash
npm run test
npm run typecheck
npm run build
```

Checklist manual:

1. Nav mostra Configuração; dock mobile ok.
2. Criar equipe com 1 secundária + oficiais; reordenar; apagar.
3. Na bancada, galeria mostra a nova; apply preenche papéis.
4. Run individual/team com secundária completa (sem 400 `persona_not_official`).
5. Conta B não vê templates da conta A.
6. Yume permanece GET-only (sem POST Kamui write).

---

## Files likely to change (resumo)

| Path | Ação |
| --- | --- |
| `shared/luca-preset-seed.js` | create — seed data pura |
| `server/team-templates.js` | create — store |
| `server/team-templates.test.js` | create |
| `server/persona-cards.js` | retain secondaries |
| `server/index.js` | rotas + gate run |
| `shared/endpoint-catalog.js` | endpoints |
| `src/lib/lucaPresets.ts` | icons map; reexport seed shape |
| `src/lib/api.ts` / `types.ts` | client |
| `src/pages/ConfiguracaoPage.tsx` | create |
| `src/pages/LucaAiPage.tsx` | picker + fetch templates |
| `src/App.tsx`, `src/components/Layout.tsx` | nav |
| testes UI roster / catalog | adjust |

---

## Riscos e tradeoffs

| Risco | Mitigação |
| --- | --- |
| Secundária some do Yume depois de salva no template | Run 400 `persona_not_found`; Config mostra chip “ausente no catálogo” |
| `reconcile` apagava secundárias | retain explícito (Task 3) |
| Presets hardcode vs workspace divergem | seed one-shot; built-in code só para seed/fallback empty |
| Página Config fica monólito | um arquivo primeiro; extrair picker só se >~400 linhas novas |
| Run mais lento com N secundárias frias | load paralelo já existe em `Promise.all(slugsToLoad.map…)` |

## Fora de escopo (YAGNI)

- Escrever/promover persona no Yume
- Drag-and-drop fancy
- Templates globais admin
- Versionamento/histórico de templates
- Compartilhar template entre contas
- Ícones custom upload
- Alterar papéis do workflow (continuum supervisor…display fixo)

## Open questions (defaults se não responder)

1. **Reset para seed de fábrica?** Default: botão “Restaurar padrões” opcional na Config (re-seed replace). Implementar só se sobrar tempo após CRUD.
2. **Secundária também no chat single-persona fora da bancada?** Default: **sim no mesmo gate** de load, para não ter dois mundos; se arriscado, limitar a `persona-team/run`.

---

## Ordem de execução sugerida

1 → 2 → 3 → 4 → 5 → 6 → 7

Backend store + secundárias antes da UI de Config, para a página já nascer no contrato final.
