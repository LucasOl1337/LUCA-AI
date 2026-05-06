# Contexto do projeto LUCA-AI

Data da analise: 2026-05-04

## Objetivo deste documento

Este arquivo resume o projeto `C:\Users\user\desktop\luca-ai` para um agente conseguir continuar o trabalho sem redescobrir tudo do zero. A leitura segue o metodo de `C:\Users\user\Desktop\DevKarpathy`: entender o sistema, medir uma baseline, mudar pequeno, verificar e documentar.

## Metodo operacional aplicado

Regras herdadas de `DevKarpathy` e do `AGENTS.md` local:

- Entender o projeto antes de editar.
- Rodar uma baseline barata antes de mudar comportamento.
- Fazer mudancas pequenas, locais e verificaveis.
- Preferir `src/main.jsx` e `src/styles.css` para mudancas de UI.
- Nao adicionar dependencia sem remover complexidade maior.
- Nao introduzir backend, persistencia ou automacao real de terminal sem requisito explicito.
- Manter desktop e mobile funcionais.
- Registrar verificacao, arquivos alterados e limitacoes.

Baseline executada nesta analise:

```sh
npm run build
```

Resultado observado: build Vite passou, gerando `dist/`. O Vite emitiu aviso de chunk JavaScript maior que 500 kB.

## Resumo do projeto

LUCA-AI e um painel local Vite/React com backend Node/Express. Ele visualiza heartbeat, agentes, database de pesquisa, missoes e uma simulacao operacional de risco agricola para a Sompo.

O foco atual nao e um produto generico. O caso principal e `Sompo 001`: triagem preventiva de soja no Rio Grande do Sul sob restricao hidrica. O sistema organiza dados em camadas, mostra um dashboard tecnico escuro e permite que um supervisor local despache jobs para agentes Codex configurados via 9router.

## Estrutura principal

- `package.json`: scripts e dependencias do projeto.
- `index.html`: entrada Vite.
- `src/main.jsx`: aplicacao React inteira, estado de UI, chamadas HTTP/WebSocket, componentes do dashboard, modal de database e terminais dos agentes.
- `src/styles.css`: tema escuro, layout desktop/mobile, canvas arrastavel, modal de database, tiles de agentes e paineis de simulacao.
- `server/index.js`: servidor Express, WebSocket, endpoints REST e servico estatico do `dist/`.
- `server/config.js`: portas, modelos, provider Codex, paths e timeouts.
- `server/mission-store.js`: persistencia local em `.luca/`, database runtime, missoes, logs, heartbeat e jobs.
- `server/agent-runtime.js`: definicao dos agentes, despacho de tarefas, integracao Codex, parser de resultados e fallbacks de missoes.
- `server/supervisor-loop.js`: loop de heartbeat, decisao de proximo job, planejamento, pausa e bloqueio.
- `server/codex-session.js`: wrapper para executar `codex exec` com provider 9router e capturar eventos JSON.
- `server/publication-engine.js`: pos-processamento amigavel da camada 03 do database.
- `data/research-dashboard.json`: database base com camadas, metricas, fontes, jobs e caso Sompo.
- `docs/`: planos de dashboard, database + Obsidian, pesquisa Sompo e vault Obsidian.
- `Simulations/sompo-field-risk-001/`: fonte estruturada da simulacao, validacao e assets.
- `public/`: assets servidos pela UI, incluindo imagens e casos.
- `ops/run-backend.cmd`: inicia backend local e escreve logs.
- `ops/run-tunnel.cmd`: inicia tunnel Cloudflare nomeado `LUCA-AI`.
- `.luca/`: estado runtime local gerado pelo servidor, ignorado pelo Git.

## Scripts de reproducao

```sh
npm run dev
npm run server
npm run build
npm run preview
```

Uso esperado:

- Desenvolvimento UI: `npm run dev`, abrindo `http://127.0.0.1:5173`.
- Backend/API/WebSocket: `npm run server`, abrindo `http://127.0.0.1:4141`.
- Producao local: `npm run build` seguido de `npm run server`; o backend serve `dist/` na mesma origem da API.

## Arquitetura de runtime

O frontend escolhe a origem assim:

- Em modo Vite dev, API em `http://127.0.0.1:4141` e WebSocket em `ws://127.0.0.1:4141/ws`.
- Em build servido pelo backend, usa `window.location.origin` e WebSocket compatnivel com `http` ou `https`.

O backend expoe:

- `GET /api/state`: estado completo do sistema.
- `GET /api/database`: snapshot do database pos-processado.
- `POST /api/mission/activate`: cria missao, reseta ambiente e inicia supervisor.
- `POST /api/mission/reset`: limpa missao ativa e reseta agentes.
- `POST /api/database/reset-field-prevention`: reseta estado runtime de prevencao com backup.
- `POST /api/supervisor/start`: inicia loop.
- `POST /api/supervisor/pause`: pausa loop.
- `POST /api/supervisor/step`: executa um tick manual.
- `POST /api/agent/:id/pause`: pausa agente.
- `POST /api/agent/:id/restart`: marca agente como running.
- `WS /ws`: envia eventos e snapshots de estado para o frontend.

## Agentes

Agentes declarados em `server/agent-runtime.js` e refletidos em `src/main.jsx`:

- `heartbeat`: tile de sistema no frontend; indica backend online/offline e liga/desliga supervisor.
- `supervisor`: loop local que decide quando planejar, despachar job, observar ou pausar.
- `planejador`: agente Codex que cria missoes reais para prevencao de sinistro no campo.
- `riscos-campo`: agente Codex que executa jobs de pesquisa/sintese, sempre focado em prevencao de sinistro agricola no campo.
- `database`: agente local de curadoria; aplica pos-processamento amigavel da camada 03.

Ponto importante: apesar da UI mostrar "terminais", a execucao real de tarefas agenticas passa pelo backend Node e pelo wrapper `codex exec`. O codigo tambem tem uma funcao generica `executeCommand`, mas o fluxo principal atual usa tarefas especializadas para `planejador` e `riscos-campo`.

## Database e camadas

O database base e `data/research-dashboard.json`, schema version 2. Ele organiza informacao em tres camadas:

- Camada 01, `rawResearch`: pesquisa bruta arquivada, bloqueada para dashboard.
- Camada 02, `processing`: processamento pronto, bloqueado ate filtragem.
- Camada 03, `dashboardIntegration`: pos-processamento aprovado para dashboard.

Estado observado nesta analise:

- `rawResearch`: 1 item.
- `processing`: 2 itens.
- `dashboardIntegration`: 1 item.
- Fontes confiaveis: 4.
- Jobs base: 5, todos em `queued` no snapshot de dados base.
- Riscos principais: `clima` score 92, `modelagem` score 84, `sinistro` score 80.

O backend nao entrega o JSON bruto diretamente para a UI. Antes, `server/publication-engine.js` transforma a camada 03 em `publicView`, escondendo termos tecnicos como `payload`, `schema`, `endpoint`, `JSON` e `API`.

## Caso Sompo 001

Pasta principal:

```txt
Simulations/sompo-field-risk-001/
```

Artefatos:

- `README.md`: explica o caso, base verificada, artefatos e regra de uso.
- `scenario.json`: fonte estruturada da simulacao.
- `validation.md`: auditoria de plausibilidade e limites.
- `assets/`: imagens e manifesto de imagens.

Escopo do caso:

- Cultura: soja.
- Regiao: Rio Grande do Sul.
- Evento: restricao hidrica, seca ou estiagem.
- Produto aderente: Sompo Agricola Produtividade.
- Uso permitido: fila operacional, evidencia, severidade, acao preventiva, briefing e governanca.
- Uso bloqueado: calculo financeiro real, indenizacao real, produtor real, apolice real, coordenada real ou decisao real de sinistro.

O `avoidedLossProxy` fica `0` enquanto nao houver carteira real.

## UI atual

A UI preserva um painel tecnico escuro com:

- Faixa superior de tiles para heartbeat, supervisor, planejador, riscos-campo e database.
- Canvas arrastavel com caixas de dashboard.
- Painel executivo Sompo agro com KPIs, grafico de barras, grafico de criticidade e tabela.
- Estimador financeiro local com sliders.
- Painel de definicao de missao que preenche o draft usado no terminal de heartbeat.
- Painel de caso Sompo 001 com imagem, metricas, casos de sinistro, prevencao e detalhes.
- Modal de database com abas das tres camadas e links Obsidian.
- Modal de terminal dos agentes com logs e controles de missao/supervisor.

Estado tecnico relevante:

- `src/main.jsx` concentra quase toda a aplicacao.
- `src/styles.css` e grande e contem classes antigas que parecem ter vindo de iteracoes anteriores; nem todas sao usadas na tela atual.
- A dependencia `recharts` alimenta os graficos e contribui para o tamanho do bundle.

## Persistencia local

O runtime grava em `.luca/`:

- `.luca/database-state.json`: estado mutavel de jobs, missoes autonomas, contribuicoes, simulacoes, relatorios, fontes, metodos e procedimentos.
- `.luca/heartbeat.jsonl`: trilha de heartbeat compactada quando passa de tamanho limite.
- `.luca/missions/`: missoes criadas, eventos, decisoes, resumos e logs por missao.
- `.luca/agents/`: memoria/logs de agentes.
- Backups de reset: pastas `field-reset-backup-*`, `planner-reset-backup-*` e similares.

Importante: `.luca/` e estado de maquina, nao deve ser tratado como fonte versionada principal.

## Compatibilidade atual

Ambiente observado:

- Windows nativo.
- Node: `v24.14.0`.
- npm: `11.9.0`.
- Vite: `7.3.2` no build observado.
- React: `19.1.1`.
- Express: `5.2.1`.
- WebSocket: `ws 8.20.0`.

Compatibilidade verificada:

- `npm run build` passou.
- `GET http://127.0.0.1:4141/api/state` respondeu HTTP 200.
- A API retornou configuracao com porta `4141`, provider `9router`, modelos `cx/gpt-5.5` e heartbeat de `2000` ms.
- `server.log` confirma backend escutando em `http://127.0.0.1:4141`.
- `vite-dev.log` indica Vite dev ativo em `http://127.0.0.1:5173`.

Alertas de compatibilidade:

- O build gera aviso de chunk JS maior que 500 kB. Nao bloqueia execucao, mas indica oportunidade de code split, especialmente por Recharts.
- A automacao agentica depende de `codex.cmd`, provider `9router` e configuracao local valida. O build e a API podem passar mesmo se o executor Codex falhar em runtime.
- O tunnel publico depende de `cloudflared.exe` e do arquivo `C:\Users\user\.cloudflared\config.yml`.
- Links `obsidian://` so abrem direto se o vault `docs/obsidian-vault/LUCA-AI` estiver registrado no Obsidian como `LUCA-AI`.
- A UI usa `ResizeObserver`, WebSocket e recursos modernos de browser; browsers antigos nao sao alvo.
- O backend faz CORS aberto para desenvolvimento local. Isso e compativel com a UI dev, mas nao e uma politica de seguranca refinada para ambiente publico.
- O estado de `currentMissionSnapshot` fica em memoria; reiniciar o backend preserva arquivos em `.luca/`, mas nao restaura automaticamente a missao ativa em memoria.

## Pontos fortes

- Fluxo pequeno e hackeavel: React local, Express local, JSON como fonte, `.luca/` como runtime.
- Baseline simples: `npm run build`.
- Caso Sompo tem regra clara anti-ficcao e separa fatos de simulacao.
- Backend e frontend compartilham uma origem em producao local.
- A camada 03 tem curadoria explicita para nao vazar payload tecnico ao dashboard.
- Supervisor tem regras de pausa e bloqueio para evitar backlog artificial.

## Riscos e dividas

- `src/main.jsx` esta grande; continuar adicionando componentes ali ainda segue a regra local, mas pode ficar dificil de manter se crescer muito mais.
- `src/styles.css` contem muito CSS historico; antes de remover classes, medir uso real na tela.
- O fluxo Codex/9router e uma dependencia operacional externa ao build.
- O parser de saida Codex aceita JSON por heuristica; se o formato do Codex mudar, jobs podem bloquear.
- A funcao generica `executeCommand` permite varios comandos de shell quando usada; nao e o fluxo principal, mas aumenta superficie operacional.
- A API nao tem autenticacao local. Para uso publico via tunnel, isso precisa ser tratado antes de expor controles sensiveis.
- O reset de database faz backup, mas altera estado runtime; usar apenas com intencao explicita.

## Proximos passos recomendados

1. Manter este arquivo como ponto de entrada antes de novas edicoes.
2. Para mudanca visual, alterar primeiro `src/main.jsx` e `src/styles.css`, rodar `npm run build` e validar no browser.
3. Para mudanca de agente, testar endpoint `/api/state`, depois um tick controlado em `/api/supervisor/step`, evitando rodar loop longo sem observar logs.
4. Para melhorar bundle, medir antes e depois; candidato principal e lazy-load de Recharts ou separacao dos paineis graficos.
5. Para publicacao via tunnel, verificar backend, `cloudflared` e exposicao dos endpoints de controle.

## Checklist rapido para o proximo agente

Antes de alterar:

```sh
npm run build
```

Se mexer no backend:

```sh
npm run server
```

Depois checar:

```sh
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4141/api/state
```

Se mexer em dashboard:

- Confirmar que os tiles continuam abrindo.
- Confirmar que o modal `database` ainda mostra as tres camadas.
- Confirmar que desktop e mobile continuam usaveis.
- Confirmar que nenhum dado bruto da camada 01 vira conteudo principal de dashboard.

## Limitacoes desta analise

- A compatibilidade foi validada por build e API local, nao por teste visual completo no navegador.
- A execucao real de jobs Codex/9router nao foi disparada para evitar alterar estado runtime sem pedido explicito.
- O estado Git ja estava sujo antes desta criacao; este documento nao tenta separar autoria das mudancas existentes.
