# SwarmCollector-docs — LUCA-AI

Coletor do enxame `docs` (higiene documental). Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/docs` @ `9ab8b3d` (worktree `C:/Projetos/LUCA-AI-docs`)
- Branch integração: `swarm/LUCA-AI/docs-integracao` @ `0b643da` (merge ort + este relatório)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02T12:11:39Z (AFK cron NX coletor docs)
- Em andamento no ledger: nenhum

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `2078b13` | `docs(canonical): alinha AGENTS/INDEX com producao Express na VM` | **aprovar** | Já em `docs-integracao` (coleta anterior) |
| `88d8377` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 1 |
| `9c195e8` | `docs(canonical): README stack deixa de listar Cloudflare Workers como runtime` | **aprovar** | Já em `docs-integracao` |
| `64960c1` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 2 |
| `cecc361` | `docs(canonical): arquitetura deixa de chamar borda de Worker` | **aprovar** | Já em `docs-integracao` |
| `5a3c84f` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 3; tip da coleta anterior |
| `c21b74f` | `chore(enxame): claim docs operacao/integracoes borda no DocsSwarm` | **aprovar** | Claim transitório |
| `f4fc379` | `docs(canonical): operacao/integracoes deixam de chamar borda de Worker` | **aprovar** | Integrado nesta coleta |
| `80743f7` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 4 |
| `4103c06` | `chore(enxame): claim docs DocsDev/codegraph SUPERSEDED no DocsSwarm` | **aprovar** | Claim transitório |
| `886cc9f` | `docs(historical): DocsDev/codegraph SUPERSEDED pre-VM Worker path` | **aprovar** | Integrado nesta coleta |
| `9ab8b3d` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 5; tip execução |
| `bc53b63` | `chore(enxame): coletor docs aprova path Express/VM canônico` | **aprovar** | Relatório coleta anterior (pai divergente só no coletor) |
| `0b643da` | `chore(enxame): coletor docs integra operacao/integracoes + DocsDev/codegraph SUPERSEDED` | **aprovar** | Merge `docs` → `docs-integracao` |

## Diff em escopo (rodadas 4–5)
- `docs/operacao.md` — “Worker de borda” → “proxy de borda `luca-ai-vm-proxy`”
- `docs/integracoes.md` — remove “único Worker ativo”; proxy mínimo de borda em `deploy/luca-ai-vm-proxy.js` (não runtime de app)
- `DocsDev/codegraph/README.md` — novo banner HISTÓRICO/SUPERSEDED + ponteiros canônicos
- `DocsDev/codegraph/inventory.md` — banner SUPERSEDED no topo
- `DocsDev/releases/release-v0.1.0.md` — Worker Cloudflare = histórico da tag + legado pós-migração
- `INDEX.md` — `DocsDev/codegraph/` pré-VM; leia README SUPERSEDED
- `scripts/docs-production-path.test.js` — 5 testes (AGENTS, INDEX, README, docs/*, codegraph SUPERSEDED)
- `DocsSwarm.md` — 5 rodadas fechadas; Livre residual abaixo

Já shipados (não reabertos): AGENTS, README stack, `docs/arquitetura.md`.

Fora de escopo (não tocado): `src/*`, landing `index.html`, ready-to-ship health, contínuo/bugs UX, visual CSS, `_afk-marketing/*`, push/deploy.

## Validação
```
# execução (worktree)
cd C:/Projetos/LUCA-AI-docs
node --test scripts/docs-production-path.test.js   # 5/5 pass
rg -n "Worker de borda|Cloudflare Workers e Cloudflare Tunnel" AGENTS.md INDEX.md README.md docs
# vazio nos canônicos

# integração (checkout principal)
git checkout swarm/LUCA-AI/docs-integracao
# ff impossível: docs-integracao tinha bc53b63 (só SwarmCollector) fora da linha docs
git merge swarm/LUCA-AI/docs   # ort → 0b643da
node --test scripts/docs-production-path.test.js   # 5/5 pass
```
Conflitos de conteúdo: nenhum. Divergência só no relatório do coletor (`SwarmCollector-docs.md`); merge ort limpo nos 8 paths de produto/docs.

## Residual (não bloqueia integração)
- `DocsDev/codegraph/codegraph-visual.html` ainda desenha “Cloud Worker” — README SUPERSEDED já redireciona; só se agente tratar HTML como canônico
- Outros `DocsDev/*` (design-original / kamui-original) só se reaparecerem como verdade de produção
- `changelog.md` / `patchnotes.md` na raiz: só se contradisserem AGENTS/INDEX/docs
- `package.json` `"test"` só pega `server/**/*.test.js` — locks em `scripts/` não rodam no `npm test` (gap operacional opcional de release)

## Decisão
**aprovar** rodadas 4–5 (operacao/integracoes + DocsDev/codegraph SUPERSEDED) e manter integração local em `swarm/LUCA-AI/docs-integracao` @ `0b643da` (+ commit deste relatório).
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. `DocsDev/codegraph` residual visual HTML só se voltar a ser lido como verdade
2. `changelog.md` / `patchnotes.md` se contradisserem canônico
3. Opcional release: incluir `scripts/docs-production-path.test.js` no `npm test`
4. **Não** reabrir AGENTS/INDEX/README/arquitetura/operacao/integracoes/codegraph SUPERSEDED já shipados

## Anti-padrões evitados
- Sem merge/push/PR/deploy na main
- Sem `git add -A` (só relatório + paths do merge docs; dirty `_afk-marketing/` intocado)
- Sem misturar contínuo/visual/landing/bugs/ready-to-ship
- Sem criar worktree extra; só branch de integração local
- Sem reescrever DocsDev wholesale — só codegraph SUPERSEDED + release note histórico
