# Integrações

Leia ao mudar 9Router, Kamui ou personas Yume.

## 9Router

`server/router-client.js` usa uma API compatível com OpenAI. O padrão é `http://127.0.0.1:20128/v1`.

| Variável | Uso |
| --- | --- |
| `ROUTER_BASE_URL` | Base do roteador local. |
| `ROUTER_API_KEY` ou `NINE_ROUTER_API_KEY` | Credencial Bearer opcional. |
| `ROUTER_MODEL` | Modelo usado pelos cinco papéis. |
| `ROUTER_TIMEOUT_MS` | Timeout das chamadas. |

Quando o modelo preferido de uma persona retorna `model_not_found` ou informa ausência de credencial ativa, a bancada repete a chamada com `ROUTER_MODEL`. Falhas de rede e timeouts continuam visíveis e não disparam repetição automática.

## Kamui e Yume

`server/kamui-client.js` acessa o Yume somente por GET em `{KAMUI_BASE}/kamui/yume/...`. `KAMUI_BASE` usa `http://127.0.0.1:1338` por padrão e `KAMUI_TIMEOUT_MS` controla o timeout.

A bancada consulta catálogo, prompt de sistema e versão das personas. Os prompts podem ser mantidos em cache local para tolerar uma indisponibilidade temporária, mas nenhuma rota escreve no Yume.
