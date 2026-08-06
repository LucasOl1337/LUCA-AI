# Integracoes

Leia SOMENTE ao mudar roteador LLM, Kamui, personas Yume ou a publicação pela VM.

## Roteador local

`server/router-client.js` usa uma API compativel com OpenAI. O padrao e `http://127.0.0.1:20128/v1`.

`server/config.js` mantem o catalogo fechado do 9Router: 18 perfis visuais resolvem para 16 IDs de rota (inclui Grok 4.5 High/Medium/Low e GPT 5.5 base). Perfis Ultra sao aliases das respectivas rotas `-xhigh`; o cliente nao envia campos de esforco ou raciocinio. `GET /api/router/models` expoe esse catalogo e as capacidades declaradas pelo runtime local, sem credenciais.

| Variavel | Uso |
| --- | --- |
| `ROUTER_BASE_URL` | Base do roteador local. |
| `ROUTER_API_KEY` ou `NINE_ROUTER_API_KEY` | Credencial enviada como Bearer quando definida. |
| `ROUTER_MODEL` | Modelo dos agentes comuns. |
| `MISSION_TRANSFORMER_MODEL`, `DESIGNER_MODEL`, `MAESTRO_MODEL` | Modelos dos papeis especializados. |
| `ROUTER_TIMEOUT_MS` | Timeout das chamadas. |

Valores de modelo vindos do ambiente, do estado local ou de personas Yume sao aceitos somente quando correspondem a um dos 16 IDs do catalogo 9Router. Uma rota externa nunca e encaminhada ao provider.

Ao importar uma persona, o LUCA preserva nome, prompt e versao lidos do Yume. O estado local `personaAgents.model` guarda somente override explicito (vazio = seguir Yume). O motor efetivo no 9Router e resolvido assim: override local do LUCA > model do Yume se estiver no catalogo fechado > `ROUTER_MODEL`. O prompt de execucao declara explicitamente o motor 9Router da rodada para a persona nao inventar IDs legados (ex. GLM). `POST /api/agent/config` com `agentId: "yume:<slug>"` grava override; `POST /api/luca-ai/persona-team/run` aceita `modelOverrides` por slug so para aquela missao.

`POST /api/luca-ai/persona-team/run` oferece dois modos visiveis. `workflow` encadeia os papeis da equipe; `individual` executa de uma a cinco personas em contextos isolados e chama depois uma persona juiza com todas as respostas. O juiz pode repetir uma persona participante, mas sempre usa uma chamada separada. O POST devolve `202` com `runId`, `traceId` e status `running`; a execucao segue no processo Express e a UI consulta `GET /api/luca-ai/persona-team/runs/:runId` ate `complete` ou `failed`. Assim, nenhuma conexao com a borda precisa permanecer aberta durante as chamadas LLM.

## Kamui e Yume

`server/kamui-client.js` acessa Yume somente por GET via `{KAMUI_BASE}/kamui/yume/...`. O padrao de `KAMUI_BASE` e `http://127.0.0.1:1338`; `KAMUI_TIMEOUT_MS` controla o timeout.

O LUCA lista personas, le prompt e versao e guarda o cache no estado local. Nao adicione escrita no Yume a esse cliente.

O roster principal tem uma única fonte editorial: `is_official === true` no Yume.
`GET /api/personas/available` consulta esse catálogo via Kamui, reconcilia o cache
operacional `personaAgents` e devolve `imported: true` somente para personas oficiais.
Nome, modelo Yume e composição do roster vêm do Yume; o estado local preserva apenas
override de modelo, habilitação e cache de prompt das oficiais. Personas secundárias
continuam visíveis em uma seção recolhida, mas não podem ser atribuídas nem executadas.

O Express sincroniza os workspaces na inicialização, a cada 60 segundos por padrão e
antes de listar ou executar equipes. `LUCA_PERSONA_ROSTER_SYNC_MS` ajusta o intervalo
(mínimo de 15 segundos). Os endpoints legados de adicionar/remover agora apenas
reconciliam com o Yume: não criam uma decisão editorial local. A promoção ou remoção do
roster é feita no editor do Yume e se propaga pelo Kamui para todos os consumidores.

No domínio público, as telas de Personas e LUCA-AI usam `/api` na mesma origem. O proxy de borda encaminha o tráfego para `luca-origin.bombapvp.com`; o Cloudflare Tunnel executado na VM entrega as chamadas ao Express em `127.0.0.1:4242`. O navegador do visitante e o PC de desenvolvimento nunca participam do caminho interno.

## Publicação atual

O ambiente de produção usa somente o 9Router da VM. A Cloudflare fornece DNS, um proxy reverso de borda e Tunnel, sem executar modelos e sem exigir conta Cloudflare do visitante. O runtime legado em `worker/` não participa da publicação de `luca-ai.com.br`. O proxy mínimo de borda versionado em `deploy/luca-ai-vm-proxy.js` só encaminha o domínio público; não é o runtime de aplicação. Na VM, as units atuais são `luca-ai.service`, `kamui-backend.service`, `yume-backend.service` e `cloudflared-luca-ai.service`.
