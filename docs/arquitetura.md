# Arquitetura

Leia SOMENTE ao mudar um fluxo que cruza frontend, Express, contratos compartilhados ou Worker.

| Area | Contrato atual |
| --- | --- |
| `src/` | Interface React, cliente REST/WebSocket e estado de tela. |
| `server/` | Runtime local Express, WebSocket, orquestracao e persistencia em `.luca/`. |
| `shared/` | Contratos de estado publico, catalogos, governanca, modelos e fechamento. |
| `worker/` | Runtime Cloudflare, Durable Object, SQL interno, jobs e assets de `dist/`. |

Fluxo local principal:

```text
src -> /api e /ws -> server -> shared -> .luca
```

Fluxo cloud principal:

```text
src -> /api -> worker -> LucaRuntime Durable Object -> SQL
```

O Express e o Worker implementam superficies parecidas sem uma camada unica de rotas. Ao mudar payload publico, endpoint, evento, fechamento ou governanca, localize as duas implementacoes e os testes relacionados antes de editar.

O servidor serve `dist/` quando o build existe. `site/` possui uma superficie visual separada e nao entra no build do app principal.
