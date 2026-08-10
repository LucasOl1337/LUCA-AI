# Indice

## Codigo

| Onde | Quando abrir |
| --- | --- |
| `src/` | SOMENTE ao alterar a interface React ou o cliente HTTP/WebSocket. |
| `server/` | SOMENTE ao alterar o runtime Express, estado local, agentes ou APIs. |
| `server/deliberations/` | SOMENTE ao alterar a API de deliberação para harnesses, ContextBundle, DecisionPackage ou o futuro adapter MCP. |
| `shared/` | SOMENTE ao alterar contratos usados por mais de um runtime. |
| `deploy/` | SOMENTE ao alterar publicacao na VM (service, Tunnel, proxy de borda `luca-ai-vm-proxy.js`) ou scripts de instalacao. |
| `worker/` e `wrangler.jsonc` | SOMENTE ao inspecionar ou manter o runtime Cloudflare legado (Durable Object / `app.luca-ai.com.br`); nao e o caminho de producao atual. |
| `public/` | SOMENTE ao alterar assets estaticos servidos pelo app principal (icones, imagens). |
| `site/` | SOMENTE ao trabalhar no site visual separado do app principal. |
| `praisonai-tests/` e `PraisonAI/` | SOMENTE ao executar os exemplos Python ou inspecionar o submodulo. |
| CodeGraph CLI | SOMENTE ao mapear estrutura, chamadas ou impacto antes de abrir muitos arquivos. |

## Documentos

| Documento | Quando ler |
| --- | --- |
| [`README.md`](./README.md) | SOMENTE ao chegar ao projeto sem contexto. |
| [`docs/operacao.md`](./docs/operacao.md) | SOMENTE ao instalar, executar, testar, diagnosticar estado local ou preparar release. |
| [`docs/arquitetura.md`](./docs/arquitetura.md) | SOMENTE ao mudar um fluxo que cruza frontend, Express, contratos compartilhados ou borda Cloudflare. |
| [`docs/integracoes.md`](./docs/integracoes.md) | SOMENTE ao mudar roteador LLM, Kamui, personas Yume ou a publicacao pela VM. |
| [`docs/yume-personas/`](./docs/yume-personas/) | SOMENTE ao criar/atualizar definicoes de personas oficiais para o Yume (o LUCA nao escreve no Yume). |
| `praisonai-tests/README.md` | SOMENTE ao executar os exemplos Python desse diretorio. |
| `grokimaginevideos/README.md` | SOMENTE ao trabalhar nesse checkout co-locado. |
| `DocsDev/` | SOMENTE ao buscar contexto historico que o codigo e os documentos oficiais nao resolvem; nao trate como fonte de verdade. `DocsDev/codegraph/` e snapshot pre-VM (Worker DO) — leia o README SUPERSEDED antes. |
| `DocsDev/arquivados/` | NUNCA leia durante trabalho normal; use apenas por ordem explicita do dono. |
