# SwarmCollector-ready-to-ship — LUCA-AI

Coletor do enxame `ready-to-ship`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/ready-to-ship` @ `052c991`
- Branch integração: `swarm/LUCA-AI/ready-to-ship-integracao` @ `052c991` (criada localmente neste coletor)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor ready-to-ship)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `e5fa97d` | `fix(release): expose package version on /api/health` | **aprovar** | Integrado em `ready-to-ship-integracao` |
| `052c991` | `chore(enxame): fecha rodada ready-to-ship no SwarmLedger` | **aprovar** | Ledger da rodada; sem código de produto extra |

## Diff em escopo
- `server/config.js` — `readProjectVersion()` + `PACKAGE_VERSION` a partir de `package.json` (sem hardcode)
- `server/index.js` — `/api/health` expõe `version: PACKAGE_VERSION`
- `server/release-metadata.test.js` — source-lock 2 testes
- `SwarmLedger-ready-to-ship.md` — claim fechado; Livre: deploy/branch guard se wrangler voltar; worker DO health se reentrar comercial; preflight/docs de health

Fora de escopo (não tocado): `src/*`, `index.html` (landing), docs, `_afk-marketing/*`, worker DO cloud, push/deploy.

## Validação
```
# execução (worktree)
cd C:/Projetos/LUCA-AI-ready-to-ship
node --check server/config.js server/index.js
node --test server/release-metadata.test.js   # 2/2 pass
# integração (checkout principal)
git branch swarm/LUCA-AI/ready-to-ship-integracao swarm/LUCA-AI/ready-to-ship
node --check server/config.js server/index.js
node --test server/release-metadata.test.js   # 2/2 pass
# runtime read: PACKAGE_VERSION === '0.2.0' === package.json
```
Conflitos: nenhum (branch linear sobre `b14f395`; uma entrega; escopo só release metadata).

## Decisão
**aprovar** e manter integração local em `swarm/LUCA-AI/ready-to-ship-integracao`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Guard de deploy/branch se wrangler/worker cloud voltar a ser caminho de release
2. Alinhar worker cloud `/api/health` com `package.json` se DO cloud reentrar no fluxo comercial
3. Preflight/docs que citem campos de health após `version`

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só este relatório; dirty `_afk-marketing/` intocado)
- Sem reabrir version single-source já shipada
- Sem misturar landing/contínuo/visual/docs/bugs
