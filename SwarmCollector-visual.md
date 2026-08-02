# SwarmCollector-visual — LUCA-AI

Coletor do enxame `visual`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/visual` @ `f37c2e0` (worktree `C:/Projetos/LUCA-AI-enxame-visual`)
- Branch integração: `swarm/LUCA-AI/visual-integracao` @ `f37c2e0` (criada localmente neste coletor)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor visual)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `d9c8773` | `fix(visual): auth shell usa tokens --l-* do produto` | **aprovar** | Integrado em `visual-integracao` |
| `b1c5a0f` | `chore(enxame): fecha rodada visual no SwarmLedger` | **aprovar** | Ledger da rodada 1; sem código de produto extra |
| `3d6ac28` | `fix(visual): StatePill on-state usa theme.goldHaze` | **aprovar** | Integrado em `visual-integracao` |
| `f37c2e0` | `chore(enxame): fecha rodada visual no SwarmLedger` | **aprovar** | Ledger da rodada 2; sem código de produto extra |

## Diff em escopo
- `src/index.css` — bloco autenticação/admin: hex soltos (`#050a10`, `#167fd9`, …) → `--l-void` / `--l-navy-*` / `--l-focus` / `--l-error-bg`; CTA alinhado a `.btn-primary` (`rgba(10, 132, 255, 0.72)`)
- `server/auth-visual-tokens.test.js` — source-lock bane hex legados e exige tokens `--l-*` no bloco auth
- `src/components/StatePill.tsx` — fundo `on` deixa brass `rgba(201,162,39,0.04)` e usa `theme.goldHaze` (`rgba(10, 132, 255, 0.10)`)
- `server/state-pill-visual-tokens.test.js` — source-lock bane brass residual e exige `theme.goldHaze`
- `SwarmLedger-visual.md` — claims fechados; Livre: accents de agentes em `src/lib/agents.ts`, páginas secundárias com hex residual

Fora de escopo (não tocado): `ToolsPage`/`EndpointsPage` (bugs/contínuo), `index.html` (landing), release health (ready-to-ship), docs, `_afk-marketing/*`, push/deploy.

## Validação
```
# execução (worktree)
cd C:/Projetos/LUCA-AI-enxame-visual
node --test server/auth-visual-tokens.test.js server/state-pill-visual-tokens.test.js   # 2/2 pass

# integração (checkout principal)
git branch swarm/LUCA-AI/visual-integracao swarm/LUCA-AI/visual
git checkout swarm/LUCA-AI/visual-integracao
node --test server/auth-visual-tokens.test.js server/state-pill-visual-tokens.test.js   # 2/2 pass
node --check server/auth-visual-tokens.test.js server/state-pill-visual-tokens.test.js
git diff --numstat b14f395..HEAD -- src/index.css src/components/StatePill.tsx \
  server/auth-visual-tokens.test.js server/state-pill-visual-tokens.test.js
# index.css 31/31 · StatePill 1/1 · auth-test 45/0 · state-pill-test 16/0 (sem flip EOL)
```
Conflitos: nenhum (branch linear sobre `b14f395`; duas entregas disjuntas CSS/auth vs StatePill; nenhuma outra branch swarm toca estes paths). Nome `goldHaze` é névoa azul de ação do produto, não brass legado.

## Decisão
**aprovar** e manter integração local em `swarm/LUCA-AI/visual-integracao`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Accents de agentes (`#C9A227` brass) em `src/lib/agents.ts` vs ação azul do tema operacional
2. Páginas secundárias / shell residual com hex solto fora de auth
3. **Não** reabrir auth shell tokens nem StatePill on-state

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só este relatório; dirty `_afk-marketing/` intocado)
- Sem reabrir auth/StatePill já shipados
- Sem misturar bugs/contínuo/landing/docs/ready-to-ship
- Sem redesign soft-SaaS; só migração de token
