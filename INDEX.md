# Índice

## Código

| Onde | Quando abrir |
| --- | --- |
| `src/pages/LucaAiPage.tsx` | Ao alterar a bancada, seus cinco papéis, canvas, comunicação ou execução de missão. |
| `src/pages/PersonasPage.tsx` | Ao alterar o catálogo e a importação de personas do Yume. |
| `src/components/Layout.tsx` | Ao alterar o shell, a navegação de duas telas ou o estado de saúde. |
| `src/lib/` | Ao alterar o cliente HTTP ou os contratos usados pela interface. |
| `server/persona-workbench.js` | Ao alterar o caso de uso principal; esta é a interface profunda do backend. |
| `server/persona-store.js` | Ao alterar a persistência mínima das personas importadas. |
| `server/kamui-client.js` | Ao alterar leituras do Yume; este adaptador nunca escreve. |
| `server/router-client.js` | Ao alterar chamadas ao 9Router. |
| `server/index.js` | Ao alterar a superfície HTTP ou a entrega do build. |
| CodeGraph CLI | Ao mapear estrutura, chamadas ou impacto antes de abrir muitos arquivos. |

## Documentos

| Documento | Quando ler |
| --- | --- |
| [`README.md`](./README.md) | Ao chegar ao projeto sem contexto. |
| [`docs/operacao.md`](./docs/operacao.md) | Ao instalar, executar, testar ou diagnosticar o runtime local. |
| [`docs/arquitetura.md`](./docs/arquitetura.md) | Ao mudar um fluxo que cruza frontend, Express ou integrações. |
| [`docs/integracoes.md`](./docs/integracoes.md) | Ao mudar 9Router, Kamui ou personas Yume. |
| `DocsDev/` | Apenas para contexto histórico que o código e os documentos oficiais não resolvem; não é fonte de verdade. |
| `DocsDev/arquivados/` | Nunca durante o trabalho normal; use somente por ordem explícita do dono. |
