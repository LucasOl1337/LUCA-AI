# LUCA-AI Heartbeat

Painel local em Vite/React com backend Node para acompanhar heartbeat, database de pesquisa, supervisor e o executor `riscos-campo`.

## Scripts

```sh
npm run dev
npm run server
npm run build
npm run preview
```

Rode `npm run server` para iniciar o backend em `http://127.0.0.1:4141`. Rode `npm run dev` para iniciar a UI em `http://127.0.0.1:5173`.

Em producao local, rode `npm run build` e depois `npm run server`. O backend Express serve a UI compilada em `http://127.0.0.1:4141` junto com API e WebSocket na mesma origem.

## Baseline

Antes de alterar o projeto, rode:

```sh
npm run build
```

Resultado esperado: Vite compila `index.html`, CSS e JS para `dist/` sem erro.

## Estrutura

- `src/main.jsx`: estado, eventos e componentes React.
- `src/styles.css`: layout, tema e responsividade.
- `data/research-dashboard.json`: dados derivados do deep research report usado pelo dashboard.
- `server/`: backend local, WebSocket, store de missoes e heartbeat do supervisor.
- `.luca/`: memoria local gerada em runtime, ignorada pelo Git.
- `index.html`: entrada Vite.
- `AGENTS.md`: regras de trabalho para agentes neste projeto.

## Backend

O backend mantem o estado real do sistema:

- WebSocket em `ws://127.0.0.1:4141/ws`.
- API em `http://127.0.0.1:4141/api/state`.
- Database em `http://127.0.0.1:4141/api/database`.
- Missoes persistidas em `.luca/missions/`.
- Logs por agente em `.luca/missions/<mission-id>/`.
- Supervisor com heartbeat backend e terminal proprio.
- Executor `riscos-campo` preparado para jobs automaticos de clima, PSR e sinistro agricola.

## Escopo agentico atual

- `supervisor`: controla o heartbeat, le a database e despacha jobs.
- `riscos-campo`: executa os jobs derivados da pesquisa e grava status na database local.
- Heartbeat: persistido em `.luca/heartbeat.jsonl` e exibido no card `heartbeat`.
- Jobs: persistidos em `.luca/database-state.json`, mantendo configuracao minima e local.

## Publicacao local

- GitHub publico: `https://github.com/LucasOl1337/LUCA-AI`.
- Tunnel Cloudflare nomeado: `LUCA-AI`.
- Hostname publico: `https://luca-ai.fiapflow.com.br`.
- Origem local do tunnel: `http://127.0.0.1:4141`.
- Scripts de inicializacao local: `ops/run-backend.cmd` e `ops/run-tunnel.cmd`.

O site continua rodando nesta maquina. Se o computador desligar, dormir, perder internet, ou se o backend parar, o hostname publico tambem para de responder corretamente.

Variaveis opcionais:

```txt
LUCA_PORT=4141
LUCA_CODEX_BIN=codex.cmd
LUCA_CODEX_PROVIDER=9router
LUCA_CODEX_PROFILE=
LUCA_CODEX_EXTRA_ARGS=
LUCA_SUPERVISOR_MODEL=cx/gpt-5.5
LUCA_EXECUTOR_MODEL=cx/gpt-5.5
LUCA_SPECIALIST_MODEL=cx/gpt-5.5
LUCA_HEARTBEAT_MS=2000
```

Nao salve chaves no repositorio. Use configuracao local do Codex/9router ou `.env` ignorado. O backend forca `model_provider="9router"` e usa modelos `cx/...`, por exemplo `cx/gpt-5.5`, para evitar cair no provider OpenAI.

## Principios locais

- Interface pequena e hackeavel.
- Sem dependencia nova sem necessidade concreta.
- Uma mudanca por vez, sempre verificavel.
- Desktop amplo com modulos arrastaveis; mobile empilha os modulos.
