# DocsSwarm — LUCA-AI

Ledger de higiene documental (enxame `docs`). Uma melhoria canônica por rodada. Sem push/PR/deploy.

## Em andamento

### 2026-08-02T14:04:37Z — NX-LUCA-AI-docs (Hermes cron)
- Área: DocsDev/codegraph/codegraph-visual.html ainda ensina Cloud Worker como path vivo
- Escopo: `DocsDev/codegraph/codegraph-visual.html`, `scripts/docs-production-path.test.js`, `DocsSwarm.md`
- NÃO tocar: AGENTS/INDEX/README/docs canônicos (já alinhados); inventory/README SUPERSEDED; product code; push/deploy


## Concluído

### 2026-08-02T12:09:44Z — NX-LUCA-AI-docs (Hermes cron)
- Área: DocsDev/codegraph + release-v0.1.0 ensinam Worker DO como path vivo
- Escopo: `DocsDev/codegraph/README.md`, `DocsDev/codegraph/inventory.md`, `DocsDev/releases/release-v0.1.0.md`, `INDEX.md`, `scripts/docs-production-path.test.js`, `DocsSwarm.md`
- Base: `4103c06` → HEAD fix: `886cc9f`
- Evidência: `node --test scripts/docs-production-path.test.js` → 5/5 pass; numstat README 24/0, inventory 6/0, release 1/1, INDEX 1/1, lock 21/0 (sem flip EOL)
- Resultado: codegraph marcado HISTÓRICO/SUPERSEDED com ponteiros canônicos; release-v0.1.0 Worker = histórico da tag; INDEX aponta README SUPERSEDED

### 2026-08-02T11:53:14Z — NX-LUCA-AI-docs (Hermes cron)
- Área: docs/operacao + integracoes ainda nomeavam borda como Worker
- Escopo: `docs/operacao.md`, `docs/integracoes.md`, `scripts/docs-production-path.test.js`, `DocsSwarm.md`
- Base: `c21b74f` → HEAD fix: `f4fc379`
- Evidência: `node --test scripts/docs-production-path.test.js` → 4/4 pass; `git diff --numstat` 1/1 operacao, 1/1 integracoes, 6/0 test (sem flip EOL)
- Resultado: operacao diz "proxy de borda"; integracoes deixa de chamar o proxy de "único Worker ativo"; lock cobre op+integ

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

- `DocsDev/codegraph-visual.html` residual “Cloud Worker” no diagrama (só se agente ainda tratar HTML como canônico; README já SUPERSEDED)
- Outros `DocsDev/*` fora de codegraph (design-original / kamui-original) só se reaparecerem como verdade de produção
- `changelog.md` / `patchnotes.md` na raiz: histórico de produto vs canônico (só se contradisser AGENTS/INDEX/docs)
- `package.json` `"test"` só pega `server/**/*.test.js` — locks em `scripts/` não rodam no `npm test` (só se virar gap operacional de release)
