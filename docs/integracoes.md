# Integracoes

Leia SOMENTE ao mudar roteador LLM, Kamui, personas Yume ou a ponte local do modo cloud.

## Roteador local

`server/router-client.js` usa uma API compativel com OpenAI. O padrao e `http://127.0.0.1:20128/v1`.

| Variavel | Uso |
| --- | --- |
| `ROUTER_BASE_URL` | Base do roteador local. |
| `ROUTER_API_KEY` ou `NINE_ROUTER_API_KEY` | Credencial enviada como Bearer quando definida. |
| `ROUTER_MODEL` | Modelo dos agentes comuns. |
| `MISSION_TRANSFORMER_MODEL`, `DESIGNER_MODEL`, `MAESTRO_MODEL` | Modelos dos papeis especializados. |
| `ROUTER_TIMEOUT_MS` | Timeout das chamadas. |

## Kamui e Yume

`server/kamui-client.js` acessa Yume somente por GET via `{KAMUI_BASE}/kamui/yume/...`. O padrao de `KAMUI_BASE` e `http://127.0.0.1:1338`; `KAMUI_TIMEOUT_MS` controla o timeout.

O LUCA lista personas, le prompt e versao e guarda o cache no estado local. Nao adicione escrita no Yume a esse cliente.

No modo cloud, as telas de personas e LUCA-AI tentam acessar `http://127.0.0.1:4242` como ponte local. Mantenha o runtime Express ativo para importar ou executar recursos Yume pela interface cloud.

## Worker Cloudflare

O Worker usa `GLM_API_KEY` como secret e le `GLM_BASE`, `GLM_MODEL`, `GLM_MODEL_OPTIONS` e `MODEL_SELECTOR_KEY` da configuracao. Valide `GET /api/health` e `GET /api/preflight` depois de mudar provider ou bindings.
