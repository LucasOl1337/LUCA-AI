# SwarmCollector-bugs — LUCA-AI

Coletor do enxame `bugs`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/bugs` @ `2ab6ca0`
- Branch integração: `swarm/LUCA-AI/bugs-integracao` @ `055d9dc` (produto bugs alinhado ao tip de execução; tip do coletor abaixo)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02T10:12:53Z (AFK cron NX coletor bugs)

## Fila revisada

| Commit (execução) | Mensagem | Classificação | Ação |
|---|---|---|---|
| `8b57dd3` | `fix(ux): Tools catalog error gains retry CTA` | **aprovar** | Já em `bugs-integracao` (`a22ce7d`) |
| `6e02cda` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger Tools; sem produto extra |
| `05bb20b` | `fix(ux): Admin empty state gains primary CTA` | **aprovar** | Cherry-pick → `6368099` |
| `263d679` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger Admin → `e0072f9` |
| `aabcde0` | `fix(ux): LUCA-AI persona picker empty gains clear CTA` | **aprovar** | Cherry-pick → `5b2c7b2` |
| `2ab6ca0` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger picker → `055d9dc` |

## Diff em escopo (rodada atual)

### Admin empty (`05bb20b` → `6368099`)
- `src/pages/AdminPage.tsx` — empty de contas deixa parágrafo morto; `data-admin-empty` + hint contextual + dual CTA `data-admin-empty-clear` / `data-admin-empty-retry`
- `src/index.css` — layout empty com `.admin-empty-actions` e alvo ≥44px
- `server/admin-empty-cta.test.js` — source-lock 3 testes

### Persona picker empty (`aabcde0` → `5b2c7b2`)
- `src/pages/LucaAiPage.tsx` — `PersonaPickerSheet` empty com `data-luca-picker-empty` + `data-luca-picker-clear` / `data-luca-picker-close`
- `server/luca-picker-empty-cta.test.js` — source-lock 2 testes

### Já integrado (coleta anterior)
- `src/pages/ToolsPage.tsx` + `server/tools-error-cta.test.js` — `data-tools-retry` / `reloadKey`

Fora de escopo (não tocado): `EndpointsPage` / Personas **error** (contínuo), auth CSS (visual), `index.html` (landing), release/install-vm (ready-to-ship), docs, `_afk-marketing/*`, push/deploy.

## Validação
```
git checkout swarm/LUCA-AI/bugs-integracao
# cherry-pick linear: 05bb20b 263d679 aabcde0 2ab6ca0  → 6368099 e0072f9 5b2c7b2 055d9dc
node --test server/tools-error-cta.test.js server/admin-empty-cta.test.js server/luca-picker-empty-cta.test.js
# 7/7 pass
node --check server/tools-error-cta.test.js server/admin-empty-cta.test.js server/luca-picker-empty-cta.test.js
git diff --numstat a22ce7d..055d9dc -- src/pages/AdminPage.tsx src/pages/LucaAiPage.tsx src/index.css server/
# 36/1 AdminPage · 38/1 LucaAiPage · 32/0 index.css · 38+32 tests
```
Conflitos: nenhum (cherry-picks limpos). Superfícies disjuntas entre si e do contínuo (Admin **error** / Personas **error** / Endpoints). Páginas órfãs (Tools empty / Histórico / GlobalChat) não reabertas.

## Decisão
**aprovar** Admin empty + picker empty; manter integração local em `swarm/LUCA-AI/bugs-integracao`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Residual live `LucaAiPage` chrome **disjunto** do picker empty — se ainda houver recovery morto na rota montada
2. Tools empty “Nenhuma ferramenta” **só se** a página voltar ao `ACTIVE_PAGES` / App
3. **Não** reabrir: Tools error, Admin empty, picker empty
4. **Não** tocar órfãos: `HistoricoPage`, `GlobalChat` / Operacional (sem route no App)

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só este relatório; dirty `_afk-marketing/` intocado)
- Sem reabrir CTAs já shipadas
- Sem misturar contínuo/landing/visual/docs/ready-to-ship
- Sem inventar worktree; coletor usou branches no checkout principal
