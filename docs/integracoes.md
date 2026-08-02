# Integracoes

Leia SOMENTE ao mudar roteador LLM, Kamui, personas Yume ou a publicação pela VM.

## Roteador local

`server/router-client.js` usa uma API compativel com OpenAI. O padrao e `http://127.0.0.1:20128/v1`.

`server/config.js` mantem o catalogo fechado do 9Router: 14 perfis visuais resolvem para 12 IDs de rota. Perfis Ultra sao aliases das respectivas rotas `-xhigh`; o cliente nao envia campos de esforco ou raciocinio. `GET /api/router/models` expoe esse catalogo e as capacidades declaradas pelo runtime local, sem credenciais.

| Variavel | Uso |
| --- | --- |
| `ROUTER_BASE_URL` | Base do roteador local. |
| `ROUTER_API_KEY` ou `NINE_ROUTER_API_KEY` | Credencial enviada como Bearer quando definida. |
| `ROUTER_MODEL` | Modelo dos agentes comuns. |
| `MISSION_TRANSFORMER_MODEL`, `DESIGNER_MODEL`, `MAESTRO_MODEL` | Modelos dos papeis especializados. |
| `ROUTER_TIMEOUT_MS` | Timeout das chamadas. |

Valores de modelo vindos do ambiente, do estado local ou de personas Yume sao aceitos somente quando correspondem a um dos 12 IDs do catalogo 9Router. Uma rota externa nunca e encaminhada ao provider.

Ao importar uma persona, o LUCA preserva nome, prompt e versao lidos do Yume, mas normaliza a rota somente no estado local. O modelo remoto do Yume nao substitui nem aparece como configuracao do provider 9Router.

`POST /api/luca-ai/persona-team/run` oferece dois modos visiveis. `workflow` encadeia os papeis da equipe; `individual` executa de uma a cinco personas em contextos isolados e chama depois uma persona juiza com todas as respostas. O juiz pode repetir uma persona participante, mas sempre usa uma chamada separada.

## Kamui e Yume

`server/kamui-client.js` acessa Yume somente por GET via `{KAMUI_BASE}/kamui/yume/...`. O padrao de `KAMUI_BASE` e `http://127.0.0.1:1338`; `KAMUI_TIMEOUT_MS` controla o timeout.

O LUCA lista personas, le prompt e versao e guarda o cache no estado local. Nao adicione escrita no Yume a esse cliente.

No domínio público, as telas de Personas e LUCA-AI usam `/api` na mesma origem. O proxy de borda encaminha o tráfego para `luca-origin.bombapvp.com`; o Cloudflare Tunnel executado na VM entrega as chamadas ao Express em `127.0.0.1:4242`. O navegador do visitante e o PC de desenvolvimento nunca participam do caminho interno.

## Publicação atual

O ambiente de produção usa somente o 9Router da VM. A Cloudflare fornece DNS, um proxy reverso de borda e Tunnel, sem executar modelos e sem exigir conta Cloudflare do visitante. O runtime legado em `worker/` não participa da publicação de `luca-ai.com.br`. O proxy mínimo de borda versionado em `deploy/luca-ai-vm-proxy.js` só encaminha o domínio público; não é o runtime de aplicação.
