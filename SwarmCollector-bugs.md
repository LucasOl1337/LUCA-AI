# SwarmCollector-bugs — LUCA-AI

Coletor do enxame `bugs`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/bugs` @ `1e2a890`
- Branch integração: `swarm/LUCA-AI/bugs-integracao` @ `18f470d` (produto bugs ≡ execução `1e2a890` / cherry-picks até `7e23deb`)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02T16:19:01Z (AFK cron NX coletor bugs)
- Fila nova desde `4ae66f7`: **2 produto + 2 ledger** (activity empty + run re-send)

## Fila revisada

| Commit (execução) | Mensagem | Classificação | Ação |
|---|---|---|---|
| `8b57dd3` | `fix(ux): Tools catalog error gains retry CTA` | **aprovar** | Já em `bugs-integracao` (`a22ce7d`) |
| `6e02cda` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger Tools; sem produto extra |
| `05bb20b` | `fix(ux): Admin empty state gains primary CTA` | **aprovar** | Cherry-pick → `6368099` |
| `263d679` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger Admin → `e0072f9` |
| `aabcde0` | `fix(ux): LUCA-AI persona picker empty gains clear CTA` | **aprovar** | Cherry-pick → `5b2c7b2` |
| `2ab6ca0` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger picker → `055d9dc` |
| `0b349a3` | `fix(ux): LUCA-AI chat canvas empty gains focus-mission CTA` | **aprovar** | Cherry-pick → `84b3e6d` |
| `7401bdd` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger canvas; sem produto extra |
| `1c567c3` | `fix(ux): LUCA-AI mid-session chat error gains retry CTA` | **aprovar** | Cherry-pick → `9af7557` |
| `b3cf2bc` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger chat-notice; sem produto extra |
| `1c2b4b7` | `fix(ux): LUCA-AI activity empty gains focus-mission CTA` | **aprovar** | Cherry-pick → `aa635ed` |
| `e8ee1d6` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger activity; coberto no sync do ledger tip |
| `45ea5ae` | `fix(ux): LUCA-AI run failure keeps mission and re-sends` | **aprovar** | Cherry-pick → `7e23deb` |
| `1e2a890` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger run-retry; sync blob tip → integração |

Diff produto `bugs` vs `bugs-integracao` nos paths de escopo (LucaAiPage + 7 locks + Admin/Tools/index.css): **vazio** (blob hash match). Ledger tip `1e2a890` sincronizado no commit de fechamento do coletor.

## Diff em escopo (já integrado)

### Tools error (`8b57dd3`)
- `src/pages/ToolsPage.tsx` + `server/tools-error-cta.test.js` — `data-tools-retry` / `reloadKey`

### Admin empty (`05bb20b` → `6368099`)
- `src/pages/AdminPage.tsx` — `data-admin-empty` + dual CTA clear/retry
- `src/index.css` — `.admin-empty-actions` ≥44px
- `server/admin-empty-cta.test.js` — 3 locks

### Persona picker empty (`aabcde0` → `5b2c7b2`)
- `src/pages/LucaAiPage.tsx` — `data-luca-picker-empty` + clear/close
- `server/luca-picker-empty-cta.test.js` — 2 locks

### Canvas empty (`0b349a3` → `84b3e6d`)
- `src/pages/LucaAiPage.tsx` — `data-luca-canvas-empty` + `data-luca-canvas-focus-mission` (“Escrever missão” → `#luca-ai-mission`)
- `server/luca-canvas-empty-cta.test.js` — 2 locks

### Mid-session chat notice (`1c567c3` → `9af7557`)
- `src/pages/LucaAiPage.tsx` — shell `data-luca-chat-error` + `role=alert`; `Notice` com `data-luca-chat-retry` / `data-luca-chat-dismiss`
- `server/luca-chat-error-cta.test.js` — 2 locks

### Activity empty (`1c2b4b7` → `aa635ed`)
- `src/pages/LucaAiPage.tsx` — `LucaProcessTerminal` empty → `data-luca-activity-empty` + CTA `data-luca-activity-focus-mission` (idle only)
- `server/luca-activity-empty-cta.test.js` — 2 locks

### Run re-send (`45ea5ae` → `7e23deb`)
- `src/pages/LucaAiPage.tsx` — `errorRetry` personas|run; `runMission` limpa draft só em `data.ok`; notice `data-luca-chat-error-kind=run` + CTA `Reenviar missão` → `runMission()`
- `server/luca-chat-run-error-cta.test.js` — 3 locks

Fora de escopo (não tocado): `EndpointsPage` / Personas **error** (contínuo), auth CSS (visual), `index.html` (landing), release/install-vm (ready-to-ship), docs, `_afk-marketing/*`, push/deploy.

## Validação
```
git checkout swarm/LUCA-AI/bugs-integracao
# cherry-pick 1c2b4b7 → aa635ed; 45ea5ae → 7e23deb (limpo)
# produto bugs ≡ integracao (rev-parse blob hash match em 11 paths de produto/lock)
git checkout swarm/LUCA-AI/bugs -- SwarmLedger-bugs.md
node --test server/luca-chat-run-error-cta.test.js server/luca-activity-empty-cta.test.js server/luca-chat-error-cta.test.js server/luca-canvas-empty-cta.test.js server/luca-picker-empty-cta.test.js server/admin-empty-cta.test.js server/tools-error-cta.test.js
# 16/16 pass @ 2026-08-02T16:19:01Z
node --check server/luca-chat-run-error-cta.test.js server/luca-activity-empty-cta.test.js server/luca-chat-error-cta.test.js server/luca-canvas-empty-cta.test.js server/luca-picker-empty-cta.test.js server/admin-empty-cta.test.js server/tools-error-cta.test.js
rg data-luca-activity-empty|data-luca-activity-focus-mission|data-luca-chat-error-kind|errorRetry|Reenviar missão → presentes
```
Conflitos: nenhum. Cherry-picks limpos. Superfícies disjuntas do contínuo. Órfãos (Tools empty / Histórico / GlobalChat) não reabertos. Chat-notice shell reaproveitado com kind run — sem reabrir dismiss/personas path.

## Decisão
**aprovar**. Integração local completa em `swarm/LUCA-AI/bugs-integracao` @ `18f470d` (produto ≡ `bugs` @ `1e2a890`).  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Residual live `luca-ai` friction **disjunto** de start-state / picker / canvas / chat-notice / activity-empty / run-retry (e contínuo error CTAs)
2. Tools empty “Nenhuma ferramenta” **só se** a página voltar ao `ACTIVE_PAGES` / App
3. **Não** reabrir: Tools error, Admin empty, picker empty, canvas empty, chat notice mid-session, activity empty, run re-send / `errorRetry`
4. **Não** tocar órfãos: `HistoricoPage`, `GlobalChat` / Operacional (sem route no App)

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só ledger + este relatório; dirty `_afk-marketing/` intocado)
- Sem reabrir CTAs já shipadas
- Sem misturar contínuo/landing/visual/docs/ready-to-ship
- Sem inventar worktree; coletor usou branches no checkout principal
