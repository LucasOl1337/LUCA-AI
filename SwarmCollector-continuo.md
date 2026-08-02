# SwarmCollector-continuo — LUCA-AI

Coletor do enxame `contínuo`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/enxame-continuo` @ `499227d` (worktree `C:/Projetos/LUCA-AI-enxame`)
- Branch integração: `swarm/LUCA-AI/continuo-integracao` @ `499227d` (criada localmente neste coletor)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor contínuo)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `90ce39d` | `fix(ux): Endpoints error state gets retry CTA` | **aprovar** | Integrado em `continuo-integracao` |
| `7809284` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger da rodada Endpoints; sem código de produto extra |
| `158adde` | `fix(ux): Admin error state gets retry CTA` | **aprovar** | Integrado em `continuo-integracao` |
| `499227d` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger da rodada Admin; sem código de produto extra |

## Diff em escopo
- `src/pages/EndpointsPage.tsx` — falha de `/api/catalog/endpoints` vira `role=alert` + `data-endpoints-error` + `data-tone=error` + CTA `data-endpoints-retry` (`retryCatalog` / `reloadKey`)
- `server/endpoints-error-cta.test.js` — source-lock do CTA/tone e ban de texto mono morto
- `src/pages/AdminPage.tsx` — falha de overview/users vira `data-admin-error` + CTA `data-admin-retry` → `load(search)`; empty residual ganha `data-admin-empty` (sem CTA empty nesta rodada)
- `src/index.css` — bloco `.admin-state[data-admin-error]` / título / detalhe / hint / actions (tokens `--l-error` / `--l-text-*`)
- `server/admin-error-cta.test.js` — source-lock do retry Admin
- `EnxameTalk.md` — claims fechados; Livre: Histórico empty, GlobalChat empty, Tools error (se bugs não no tip), Admin empty CTA opcional

Fora de escopo (não tocado): `ToolsPage` (bugs), auth CSS / StatePill (visual), `index.html` (landing), release health (ready-to-ship), docs, `_afk-marketing/*`, push/deploy.

## Validação
```
# execução (worktree)
cd C:/Projetos/LUCA-AI-enxame
node --test server/endpoints-error-cta.test.js server/admin-error-cta.test.js   # 4/4 pass

# integração (checkout principal)
git branch swarm/LUCA-AI/continuo-integracao swarm/LUCA-AI/enxame-continuo
git checkout swarm/LUCA-AI/continuo-integracao
node --test server/endpoints-error-cta.test.js server/admin-error-cta.test.js   # 4/4 pass
node --check server/endpoints-error-cta.test.js server/admin-error-cta.test.js
git diff --numstat b14f395..HEAD -- src/pages/EndpointsPage.tsx src/pages/AdminPage.tsx \
  src/index.css server/endpoints-error-cta.test.js server/admin-error-cta.test.js EnxameTalk.md
# Endpoints 36/3 · Admin 19/2 · index.css 33/0 · endpoints-test 28/0 · admin-test 28/0 · EnxameTalk 31/0
```
Conflitos: nenhum (branch linear sobre `b14f395`; Endpoints e Admin disjuntos; visual toca auth/StatePill, bugs toca Tools — paths diferentes). Admin empty CTA residual fica para bugs/executor; contínuo só shipou error retry.

## Decisão
**aprovar** e manter integração local em `swarm/LUCA-AI/continuo-integracao`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Histórico empty sem CTA (`src/pages/HistoricoPage.tsx`) — se a página estiver montada no App
2. GlobalChat empty sem ação (`src/components/GlobalChat.tsx`) — se montado
3. Tools error retry só se bugs ainda não estiver no tip contínuo (bugs já tem `8b57dd3` em `bugs-integracao`)
4. Admin empty “Nenhuma conta encontrada” com CTA contextual (clear/refresh) — **não** reabrir Admin/Endpoints error retry

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só este relatório; dirty `_afk-marketing/` intocado)
- Sem reabrir Endpoints/Admin error já shipados
- Sem misturar bugs/visual/landing/docs/ready-to-ship
- Sem criar worktree extra; só branch de integração local
