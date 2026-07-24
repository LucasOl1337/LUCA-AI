# Arquitetura

Leia SOMENTE ao mudar um fluxo que cruza frontend, Express, contratos compartilhados ou Worker.

| Area | Contrato atual |
| --- | --- |
| `src/` | Interface React, cliente REST/WebSocket e estado de tela. |
| `server/` | Runtime local Express, WebSocket, orquestracao e persistencia em `.luca/`. |
| `shared/` | Contratos de estado publico, catalogos, governanca, modelos e fechamento. |
| `worker/` | Runtime legado preservado para histórico; não participa da produção atual. |

Fluxo local principal:

```text
src -> /api e /ws -> server -> shared -> .luca
```

Fluxo de produção:

```text
navegador -> Cloudflare DNS/Tunnel -> server (VM) -> 9Router/Kamui/Yume
```

O Express é a única superfície ativa da produção. O Worker permanece legado e não deve ser tratado como provider ou origem do frontend publicado.

O servidor serve `dist/` quando o build existe. `site/` possui uma superficie visual separada e nao entra no build do app principal.
