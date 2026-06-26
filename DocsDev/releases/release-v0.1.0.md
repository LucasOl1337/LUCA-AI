![v0.1.0](https://github.com/LucasOl1337/LUCA-AI/releases/download/v0.1.0/v0.1.0-card.png)

# v0.1.0 - Baseline oficial (22/06/2026)

Primeira release oficial do LUCA-AI, consolidando o estado funcional publicado na tag `v0.1.0`.

## Novidades

- **Coordenador multiagente:** o backend em `server/` organiza missoes e delega trabalho para personas configuraveis, incluindo Maestro, supervisor, planejador, pesquisador, designer e papeis auxiliares.
- **Painel operacional:** o frontend Vite/React em `src/` serve a interface de coordenacao com canvas de missao, trilhos de agentes, terminal, chat global e paginas operacionais.

## Melhorias

- **Contexto do repositorio nos prompts:** `repoContextForPrompt()` fornece arvore resumida e trechos dos arquivos principais para execucoes que precisam entender o proprio codigo.
- **Catalogos auditaveis:** endpoints, ferramentas, governanca, metas e estado publico ficam descritos em modulos compartilhados e manifests do servidor.

## Correcoes

- **Controle de ciclo unico:** `createSingleFlightLoop` reduz risco de execucoes concorrentes se atropelarem durante missoes longas.
- **Respostas vagas bloqueadas:** o gate de qualidade exige evidencia concreta de arquivos, caminhos ou verificacoes antes de aceitar contribuicoes de agente.

## Sistemas

- **Heartbeat real:** `heartbeat_monitor.py` gera `heartbeat-report.json` e o servidor transmite o status ao frontend por WebSocket.
- **Runtime Node/Vite:** `package.json` declara scripts de build, servidor, typecheck e testes Node para o app raiz.
- **Worker Cloudflare:** `worker/src/index.js` e `wrangler.jsonc` registram a superficie de worker usada pelo projeto.

---

## Notas tecnicas

Base publicada: tag `v0.1.0` em `main`.

Gates disponiveis no projeto: `npm test`, `npm run typecheck` e `npm run build`.

Este reparo nao altera codigo nem move a tag: apenas adiciona baseline documental local e completa o GitHub Release com card PNG anexado e embutido no topo.
