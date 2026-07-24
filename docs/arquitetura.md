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
navegador -> cadastro/login LUCA -> cookie HttpOnly -> Cloudflare DNS/Tunnel -> server (VM) -> 9Router/Kamui/Yume
```

O Express é a única superfície ativa da produção. O Worker permanece legado e não deve ser tratado como provider ou origem do frontend publicado.

Todos os processos de produção vivem na VM `sennin-core-01`. O PC Windows é somente ambiente de desenvolvimento e não participa do tráfego de `luca-ai.com.br`. Na VM, `luca-ai.service` serve o Express em loopback e `cloudflared-bombapvp-lab.service` publica o hostname.

## Autenticação

- `server/auth-store.js` mantém usuários e sessões em `.luca/auth.json`; senhas são derivadas com `scrypt` e nunca persistidas em texto puro.
- `server/auth.js` expõe cadastro, login, logout e sessão, protege `/api` e fornece os endpoints administrativos.
- O cadastro cria a sessão imediatamente e não exige confirmação por e-mail.
- E-mails em `LUCA_ADMIN_EMAILS` recebem o papel `admin`. Sem uma allowlist configurada, a primeira conta cadastrada assume esse papel para viabilizar o bootstrap.
- O WebSocket `/ws` aceita somente sessões válidas.

O servidor serve `dist/` quando o build existe. `site/` possui uma superficie visual separada e nao entra no build do app principal.
