# LUCA-AI Dev Docs

## Estado atual

- Frontend minimalista preservado e rodando em `http://localhost:4141`.
- Backend novo recriado do zero e rodando em `http://127.0.0.1:4242`.
- Heartbeat em Python funcional, com atualizacao real a cada 5 segundos.
- Integracao com 9router local funcional via `http://127.0.0.1:20128/v1`.
- Modelo ativo configurado: `cx/gpt-5.4-mini-xhigh`.

## O que esta funcionando

- Card `heartbeat` abre um terminal embutido.
- Heartbeat mostra status dos agentes a cada 5 segundos.
- Heartbeat Python grava `heartbeat-report.json` continuamente.
- Backend captura o heartbeat e expoe estado ao frontend.
- Clique nos agentes dispara execucao real no 9router.
- `supervisor` ja foi testado com resposta real do modelo.
- Status dos agentes atualiza no estado do sistema.

## Arquitetura atual

### Frontend

- `src/main.jsx`
  - UI dos cards e terminais
  - heartbeat simplificado com lista de estados

### Backend

- `server/index.js`
  - API REST
  - WebSocket
  - spawn do heartbeat Python
  - execucao dos agentes no 9router
- `server/router-client.js`
  - cliente OpenAI-compatible para o 9router local
- `server/state.js`
  - estado em memoria dos agentes, heartbeat e database
- `server/config.js`
  - portas e configuracao do modelo/router

### Heartbeat

- `heartbeat_monitor.py`
  - loop 24/7 minimalista
  - atualiza `heartbeat-report.json` a cada 5 segundos
  - escreve logs simples no `stdout`

## Agentes

- `supervisor`
  - conectado ao 9router
  - testado com sucesso
- `planejador`
  - conectado ao mesmo motor
  - pronto para execucao
- `riscos-campo`
  - conectado ao mesmo motor
  - pronto para execucao

Observacao:

- Na UI do heartbeat, o terceiro agente pode ser exibido como `Pesquisador`, mas internamente o id atual ainda e `riscos-campo`.

## Configuracao de runtime

- Frontend: `4141`
- Backend: `4242`
- 9router local: `http://127.0.0.1:20128/v1`
- Modelo atual: `cx/gpt-5.4-mini-xhigh`

## Problemas ja resolvidos

- Repo reduzida ao frontend essencial mais backend novo.
- Porta do frontend estabilizada em `4141`.
- Conflito frontend/backend resolvido com backend em `4242`.
- CORS adicionado para comunicacao frontend-backend.
- Heartbeat saiu de mock para processo Python real.
- Cliente local do 9router deixou de exigir API key.
- ID incorreto do modelo foi corrigido para um modelo realmente exposto pelo endpoint local.

## Limitacoes atuais

- O heartbeat e um terminal visual embutido, nao um TTY interativo real.
- O backend guarda estado apenas em memoria.
- Nao existe orquestracao avancada entre agentes ainda.
- O `database` ainda e estrutural, sem pipeline real de persistencia.

## Estado operacional

- Projeto sobe.
- Heartbeat roda.
- Agentes respondem.
- 9router local responde.
- Base minima operacional esta de pe.

## Proximos passos recomendados

1. Padronizar nomes dos agentes (`riscos-campo` vs `pesquisador`).
2. Melhorar heartbeat para mostrar claramente `running`, `ready` e `error` por agente.
3. Adicionar ciclo automatico do supervisor para disparar outros agentes.
4. Persistir historico de execucoes e logs.
