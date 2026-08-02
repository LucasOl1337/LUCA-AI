# SwarmLedger — visual (LUCA-AI)

## Livre
- StatePill com tint brass legado `rgba(201,162,39,0.04)` em `src/components/StatePill.tsx`
- Accents de agentes (`#C9A227` brass) em `src/lib/agents.ts` vs ação azul do tema operacional
- Páginas secundárias / shell residual se aparecer hex solto fora de auth

## Em andamento
_(nenhum — sessão fechou)_

## Concluído
### 2026-08-02 — NX-LUCA-AI-visual
- Área: Auth shell → tokens do produto (liquid glass / `--l-*`)
- Escopo: `src/index.css` (bloco autenticação + admin residual no mesmo bloco), `server/auth-visual-tokens.test.js`, `SwarmLedger-visual.md`
- Base: `b14f395` → HEAD: (fix commit abaixo)
- Evidência: `node --test server/auth-visual-tokens.test.js` PASS; `git diff --numstat src/index.css` = 31/31 (sem flip EOL)
- Resultado: tela de login/cadastro e estilos admin adjacentes usam `--l-void`, `--l-navy-*`, `--l-focus`, `--l-error-bg` e botão alinhado a `.btn-primary` (`rgba(10,132,255,.72)`); hex soltos da paleta auth removidos
- NÃO push / deploy / PR
