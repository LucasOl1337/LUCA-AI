# SwarmCollector-docs — LUCA-AI

Coletor do enxame `docs` (higiene documental). Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/docs` @ `5a3c84f` (worktree `C:/Projetos/LUCA-AI-docs`)
- Branch integração: `swarm/LUCA-AI/docs-integracao` @ `5a3c84f` (criada localmente neste coletor)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor docs)
- Em andamento no ledger: nenhum

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `2078b13` | `docs(canonical): alinha AGENTS/INDEX com producao Express na VM` | **aprovar** | Integrado em `docs-integracao` |
| `88d8377` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 1 |
| `9c195e8` | `docs(canonical): README stack deixa de listar Cloudflare Workers como runtime` | **aprovar** | Integrado em `docs-integracao` |
| `64960c1` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 2 |
| `cecc361` | `docs(canonical): arquitetura deixa de chamar borda de Worker` | **aprovar** | Integrado em `docs-integracao` |
| `5a3c84f` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 3; tip |

## Diff em escopo
- `AGENTS.md` — produção = Express + proxy `deploy/luca-ai-vm-proxy.js` + Tunnel; `worker/` + DO = legado; remove “Worker Cloudflare publicado em app.luca-ai.com.br” e regra de migration DO no commit
- `INDEX.md` — `deploy/` = publicação VM; `worker/`/`wrangler.jsonc` = legado; integrações apontam publicação pela VM
- `README.md` — stack sem bare “Cloudflare Workers”; Tunnel + proxy; `worker/` legado
- `docs/arquitetura.md` — intro “borda Cloudflare (proxy/Tunnel)”; fluxo produção nomeia proxy, não “Worker de borda”
- `scripts/docs-production-path.test.js` — source-lock 4 testes (AGENTS, INDEX, README, docs/*)
- `DocsSwarm.md` — 3 rodadas fechadas; Livre residual abaixo

Fora de escopo (não tocado): `src/*`, landing `index.html`, ready-to-ship health, contínuo/bugs UX, visual CSS, `_afk-marketing/*`, push/deploy.

## Validação
```
# execução (worktree)
cd C:/Projetos/LUCA-AI-docs
node --test scripts/docs-production-path.test.js   # 4/4 pass
# tip linear sobre b14f395; merge-base == b14f395

# integração (checkout principal)
git branch swarm/LUCA-AI/docs-integracao swarm/LUCA-AI/docs
git checkout swarm/LUCA-AI/docs-integracao
node --test scripts/docs-production-path.test.js   # 4/4 pass
```
Conflitos: nenhum (branch linear sobre tip de produto; três rodadas canônicas disjuntas AGENTS/INDEX → README → arquitetura).

## Residual (não bloqueia integração)
- `docs/operacao.md:34` ainda diz **“o Worker de borda `luca-ai-vm-proxy`”** apontando o arquivo certo em `deploy/`. O lock de `arquitetura` baniu a frase no fluxo de produção; operação ficou no Livre do ledger. Classificação do residual: **parcial** (nomenclatura residual, path correto). Próximo executor docs: alinhar a frase a “proxy de borda” + estender o source-lock se quiser fechar o gap.
- `changelog.md` / `patchnotes.md` / `DocsDev/*` históricos: não reescritos (correto; só se contradisserem canônico atual).
- `npm test` não inclui `scripts/*.test.js` — gap operacional opcional de release, não docs canônicos.

## Decisão
**aprovar** as três entregas canônicas e manter integração local em `swarm/LUCA-AI/docs-integracao` @ `5a3c84f`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. `docs/operacao.md` residual “Worker de borda” → “proxy de borda” + assert no lock
2. Só se contradisser AGENTS/INDEX/docs: `changelog.md` / `patchnotes.md`
3. `package.json` `test` incluir `scripts/` se virar gap de release — **não** reabrir AGENTS/INDEX/README/arquitetura já shipados

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só este relatório; dirty `_afk-marketing/` intocado)
- Sem misturar contínuo/visual/landing/bugs/ready-to-ship
- Sem criar worktree extra; só branch de integração local
- Sem “corrigir” DocsDev histórico nesta coleta
