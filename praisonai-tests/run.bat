@echo off
REM PraisonAI Tests — Configura 9router e roda o teste escolhido
REM Uso: run.bat [numero]
REM Exemplo: run.bat 1   (roda teste 01)
REM          run          (sem args = menu interativo)

set OPENAI_API_KEY=sk-placeholder
set OPENAI_BASE_URL=http://127.0.0.1:20128/v1

if "%~1"=="" (
    echo.
    echo  PraisonAI + 9router — Escolha o teste:
    echo.
    echo   00  Verificar conexao com 9router
    echo   01  Agente unico
    echo   02  Multi-agentes (Supervisor + Pesquisador)
    echo   03  Agente com ferramentas (@tool)
    echo   04  Multi-modelo (forte + rapido)
    echo   05  Self-reflection
    echo   06  Workflow (AgentFlow)
    echo   07  Memoria (persiste entre sessoes)
    echo   08  Provedores variados (Claude, Gemini, DeepSeek, GLM, GPT)
    echo   09  Simulacao LUCA-AI completa
    echo.
    set /p choice="Teste numero: "
    python %~dp0%choice%_*.py
) else (
    for %%f in (%~dp0%~1_*.py) do python "%%f"
)
