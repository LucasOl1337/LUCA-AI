# Integracoes

Leia SOMENTE ao mudar roteador LLM, Kamui, personas Yume, anexos ou a publicacao pela VM.

## 9Router

`server/router-client.js` fala API OpenAI-compatible. Padrao em `server/config.js`: `http://127.0.0.1:20129/v1`. `20128` e nginx e devolve 403 — nao use. Override: `ROUTER_BASE_URL`. Credencial: `ROUTER_API_KEY` ou `NINE_ROUTER_API_KEY`.

O catalogo fechado vive em `server/config.js`. Rota fora da lista nunca vai ao provider. Ultra e alias da rota `-xhigh`; o cliente nao envia campos de esforco.

Imagem: `POST {ROUTER_BASE_URL}/images/generations` (`size` + `b64_json`). Default `IMAGE_GENERATION_MODEL=cx/gpt-5.5-image`. Catalogo de imagem e separado do de chat.

## Yume e Kamui

`server/kamui-client.js` so faz GET em `{KAMUI_BASE}/kamui/yume/...`. Padrao de `KAMUI_BASE`: `http://127.0.0.1:1338`. Nao adicione escrita.

`server/persona-source.js` e o unico merge: Yume por slug vence; builtin LUCA cobre slug canonica ausente; em outage, cache + builtin. `is_official` invalido falha alto. Roster sincroniza na subida e no intervalo `LUCA_PERSONA_ROSTER_SYNC_MS` (minimo 15s).

## Anexos e deliberacao

Texto de anexo entra no prompt (`server/agent-loop.js`); Claude no 9Router ignora `input_file` em silencio. PDF e recusado (`attachment_pdf_not_supported`). Corte em 120000 caracteres com aviso no prompt. Anexos nao entram no snapshot publico `/s/:token`.

Deliberacoes para harnesses: `POST /api/deliberations`. Bearer so com `LUCA_MACHINE_TOKEN` de pelo menos 32 caracteres. Contrato em `server/deliberations/README.md`.

## Publicacao

Visitante -> `luca-ai-vm-proxy` -> Workers VPC -> Tunnel `luca-ai-production` -> Express na VM. O proxy em `deploy/luca-ai-vm-proxy.js` so encaminha; nao executa modelo. `worker/` e legado e nao participa de `luca-ai.com.br`.
