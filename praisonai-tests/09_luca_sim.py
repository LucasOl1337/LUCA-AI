"""
Teste 9: LUCA-AI simulado — agentes com roles espelhando o LUCA.
Uso:  python 09_luca_sim.py
"""
import os
os.environ["OPENAI_API_KEY"] = "sk-placeholder"

from praisonaiagents import Agent, AgentTeam, tool


@tool
def web_search(query: str) -> str:
    """Busca simulada na web. Retorna resultados de exemplo."""
    resultados = {
        "sinistro": "Dados: sinistros automotivos cairam 12% em 2025 segundo SUSEP.",
        "dashboard": "Dashboards executivos aumentam decisao em 40% segundo McKinsey.",
        "python": "Python e a linguagem #1 segundo Stack Overflow Survey 2025.",
    }
    for key, val in resultados.items():
        if key in query.lower():
            return val
    return f"Sem resultados para '{query}'. Topicos: sinistro, dashboard, python."


@tool
def save_to_database(key: str, value: str) -> str:
    """Salva um dado no database local simulado."""
    import json, os as _os, datetime
    db_path = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "sim_database.json")
    db = {}
    if _os.path.exists(db_path):
        with open(db_path) as f:
            db = json.load(f)
    db[key] = {"value": value, "saved_at": datetime.datetime.now().isoformat()}
    with open(db_path, "w") as f:
        json.dump(db, f, indent=2)
    return f"Salvo: {key}"


BASE = "http://127.0.0.1:20128/v1"

transformador = Agent(
    name="Transformador de Missao",
    role="mission-transformer",
    instructions="Voce e o Transformador de Missao. Transforme a missao bruta em briefing operacional com objetivo, criterios, papeis e riscos. Responda em pt-BR, pragmatico.",
    llm="openai/cx/gpt-5.5",
    base_url=BASE,
)

pesquisador = Agent(
    name="Pesquisador",
    role="researcher",
    instructions="Voce e o Pesquisador. Busque e sintetize informacoes. Use web_search e save_to_database. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url=BASE,
    tools=[web_search, save_to_database],
)

planejador = Agent(
    name="Planejador",
    role="planner",
    instructions="Voce e o Planejador. Quebre objetivos em etapas, defina ordem. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url=BASE,
    tools=[web_search, save_to_database],
)

supervisor = Agent(
    name="Supervisor",
    role="supervisor",
    instructions="Voce e o Supervisor. Consolide os resultados dos outros agentes em um relatorio final. Responda em pt-BR.",
    llm="openai/cx/gpt-5.5",
    base_url=BASE,
)

team = AgentTeam(agents=[transformador, pesquisador, planejador, supervisor])
result = team.start("Missao: Analisar tendencias de prevencao de sinistros automotivos e gerar 3 recomendacoes praticas para uma seguradora.")

print("\n" + "="*60)
print("RESULTADO FINAL — SIMULACAO LUCA-AI via PraisonAI")
print("="*60)
print(result)
