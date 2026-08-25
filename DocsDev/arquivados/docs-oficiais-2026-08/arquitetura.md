# Arquitetura

Leia SOMENTE ao mudar um fluxo que cruza frontend, Express, contratos compartilhados ou borda Cloudflare (proxy/Tunnel).

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

Fluxo da telemetria SOMPO:

```text
ESP32 -> Mosquitto -> Firebase Realtime Database -- SSE persistente --> Express -- /ws autenticado --> SompoPage
                                                               \-> snapshot fechado sob demanda -> bancada de agentes
```

O navegador nunca consulta o Firebase diretamente. `server/sompo-telemetry-source.js`
mantém uma única assinatura REST Streaming, aplica eventos `put`/`patch`, reconecta com
backoff, preserva o último snapshot e detecta dado parado. O endpoint autenticado
`GET /api/sompo/telemetry` lê essa memória; não abre outro GET no Firebase. O WebSocket
existente distribui `sompo.telemetry` para as sessões autenticadas, e
`shared/sompo-telemetry.js` concentra o contrato e o briefing auditável da bancada.

Esse fluxo é de subida: equipamento para LUCA. Um canal de descida exige contrato no
firmware (comando, correlação e confirmação) e credenciais restritas do broker/Firebase;
o runtime não escreve no equipamento enquanto esse contrato não existir.

Fluxo de produção:

```text
navegador -> cadastro/login LUCA -> cookie HttpOnly -> proxy de borda (deploy/luca-ai-vm-proxy.js) + Workers VPC -> Tunnel luca-ai-production -> Express (VM) -> 9Router/Kamui/Yume
```

Para personas, o seam editorial continua no Yume (`is_official`) e o Kamui oferece o
adapter de leitura. O módulo profundo `server/persona-source.js` concentra precedência,
provenance, modelo efetivo, prompt e cache: Yume é autoritativo quando possui a slug;
builtins LUCA preenchem somente slugs canônicos ausentes; em outage, cache + builtins
mantêm as personas já conhecidas executáveis. O LUCA continua GET-only no Yume.

As regras do fluxo vivem uma vez no módulo in-process
`shared/persona-workflow.js`: identidade e ordem dos papéis, aliases, limites,
optionality, normalização e readiness. React e Express são callers dessa interface;
ícones e renderização permanecem locais ao adapter React.

Cada rodada assíncrona tem um owner em `server/persona-run-lifecycle.js`. Sua interface
é `start/get`; memória de jobs e chat-library durável são adapters internos, e as rotas
Express apenas traduzem HTTP. A persistência da sessão ocorre antes de `complete`, o
`traceId` torna retries de aceite idempotentes e o recibo durável permite recovery após
restart. `shared/persona-run-watch.js` é o observer HTTP usado pelo browser, não outro
owner do estado.

No modo individual, a profundidade 1 é cega+juiz; a 2 acrescenta uma revisão anônima
paralela; a 3 corre consenso round-robin (`server/persona-consensus.js`) com teto de
5 ciclos, pressão a partir do ciclo 3 e veredito do juiz com consenso ou dissenso
registrado. A triagem de domínio vive em `shared/mission-triage.js` (auto + override
manual). O diário da missão (`shared/mission-ledger.js`) persiste na sessão e entra
no briefing das rodadas seguintes no lugar de concatenar o transcript inteiro.

O Express é o único runtime de aplicação ativo da produção. O runtime em `worker/` permanece legado e não deve ser tratado como provider ou origem do frontend publicado. O script pequeno `deploy/luca-ai-vm-proxy.js` atua somente como proxy reverso de borda e não executa modelos, personas ou regras do produto.

Todos os processos de aplicação vivem na VM `sennin-core-01`. O PC Windows é somente ambiente de desenvolvimento e não participa do tráfego de `luca-ai.com.br`. Na VM, `luca-ai.service` serve o Express em loopback e `cloudflared-luca-ai.service` mantém o Tunnel; o domínio público chega pelo proxy de borda (Workers VPC → Tunnel → Express).

## Autenticação

- `server/auth-store.js` mantém usuários e sessões em `.luca/auth.json`; senhas são derivadas com `scrypt` e nunca persistidas em texto puro.
- `server/auth.js` expõe cadastro, login, logout e sessão, protege `/api` e fornece os endpoints administrativos.
- O cadastro cria a sessão imediatamente e não exige confirmação por e-mail.
- E-mails em `LUCA_ADMIN_EMAILS` recebem o papel `admin`. Sem uma allowlist configurada, a primeira conta cadastrada assume esse papel para viabilizar o bootstrap.
- O WebSocket `/ws` aceita somente sessões válidas.

O servidor serve `dist/` quando o build existe. `site/` possui uma superficie visual separada e nao entra no build do app principal.
