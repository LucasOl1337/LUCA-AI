"""
Teste 2: Multi-agentes com handoff (Supervisor + Pesquisador).
Uso:  python 02_multi_agents.py
"""
import os
os.environ["OPENAI_API_KEY"] = "sk-placeholder"

from praisonaiagents import Agent, AgentTeam

pesquisador = Agent(
    name="Pesquisador",
    role="Pesquisar informacoes sobre o tema",
    instructions="Voce e um pesquisador. Busque fatos relevantes e sintetize. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
)

planejador = Agent(
    name="Planejador",
    role="Montar plano baseado na pesquisa",
    instructions="Voce e um planejador. Use o resultado da pesquisa para montar um plano pratico. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
)

team = AgentTeam(agents=[pesquisador, planejador])
result = team.start("Crie um plano para implementar testes automatizados em um projeto React.")
print("\n=== RESULTADO ===")
print(result)
