# SwarmCollector-bugs — LUCA-AI

Coletor do enxame `bugs`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/bugs` @ `6e02cda`
- Branch integração: `swarm/LUCA-AI/bugs-integracao` @ `6e02cda` (criada localmente neste coletor)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor bugs)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `8b57dd3` | `fix(ux): Tools catalog error gains retry CTA` | **aprovar** | Integrado em `bugs-integracao` |
| `6e02cda` | `chore(enxame): fecha rodada bugs no SwarmLedger` | **aprovar** | Ledger da rodada; sem código de produto extra |

## Diff em escopo
- `src/pages/ToolsPage.tsx` — erro de `/api/catalog/tools` vira `role=alert` + `data-tone=error` + CTA `data-tools-retry` (`retryCatalog` / `reloadKey`); loading com `data-tools-loading`
- `server/tools-error-cta.test.js` — source-lock 2 testes (markers + CTA no bloco de erro)
- `SwarmLedger-bugs.md` — claim fechado; Livre: Histórico empty, GlobalChat empty, Admin empty/error, Tools empty “Nenhuma ferramenta”

Fora de escopo (não tocado): `EndpointsPage.tsx` (contínuo), auth CSS (visual), `index.html` (landing), release health (ready-to-ship), docs, `_afk-marketing/*`, push/deploy.

## Validação
```
# execução (worktree)
cd C:/Projetos/LUCA-AI-bugs
node --test server/tools-error-cta.test.js   # 2/2 pass
git diff --numstat b14f395..8b57dd3 -- src/pages/ToolsPage.tsx server/tools-error-cta.test.js
# 36/3 ToolsPage · 28/0 test (sem flip EOL)

# integração (checkout principal)
git branch swarm/LUCA-AI/bugs-integracao swarm/LUCA-AI/bugs
git checkout swarm/LUCA-AI/bugs-integracao
node --test server/tools-error-cta.test.js   # 2/2 pass
node --check server/tools-error-cta.test.js
```
Conflitos: nenhum (branch linear sobre `b14f395`; uma entrega; nenhuma outra branch swarm toca `ToolsPage.tsx`). Padrão alinhado ao retry de Endpoints (contínuo), em superfície disjunta.

## Decisão
**aprovar** e manter integração local em `swarm/LUCA-AI/bugs-integracao`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Histórico empty sem CTA (`src/pages/HistoricoPage.tsx`)
2. GlobalChat empty sem ação (`src/components/GlobalChat.tsx`)
3. Admin empty/error se ainda colapsados
4. ToolsPage empty “Nenhuma ferramenta” (opcional; **não** reabrir error retry)

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só este relatório; dirty `_afk-marketing/` intocado)
- Sem reabrir Tools error CTA já shipada
- Sem misturar contínuo/landing/visual/docs/ready-to-ship
