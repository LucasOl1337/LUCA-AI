# SwarmCollector-docs — LUCA-AI

Coletor do enxame `docs` (higiene documental). Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/docs` @ `b3adc7f` (worktree `C:/Projetos/LUCA-AI-docs`)
- Branch integração: `swarm/LUCA-AI/docs-integracao` @ `62b0296` (merge ort `docs` → integração) + este relatório
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02T15:08:17Z (AFK cron NX coletor docs)
- Em andamento no ledger: nenhum

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `2078b13` | `docs(canonical): alinha AGENTS/INDEX com producao Express na VM` | **aprovar** | Já em `docs-integracao` |
| `88d8377` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 1 |
| `9c195e8` | `docs(canonical): README stack deixa de listar Cloudflare Workers como runtime` | **aprovar** | Já em `docs-integracao` |
| `64960c1` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 2 |
| `cecc361` | `docs(canonical): arquitetura deixa de chamar borda de Worker` | **aprovar** | Já em `docs-integracao` |
| `5a3c84f` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 3 |
| `c21b74f` | `chore(enxame): claim docs operacao/integracoes borda no DocsSwarm` | **aprovar** | Claim transitório |
| `f4fc379` | `docs(canonical): operacao/integracoes deixam de chamar borda de Worker` | **aprovar** | Já em `docs-integracao` |
| `80743f7` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 4 |
| `4103c06` | `chore(enxame): claim docs DocsDev/codegraph SUPERSEDED no DocsSwarm` | **aprovar** | Claim transitório |
| `886cc9f` | `docs(historical): DocsDev/codegraph SUPERSEDED pre-VM Worker path` | **aprovar** | Já em `docs-integracao` |
| `9ab8b3d` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 5 |
| `bc53b63` | `chore(enxame): coletor docs aprova path Express/VM canônico` | **aprovar** | Relatório coletor |
| `0b643da` | `chore(enxame): coletor docs integra operacao/integracoes + DocsDev/codegraph SUPERSEDED` | **aprovar** | Merge anterior |
| `1726ce7` | `chore(enxame): coletor docs atualiza SwarmCollector (operacao + codegraph)` | **aprovar** | Relatório coleta anterior |
| `1d4f0bb` | `chore(enxame): claim docs codegraph-visual SUPERSEDED banner no DocsSwarm` | **aprovar** | Claim transitório rodada 6 |
| `31a1ea8` | `docs(historical): codegraph-visual SUPERSEDED banner + legado Cloud Worker` | **aprovar** | Integrado nesta coleta |
| `b3adc7f` | `chore(enxame): fecha rodada docs no DocsSwarm` | **aprovar** | Ledger rodada 6; tip execução |
| `62b0296` | `chore(enxame): coletor docs integra codegraph-visual SUPERSEDED` | **aprovar** | Merge `docs` → `docs-integracao` |

## Diff em escopo (rodada 6)
- `DocsDev/codegraph/codegraph-visual.html` — banner **HISTÓRICO / SUPERSEDED** no header; nó `Cloud Worker (legado)`; list item worker = legado pré-VM; fluxo `Cloud (histórico pré-VM / legado)` deixa de parecer path comercial
- `scripts/docs-production-path.test.js` — 6º teste: visual SUPERSEDED + ban `<text>Cloud Worker</text>` bare + exige `Cloud Worker (legado)`
- `DocsSwarm.md` — rodada 6 fechada; Livre residual sem reabrir codegraph visual

Já shipados (não reabertos): AGENTS, INDEX, README stack, `docs/arquitetura.md`, `docs/operacao.md`, `docs/integracoes.md`, codegraph README/inventory + release-v0.1.0 SUPERSEDED.

Fora de escopo (não tocado): `src/*`, landing `index.html`, ready-to-ship health, contínuo/bugs UX, visual CSS, `_afk-marketing/*`, push/deploy.

## Validação
```
# execução (worktree)
cd C:/Projetos/LUCA-AI-docs
node --test scripts/docs-production-path.test.js   # 6/6 pass
rg -n "Worker de borda|Cloud Worker</text>" AGENTS.md INDEX.md README.md docs DocsDev/codegraph
# vazio nos canônicos / label bare banida no visual

# integração (checkout principal)
git checkout swarm/LUCA-AI/docs-integracao
git merge swarm/LUCA-AI/docs   # ort → 62b0296
node --test scripts/docs-production-path.test.js   # 6/6 pass
rg -n "^## " DocsSwarm.md   # Em andamento / Concluído / Livre (únicos)
```
Conflitos de conteúdo: nenhum. Merge ort limpo nos 3 paths de produto/docs.

## Residual (não bloqueia integração)
- Outros `DocsDev/*` fora de codegraph (design-original / kamui-original) só se reaparecerem como verdade de produção
- `changelog.md` / `patchnotes.md` na raiz: histórico de produto vs canônico (só se contradisser AGENTS/INDEX/docs)
- `package.json` `"test"` só pega `server/**/*.test.js` — locks em `scripts/` não rodam no `npm test` (só se virar gap operacional de release)

## Decisão
**aprovar** rodada 6 (codegraph-visual SUPERSEDED + Cloud Worker legado) e manter integração local em `swarm/LUCA-AI/docs-integracao` @ `62b0296` (+ commit deste relatório).
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. `changelog.md` / `patchnotes.md` se contradisserem canônico
2. Opcional release: incluir `scripts/docs-production-path.test.js` no `npm test`
3. Outros `DocsDev/*` (design-original / kamui-original) só se voltarem a ser lidos como verdade de produção
4. **Não** reabrir AGENTS/INDEX/README/arquitetura/operacao/integracoes/codegraph SUPERSEDED (README/inventory/visual) já shipados

## Anti-padrões evitados
- Sem merge/push/PR/deploy na main
- Sem `git add -A` (só relatório + paths do merge docs; dirty `_afk-marketing/` intocado)
- Sem misturar contínuo/visual/landing/bugs/ready-to-ship
- Sem criar worktree extra; só branch de integração local
- Sem reescrever DocsDev wholesale — só residual visual HTML SUPERSEDED
