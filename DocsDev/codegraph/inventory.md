# Inventário CodeGraph — LUCA-AI simplificado

Snapshot verificado em 2026-07-24 após `codegraph sync .`.

- 30 arquivos indexados
- 329 nós
- 673 arestas
- JavaScript, TSX e TypeScript
- 10 nós de rota detectados

## Produto mantido

### Bancada LUCA-AI

`src/pages/LucaAiPage.tsx` monta uma equipe de personas em cinco papéis fixos: Supervisor, Decisor da missão, Executores, Aprovação e Exibição final. A tela envia a missão para `POST /api/luca-ai/persona-team/run` e apresenta processo, canvas, comunicação e resultado final.

### Personas

`src/pages/PersonasPage.tsx` lista o catálogo Yume, importa personas para a bancada e remove importações. O backend consulta Yume apenas por GET através de `server/kamui-client.js`.

## Backend mantido

`server/persona-workbench.js` concentra o caso de uso completo:

1. lista e normaliza personas;
2. importa uma persona e guarda o prompt em cache;
3. remove uma persona importada;
4. executa o workflow de cinco papéis pelo 9Router;
5. registra e consulta eventos;
6. informa a saúde das dependências.

Rotas públicas:

- `GET /api/health`
- `GET /api/events`
- `GET /api/personas/avatar`
- `GET /api/personas/available`
- `POST /api/agent/persona/add`
- `POST /api/agent/persona/remove`
- `POST /api/luca-ai/persona-team/run`

Persistência: `.luca/personas.json` e `.luca/runtime-events.jsonl`. Se existir estado legado, `persona-store.js` migra somente `personaAgents` uma vez.

## Integrações

- Kamui/Yume: catálogo, prompt, versão e avatar; somente leitura.
- 9Router: execução OpenAI-compatible de cada participante do workflow.

## Removido

Não fazem mais parte do produto: painel inicial, Operacional, agentes globais, database, ferramentas, endpoints, heartbeat, histórico, WebSocket, estado global de missões, catálogos/governança, Worker Cloudflare, site separado, exemplos PraisonAI, assets promocionais e auxiliares de Computer Use.

## Evidência

- `npm test`: 36 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado.
- `npm audit`: zero vulnerabilidades.
