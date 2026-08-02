# SwarmCollector-ready-to-ship — LUCA-AI

Coletor do enxame `ready-to-ship`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/ready-to-ship` @ `a7bc434`
- Branch integração: `swarm/LUCA-AI/ready-to-ship-integracao` @ este commit
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02T13:00:52Z (AFK cron NX coletor ready-to-ship)
- Fila nova: **3 fixes** (+ 3 ledger closes na execução; ledger fechado via tip da execução)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `e5fa97d` | `fix(release): expose package version on /api/health` | **aprovar** | Já em integração (coleta anterior) |
| `6ba3f18` | `fix(release): fail closed install-vm when /api/health version drifts` | **aprovar** | Já em integração (coleta anterior) |
| `0dbb43f` | `fix(release): fail preflight when /api/health omits version` | **aprovar** | Cherry-pick → `e292a06` |
| `9fbca68` | `fix(release): expose package version on worker cloud /api/health` | **aprovar** | Cherry-pick → `809f7ee` (ledger mid-conflict resolvido) |
| `65f2f7a` | `fix(release): fail closed commercial deploy off main` | **aprovar** | Cherry-pick → `62dd62a` (ledger mid-conflict resolvido com tip execução) |
| `af8bf71` / `d279ea9` / `a7bc434` | `chore(enxame): fecha rodada…` | **aprovar** | Ledger consolidado no tip execução; sem reabrir |

## Diff em escopo (integrado nesta coleta)
- `shared/preflight.js` — `PREFLIGHT_HEALTH_VERSION_V1` + `PREFLIGHT_HEALTH_VERSION_ALWAYS_V1` (version obrigatória mesmo com detail custom)
- `server/preflight.test.js` + `server/preflight-health-version.test.js` — locks preflight
- `shared/release-version.js` + `worker/src/index.js` — `WORKER_HEALTH_VERSION_V1` / `RELEASE_VERSION`
- `server/worker-health-version.test.js` — single-source + cloud health
- `deploy/assert-production-deploy.mjs` + `package.json` scripts `deploy:guard`/`deploy:check` — `DEPLOY_MAIN_ONLY_V1`
- `server/deploy-branch-guard.test.js` — source/CLI lock
- `SwarmLedger-ready-to-ship.md` — Em andamento vazio; 5 rodadas em Concluído; Livre residual docs/bump pair / stage-script wire

Fora de escopo (não tocado): `src/*`, `index.html` (landing), docs canônicos, `_afk-marketing/*`, push/deploy/main.

## Validação
```
git log --oneline 0b30a12..HEAD
# 62dd62a 809f7ee e292a06

node --test server/deploy-branch-guard.test.js   server/install-vm-health-gate.test.js server/release-metadata.test.js   server/worker-health-version.test.js server/preflight-health-version.test.js   server/preflight.test.js
# 18/18 pass

DEPLOY_GIT_BRANCH=main node deploy/assert-production-deploy.mjs     # ok
DEPLOY_GIT_BRANCH=swarm/x node deploy/assert-production-deploy.mjs  # exit 1
DEPLOY_DRY_RUN=1 DEPLOY_GIT_BRANCH=swarm/x …                        # ok dry-run

git diff --stat swarm/LUCA-AI/ready-to-ship -- deploy package.json server shared worker
# (vazio — product tip alinhado)
rg -n "^## " SwarmLedger-ready-to-ship.md
# Em andamento / Concluído / Livre (únicos)
```

Conflitos: **ledger only** em cherry-picks `9fbca68` e `65f2f7a` (Em andamento stale vs tip fechado). Produto sem conflito. Resolvido com ledger do tip `swarm/LUCA-AI/ready-to-ship`.

## Decisão
**aprovar** — integração local completa dos 3 fixes de release na `swarm/LUCA-AI/ready-to-ship-integracao`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Docs/operacao que citem `version` no preflight/worker health (opcional)
2. Ao bump de `package.json`, atualizar `shared/release-version.js` (lock `worker-health-version`)
3. Wiring do `deploy:guard` em pipeline real de packaging/VM **só se** aparecer script de stage

Não reabrir: Express health (`e5fa97d`), install-vm gate (`6ba3f18`), preflight version (`0dbb43f`), worker health (`9fbca68`), deploy main-only (`65f2f7a`).

## Anti-padrões evitados
- Sem merge/push/PR/deploy na main
- Sem `git add -A` (dirty `_afk-marketing/` intocado)
- Sem reabrir contínuo/landing/visual/docs/bugs
- Sem worktree nova (branches only)
- Ledger mid-cherry-pick sem double `## Concluído`
