# SwarmCollector-continuo — LUCA-AI

Coletor do enxame `contínuo`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/enxame-continuo` @ `6095faf` (worktree `C:/Projetos/LUCA-AI-enxame`)
- Branch integração: `swarm/LUCA-AI/continuo-integracao` @ `b9d4d84` (local; tip produto+ledger; relatório em commit seguinte)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor contínuo — rodadas start-state + landing system status + Layout shell)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `90ce39d` | `fix(ux): Endpoints error state gets retry CTA` | **aprovar** | Já em `continuo-integracao` (coleta anterior) |
| `7809284` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger Endpoints |
| `158adde` | `fix(ux): Admin error state gets retry CTA` | **aprovar** | Já em `continuo-integracao` (coleta anterior) |
| `499227d` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger Admin |
| `5dd45f3` → `f195d74` | `fix(ux): Personas Yume error/empty gain recovery CTAs` | **aprovar** | Já em integração (coleta Personas) |
| `2d79def` → `4144334` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger Personas |
| `b3688ba` → `6827dfd` | `fix(ux): LucaAiStartState error prioritizes retry CTA` | **aprovar** | Cherry-pick limpo nesta coleta |
| `68b6d51` → `a6f77bf` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger start-state |
| `b52171f` → `1eddbc5` | `fix(ux): landing system status gains reconnect CTA` | **aprovar** | Cherry-pick limpo nesta coleta |
| `8d6d0f9` → `b373b75` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger landing system status |
| `51dc723` → `6ccabdc` | `chore(enxame): reivindica Layout offline reconnect no EnxameTalk` | **aprovar** | Claim Layout; sem produto extra |
| `f053ac9` → `b1f3974` | `fix(ux): Layout offline badge gains shell reconnect CTA` | **aprovar** | Cherry-pick limpo nesta coleta |
| `6095faf` → `b9d4d84` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger Layout shell |

## Diff em escopo (tip integração)
- `src/pages/EndpointsPage.tsx` — falha catálogo → `data-endpoints-error` + `data-endpoints-retry` (`reloadKey`)
- `server/endpoints-error-cta.test.js` — source-lock Endpoints
- `src/pages/AdminPage.tsx` — falha overview/users → `data-admin-error` + `data-admin-retry` → `load(search)`
- `src/index.css` — bloco `.admin-state[data-admin-error]` (tokens `--l-error` / `--l-text-*`)
- `server/admin-error-cta.test.js` — source-lock Admin error
- `src/pages/PersonasPage.tsx` — Yume fail → `data-personas-error` + `data-personas-retry`; empty → `data-personas-empty` + dual CTA
- `server/personas-recovery-cta.test.js` — source-lock Personas error+empty (2)
- `src/pages/LucaAiPage.tsx` — start error → `role=alert` + `data-luca-start-error` + CTA primário `data-luca-start-retry`; empty mantém Abrir Personas primário
- `server/luca-start-state-cta.test.js` — source-lock start error+empty (2)
- `src/pages/LandingPage.tsx` — offline/operationError → `data-landing-system-status` + `role=alert` + primário `data-landing-system-retry` (`clearOperationError`+`refresh`) + opcional `data-landing-system-dismiss`
- `server/landing-system-status-cta.test.js` — source-lock landing system status (2)
- `src/components/Layout.tsx` — offline após check → sidebar footer + mobile badge viram `data-layout-system-retry` → `refresh()`; online/checking permanece leitura
- `server/layout-system-status-cta.test.js` — source-lock Layout shell (2)
- `EnxameTalk.md` — claims fechados; Livre: Tools empty se rota voltar; Histórico/GlobalChat órfãos; NÃO reabrir start-state / landing system / Layout shell / Personas / Admin / Endpoints recovery

Fora de escopo (não tocado): `ToolsPage` empties (bugs se remount), picker/canvas/chat-notice/activity (bugs), auth CSS / StatePill / agent accents (visual), `index.html` (landing), release health/install-vm/deploy-guard (ready-to-ship), docs, `_afk-marketing/*`, push/deploy.

## Validação
```
# integração (main checkout em continuo-integracao)
cd C:/Projetos/LUCA-AI
git checkout swarm/LUCA-AI/continuo-integracao
git cherry-pick b3688ba 68b6d51 b52171f 8d6d0f9 51dc723 f053ac9 6095faf
# → 6827dfd a6f77bf 1eddbc5 b373b75 6ccabdc b1f3974 b9d4d84
node --test server/layout-system-status-cta.test.js \
  server/landing-system-status-cta.test.js server/luca-start-state-cta.test.js \
  server/personas-recovery-cta.test.js server/admin-error-cta.test.js \
  server/endpoints-error-cta.test.js   # 12/12 pass
node --check server/layout-system-status-cta.test.js \
  server/landing-system-status-cta.test.js server/luca-start-state-cta.test.js \
  server/personas-recovery-cta.test.js server/admin-error-cta.test.js \
  server/endpoints-error-cta.test.js
git diff --numstat b14f395..HEAD -- \
  src/components/Layout.tsx src/pages/LandingPage.tsx src/pages/LucaAiPage.tsx \
  src/pages/PersonasPage.tsx src/pages/EndpointsPage.tsx src/pages/AdminPage.tsx \
  src/index.css server/layout-system-status-cta.test.js \
  server/landing-system-status-cta.test.js server/luca-start-state-cta.test.js \
  server/personas-recovery-cta.test.js server/endpoints-error-cta.test.js \
  server/admin-error-cta.test.js EnxameTalk.md
# Layout 65/14 · Landing 60/17 · LucaAi 48/4 · Personas 92/7 · Endpoints 36/3 ·
# Admin 19/2 · index.css 33/0 · layout-test 44 · landing-test 36 · start-test 50 ·
# personas-test 41 · endpoints-test 28 · admin-test 28 · EnxameTalk 60/0
rg -n "^## " EnxameTalk.md   # Livre · Em andamento · Concluído (únicos)
```
CRLF preservado em Layout/Landing/LucaAi/Personas/Admin. Conflitos: nenhum (cherry-pick linear; paths disjuntos de bugs/visual/landing).

## Decisão
**aprovar** start-state + landing system status + Layout shell reconnect; manter Endpoints/Admin/Personas já aprovados.  
Integração local: `swarm/LUCA-AI/continuo-integracao` @ `b9d4d84` (+ commit do relatório).  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Tools empty “Nenhuma ferramenta disponível” **somente se** a rota Tools voltar ao `App.tsx` (hoje fora do grafo; bugs já shipou Tools error + Admin empty + picker/canvas/chat-notice/activity)
2. Histórico / GlobalChat empty — **órfãos**; só se rotas retornarem
3. residual live luca-ai friction **disjunct** de start-state + landing system status + Layout shell + bugs recovery
4. NÃO reabrir: Personas recovery, Admin/Endpoints error CTA, LucaAiStartState, landing system status (`data-landing-system-*`), Layout shell (`data-layout-system-*`)

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só relatório + cherry-picks seletivos; dirty `_afk-marketing/` intocado)
- Sem reabrir recovery já shipado
- Sem misturar bugs/visual/landing/docs/ready-to-ship
- Sem worktree extra; só branch de integração local
- Sem classificar órfãos como bloqueio
