"""
Teste 4: Agentes com modelos diferentes do 9router.
      Supervisor usa modelo forte, workers usam modelo rapido.
Uso:  python 04_multi_model.py
"""
import os
os.environ["OPENAI_API_KEY"] = "sk-placeholder"

from praisonaiagents import Agent, AgentTeam

supervisor = Agent(
    name="Supervisor",
    role="Coordenar a equipe e consolidar resultados",
    instructions="Voce e o supervisor. Revise o trabalho dos outros agentes e consolide. Responda em pt-BR.",
    llm="openai/cx/gpt-5.5",
    base_url="http://127.0.0.1:20128/v1",
)

pesquisador = Agent(
    name="Pesquisador",
    role="Pesquisar rapidamente",
    instructions="Pesquise e entregue fatos rapidos. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
)

analista = Agent(
    name="Analista",
    role="Analisar dados e gerar insights",
    instructions="Analise as informacoes e gere insights. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
)

team = AgentTeam(agents=[pesquisador, analista, supervisor])
result = team.start("Analise: vale a pena migrar de JavaScript para TypeScript em um projeto de 2 anos?")
print("\n=== RESULTADO ===")
print(result)
