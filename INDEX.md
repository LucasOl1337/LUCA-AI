# Indice

## Codigo

| Onde | Quando abrir |
| --- | --- |
| `src/` | SOMENTE ao alterar a interface React ou o cliente HTTP/WebSocket. |
| `server/` | SOMENTE ao alterar o runtime Express, estado local, agentes ou APIs. |
| `server/deliberations/` | SOMENTE ao alterar a API de deliberacao para harnesses. |
| `shared/` | SOMENTE ao alterar contratos usados por mais de um runtime. |
| `deploy/` | SOMENTE ao alterar publicacao pela VM (service, Tunnel, proxy de borda `luca-ai-vm-proxy.js`) ou scripts de instalacao. |
| `worker/` e `wrangler.jsonc` | SOMENTE ao inspecionar o runtime Cloudflare legado (Durable Object / `app.luca-ai.com.br`); nao e o caminho de producao. |
| `public/` | SOMENTE ao alterar assets estaticos do app principal. |
| `src/sonolencia/` e `public/sonolencia-assets/` | SOMENTE ao alterar webcam, detecção de olhos fechados ou alarme; ver `docs/sonolencia.md`. |
| `site/` | SOMENTE ao trabalhar no site visual separado do app principal. |
| `promo/` | SOMENTE ao trabalhar no comercial Remotion. |
| `praisonai-tests/` e `PraisonAI/` | SOMENTE ao executar os exemplos Python ou inspecionar o submodulo. |
| `grokimaginevideos/` | SOMENTE ao trabalhar nesse checkout co-locado. |

## Documentos

| Documento | Quando ler |
| --- | --- |
| [`README.md`](./README.md) | SOMENTE ao chegar ao projeto sem contexto. |
| [`docs/operacao.md`](./docs/operacao.md) | SOMENTE ao instalar, executar, testar, diagnosticar estado local ou preparar release. |
| [`docs/integracoes.md`](./docs/integracoes.md) | SOMENTE ao mudar roteador LLM, Kamui, personas Yume, anexos ou a publicacao pela VM. |
| [`docs/sompo.md`](./docs/sompo.md) | SOMENTE ao mudar telemetria SOMPO, contrato ESP32/Firebase ou o painel do trator. |
| [`docs/geofencing.md`](./docs/geofencing.md) | SOMENTE ao mexer no módulo isolado de geofencing (`shared/geofencing/`, `server/geofencing/`, `src/geofencing/`): faixas de proximidade, perigos do mapa, radar do simulador agrícola, episódios de faixa do laboratório. Traz o mapa do módulo e a lista dos pontos de contato com o resto. |
| [`docs/yume-personas/`](./docs/yume-personas/) | SOMENTE ao criar no Yume a definicao oficial de uma persona (o LUCA nao escreve no Yume). |
| `server/deliberations/README.md` | SOMENTE ao mudar o contrato de deliberacao para harnesses. |
| `praisonai-tests/README.md` | SOMENTE ao executar os exemplos Python desse diretorio. |
| `promo/README.md` | SOMENTE ao renderizar o comercial Remotion. |
| `grokimaginevideos/README.md` | SOMENTE ao trabalhar nesse checkout co-locado. |
| `DocsDev/` | SOMENTE ao buscar contexto historico que o codigo e os documentos oficiais nao resolvem; nao e fonte de verdade. |
| `DocsDev/arquivados/` | NUNCA leia. |
