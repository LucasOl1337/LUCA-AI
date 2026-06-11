# Instruções para agentes Codex neste projeto

Por muitas vezes, o usuário está usando o microfone para falar com transcrição de áudio ao trabalhar com o Codex. Então, quando houver palavras que podem parecer esquisitas, mas façam sentido com o contexto, assuma a interpretação correta.

## Regras

1. Sempre que houver uma ação que o agente pode executar sozinho, não pare para pedir comandos manuais ou aprovação do usuário; execute.
2. Para navegação, inspeção visual, screenshots e validação em navegador, use sempre os plugins oficiais `@Navegador` ou `@Chrome`.
3. Não use Playwright MCP para navegação/testes visuais neste projeto, exceto se o usuário pedir explicitamente Playwright.
