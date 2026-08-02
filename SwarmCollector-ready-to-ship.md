# SwarmCollector-ready-to-ship — LUCA-AI

Coletor do enxame `ready-to-ship`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/ready-to-ship` @ `c916295`
- Branch integração: `swarm/LUCA-AI/ready-to-ship-integracao` @ `9abce8c` (merge local do tip de execução)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor ready-to-ship)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `e5fa97d` | `fix(release): expose package version on /api/health` | **aprovar** | Já em integração (coletor anterior `87c183c`) |
| `052c991` | `chore(enxame): fecha rodada ready-to-ship no SwarmLedger` | **aprovar** | Já em integração |
| `6ba3f18` | `fix(release): fail closed install-vm when /api/health version drifts` | **aprovar** | Integrado via merge `9abce8c` |
| `c916295` | `chore(enxame): fecha rodada ready-to-ship no SwarmLedger` | **aprovar** | Ledger da rodada install-vm gate |

## Diff em escopo (nova rodada)
- `deploy/install-vm.sh` — marker `INSTALL_VM_HEALTH_GATE_V1`: após `/api/auth/session`, lê `package.json` version, `curl /api/health`, fail closed se `ok`/`service=luca-ai`/`version` divergirem; imprime `HEALTH_VERSION`
- `server/install-vm-health-gate.test.js` — source-lock ordem session→health→state + ban fallback `0.9.5`
- `SwarmLedger-ready-to-ship.md` — claim fechado; Livre residual: worker DO health, preflight/docs, deploy/branch guard se wrangler voltar

Já shipado e revalidado:
- `server/config.js` / `server/index.js` / `server/release-metadata.test.js` — `PACKAGE_VERSION` no health

Fora de escopo (não tocado): `src/*`, `index.html` (landing), docs, `_afk-marketing/*`, worker DO cloud, push/deploy.

## Validação
```
git checkout swarm/LUCA-AI/ready-to-ship-integracao
git merge --no-edit swarm/LUCA-AI/ready-to-ship
# → 9abce8c (ort, clean)

node --check server/config.js server/index.js
node --test server/install-vm-health-gate.test.js server/release-metadata.test.js
# 4/4 pass

# runtime read: package.json version 0.2.0; health field version: PACKAGE_VERSION presente
```
Conflitos: nenhum (merge ort linear sobre `052c991`; escopo só release/install gate).

## Decisão
**aprovar** e manter integração local em `swarm/LUCA-AI/ready-to-ship-integracao` @ `9abce8c`.  
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
