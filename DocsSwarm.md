# DocsSwarm — LUCA-AI

Ledger de higiene documental (enxame `docs`). Uma melhoria canônica por rodada. Sem push/PR/deploy.

## Em andamento

### 2026-08-02T06:49:07Z — NX-LUCA-AI-docs (Hermes cron)
- Área: README stack genérico vs produção Express/VM
- Escopo: `README.md`, `scripts/docs-production-path.test.js`, `DocsSwarm.md`
- NÃO tocar: `AGENTS.md`/`INDEX.md` (docs-1), `DocsDev/` rewrite, push/deploy

## Concluído

### 2026-08-02T04:57:35Z — NX-LUCA-AI-docs (Hermes cron)
- Área: contradição canônica produção (Worker DO vs Express VM)
- Escopo: `AGENTS.md`, `INDEX.md`, `DocsSwarm.md`, `scripts/docs-production-path.test.js`
- Base: `b14f395` → HEAD fix: `2078b13`
- Evidência: `node --test scripts/docs-production-path.test.js` → 3/3 pass; `git diff --numstat` 3/3 AGENTS, 5/4 INDEX (sem flip EOL)
- Resultado: AGENTS/INDEX deixam de tratar Worker+DO em `app.luca-ai.com.br` como publicação atual; `deploy/` vira rota canônica de publicação; `worker/` marcado legado (alinhado a `docs/*`)

## Livre

- README stack ainda lista "Cloudflare Workers" genérico (baixo risco; corpo já descreve proxy+Tunnel)
- Paths em `DocsDev/` históricos que citam worker como produção
