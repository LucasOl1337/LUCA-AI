# Instruções para agentes Codex neste projeto

Por muitas vezes, o usuário está usando o microfone para falar com transcrição de áudio ao trabalhar com o Codex. Então, quando houver palavras que podem parecer esquisitas, mas façam sentido com o contexto, assuma a interpretação correta.

## Regras

1. Sempre que houver uma ação que o agente pode executar sozinho, não pare para pedir comandos manuais ou aprovação do usuário; execute.
2. Para navegação, inspeção visual, screenshots e validação em navegador, use sempre os plugins oficiais `@Navegador` ou `@Chrome`.
3. Não use Playwright MCP para navegação/testes visuais neste projeto, exceto se o usuário pedir explicitamente Playwright.

## CodeGraph

Use CodeGraph primeiro para entender estrutura, símbolos, chamadas, impactos e fluxos deste repositório. Antes de abrir muitos arquivos manualmente, consulte `codegraph_status`, `codegraph_files`, `codegraph_context`, `codegraph_explore`, `codegraph_trace`, `codegraph_callers`, `codegraph_callees` ou os equivalentes da CLI.

Inventário atual do projeto:

- Leia `DocsDev/codegraph/inventory.md` para o mapa completo de funcionalidades existentes, status, riscos e próximos passos.
- Abra `DocsDev/codegraph/codegraph-visual.html` no navegador para ver o grafo visual autocontido dos módulos e fluxos principais.
- Consulte `DocsDev/codegraph/codegraph-status.txt` e `DocsDev/codegraph/codegraph-files.json` quando precisar validar o estado do índice.

Se o índice parecer incompleto ou inconsistente, rode `codegraph sync .` e `codegraph status .`; se ainda houver arquivos esperados ausentes, rode `codegraph index . --force`.
