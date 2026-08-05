# SwarmCollector-ready-to-ship — LUCA-AI

Coletor do enxame `ready-to-ship`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/ready-to-ship` @ `ed44986`
- Branch integração: `swarm/LUCA-AI/ready-to-ship-integracao` @ este commit
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02T16:16:47Z (AFK cron NX coletor ready-to-ship)
- Fila nova: **2 fixes** (+ 2 ledger closes na execução; ledger espelhado do tip)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `e5fa97d` | `fix(release): expose package version on /api/health` | **aprovar** | Já em integração |
| `6ba3f18` | `fix(release): fail closed install-vm when /api/health version drifts` | **aprovar** | Já em integração |
| `0dbb43f` | `fix(release): fail preflight when /api/health omits version` | **aprovar** | Já em integração (`e292a06`) |
| `9fbca68` | `fix(release): expose package version on worker cloud /api/health` | **aprovar** | Já em integração (`809f7ee`) |
| `65f2f7a` | `fix(release): fail closed commercial deploy off main` | **aprovar** | Já em integração (`62dd62a`) |
| `97f29a1` | `fix(release): stage commercial tarballs behind deploy guard` | **aprovar** | Cherry-pick → `72adf08` |
| `171dad5` | `fix(release): force-local tar paths on Windows stage` | **aprovar** | Cherry-pick → `1ed95fb` |
| `d75d974` / `ed44986` | `chore(enxame): fecha/registra…` | **aprovar** | Ledger consolidado do tip execução |

## Diff em escopo (integrado nesta coleta)
- `deploy/stage-release.mjs` — `STAGE_RELEASE_V1` chama `assertProductionDeployAllowed` antes de `source.tar`/`dist.tar`/`state.tar`; dry-run aberto off-main; write exige `main` ou `ALLOW_NON_MAIN_DEPLOY=1`; `tar --force-local` (Windows drive letter)
- `package.json` — scripts `stage:release` / `deploy:stage`
- `server/stage-release.test.js` — marker/scripts/contract + dry-run + fail-closed + CLI (4)
- `SwarmLedger-ready-to-ship.md` — Em andamento vazio; 7 rodadas em Concluído (incl. stage + force-local); Livre residual docs/bump/changelog

Fora de escopo (não tocado): `src/*`, `index.html` (landing), docs canônicos, `_afk-marketing/*`, push/deploy/main.

## Validação
```
git log --oneline 7d3824a..HEAD
# 1ed95fb 72adf08

node --test server/stage-release.test.js server/deploy-branch-guard.test.js \
  server/install-vm-health-gate.test.js server/release-metadata.test.js \
  server/worker-health-version.test.js server/preflight-health-version.test.js \
  server/preflight.test.js
# 22/22 pass

node deploy/stage-release.mjs --dry-run --commit verify
# exit 0 off-main

DEPLOY_GIT_BRANCH=swarm/… ALLOW_NON_MAIN_DEPLOY= \
  node deploy/stage-release.mjs --skip-build --commit block
# exit 1 DEPLOY_MAIN_ONLY_V1

ALLOW_NON_MAIN_DEPLOY=1 node deploy/stage-release.mjs --skip-build --commit smoke \
  --out C:/Projetos/LUCA-AI/.stage-out-verify
# exit 0; dist.tar prefix dist/

git diff --stat swarm/LUCA-AI/ready-to-ship -- deploy package.json server shared worker
# (vazio — product tip alinhado)
rg -n "^## " SwarmLedger-ready-to-ship.md
# Em andamento / Concluído / Livre (únicos)
```

Conflitos: **nenhum** nos cherry-picks de produto. Ledger espelhado com `git checkout swarm/LUCA-AI/ready-to-ship -- SwarmLedger-ready-to-ship.md`.

## Decisão
**aprovar** — integração local completa de `STAGE_RELEASE_V1` + Windows `--force-local` na `swarm/LUCA-AI/ready-to-ship-integracao`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Docs/operacao que citem health `version` + `npm run stage:release` / `deploy:guard` (opcional; docs swarm)
2. Ao bump de `package.json`, atualizar `shared/release-version.js` (lock `worker-health-version`)
3. Multi-file release notes / changelog se o processo de bump ainda divergir

Não reabrir: Express health, install-vm gate, preflight V1/always, worker health, deploy main-only, `STAGE_RELEASE_V1`.

## Anti-padrões evitados
- Sem merge/push/PR/deploy na main
- Sem `git add -A` (dirty `_afk-marketing/` intocado)
- Sem reabrir contínuo/landing/visual/docs/bugs
- Sem worktree nova (branches only)
- Ledger único sem double `## Concluído`
