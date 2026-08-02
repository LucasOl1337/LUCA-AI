# DocsSwarm — LUCA-AI

Ledger de higiene documental (enxame `docs`). Uma melhoria canônica por rodada. Sem push/PR/deploy.

## Em andamento

### 2026-08-02T11:52:19Z — NX-LUCA-AI-docs (Hermes cron)
- Área: docs/operacao + integracoes ainda nomeiam borda como Worker
- Escopo: `docs/operacao.md`, `docs/integracoes.md`, `scripts/docs-production-path.test.js`, `DocsSwarm.md`
- NÃO tocar: AGENTS.md, INDEX.md, README.md, docs/arquitetura.md (já fechados), DocsDev/, push/deploy


## Concluído

### 2026-08-02T09:19:36Z — NX-LUCA-AI-docs (Hermes cron)
- Área: docs/arquitetura intro + fluxo produção ainda diziam Worker
- Escopo: `docs/arquitetura.md`, `scripts/docs-production-path.test.js`, `DocsSwarm.md`
- Base: `64960c1` → HEAD fix: `cecc361`
- Evidência: `node --test scripts/docs-production-path.test.js` → 4/4 pass; `git diff --numstat` 2/2 arquitetura, 4/0 test (sem flip EOL)
- Resultado: intro aponta borda Cloudflare (proxy/Tunnel); fluxo de produção nomeia `deploy/luca-ai-vm-proxy.js` em vez de "Worker de borda"; `worker/` permanece só na tabela legado

### 2026-08-02T06:49:07Z — NX-LUCA-AI-docs (Hermes cron)
- Área: README stack genérico vs produção Express/VM
- Escopo: `README.md`, `scripts/docs-production-path.test.js`, `DocsSwarm.md`
- Base: `88d8377` → HEAD fix: `9c195e8`
- Evidência: `node --test scripts/docs-production-path.test.js` → 4/4 pass; `git diff --numstat` 1/1 README, 11/0 test (sem flip EOL)
- Resultado: stack do README deixa de listar bare "Cloudflare Workers"; aponta Tunnel + `deploy/luca-ai-vm-proxy.js` e marca `worker/` legado

### 2026-08-02T04:57:35Z — NX-LUCA-AI-docs (Hermes cron)
- Área: contradição canônica produção (Worker DO vs Express VM)
- Escopo: `AGENTS.md`, `INDEX.md`, `DocsSwarm.md`, `scripts/docs-production-path.test.js`
- Base: `b14f395` → HEAD fix: `2078b13`
- Evidência: `node --test scripts/docs-production-path.test.js` → 3/3 pass; `git diff --numstat` 3/3 AGENTS, 5/4 INDEX (sem flip EOL)
- Resultado: AGENTS/INDEX deixam de tratar Worker+DO em `app.luca-ai.com.br` como publicação atual; `deploy/` vira rota canônica de publicação; `worker/` marcado legado (alinhado a `docs/*`)

## Livre

- Paths em `DocsDev/` históricos que citam worker como produção (não reescrever DocsDev sem ordem; arquivar ponta se reaparecer no canônico)
- `changelog.md` / `patchnotes.md` na raiz: histórico de produto vs canônico (só se contradisser AGENTS/INDEX/docs)
- `package.json` `"test"` só pega `server/**/*.test.js` — locks em `scripts/` não rodam no `npm test` (só se virar gap operacional de release)
