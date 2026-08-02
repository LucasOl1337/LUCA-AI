# SwarmCollector-ready-to-ship — LUCA-AI

Coletor do enxame `ready-to-ship`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/ready-to-ship` @ `c916295`
- Branch integração: `swarm/LUCA-AI/ready-to-ship-integracao` @ `67eca65` → este commit de revalidação
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor ready-to-ship, revalidação)
- Fila nova: **vazia** (`ready-to-ship` é ancestral de integração; `git log integracao..execucao` = 0)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `e5fa97d` | `fix(release): expose package version on /api/health` | **aprovar** | Já em integração (`87c183c`) |
| `052c991` | `chore(enxame): fecha rodada ready-to-ship no SwarmLedger` | **aprovar** | Já em integração |
| `6ba3f18` | `fix(release): fail closed install-vm when /api/health version drifts` | **aprovar** | Já em integração (`9abce8c`) |
| `c916295` | `chore(enxame): fecha rodada ready-to-ship no SwarmLedger` | **aprovar** | Já em integração |

Nenhum commit novo na execução desde a coleta anterior (`67eca65`).

## Diff em escopo (rodadas já integradas)
- `server/config.js` / `server/index.js` / `server/release-metadata.test.js` — `PACKAGE_VERSION` no `/api/health`
- `deploy/install-vm.sh` — `INSTALL_VM_HEALTH_GATE_V1` fail-closed session→health→state
- `server/install-vm-health-gate.test.js` — source-lock do gate
- `SwarmLedger-ready-to-ship.md` — Em andamento vazio; Livre residual só worker DO / preflight / deploy guard se wrangler voltar

Fora de escopo (não tocado): `src/*`, `index.html` (landing), docs, `_afk-marketing/*`, worker DO cloud, push/deploy.

## Validação (revalidação 2026-08-02)
```
git rev-parse ready-to-ship ready-to-ship-integracao
# c916295 / 67eca65
git log --oneline integracao..execucao  # vazio
git merge-base --is-ancestor ready-to-ship ready-to-ship-integracao  # yes

cd C:/Projetos/LUCA-AI-ready-to-ship
node --check server/config.js server/index.js
node --test server/install-vm-health-gate.test.js server/release-metadata.test.js
# 4/4 pass
# pkg 0.2.0 · PACKAGE_VERSION true · health version: PACKAGE_VERSION · INSTALL_VM_HEALTH_GATE_V1 true
```
Conflitos: nenhum. Merge novo: **não necessário**.

## Decisão
**aprovar** (revalidação; sem delta). Integração local permanece em `swarm/LUCA-AI/ready-to-ship-integracao` com tip de execução `c916295` já contido.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Preflight/docs que citem campos de health após `version` (se ainda mentirem)
2. Guard de deploy/branch se wrangler/worker cloud voltar a ser caminho de release
3. Alinhar worker cloud `/api/health` com `package.json` **somente** se DO cloud reentrar no fluxo comercial

Não reabrir: Express health field (`e5fa97d`) nem install-vm health gate (`6ba3f18`).

## Anti-padrões evitados
- Sem merge/push/PR/deploy na main
- Sem `git add -A` (dirty `_afk-marketing/` intocado)
- Sem reabrir continuous/landing/visual/docs/bugs
- Sem worktree nova (branches only, conforme prompt do coletor)
- Sem inventar fila quando execução não avançou
