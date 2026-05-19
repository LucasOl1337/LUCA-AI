"""
Teste 6: Workflow com AgentFlow (sequencia de tarefas).
Uso:  python 06_workflow.py
"""
import os
os.environ["OPENAI_API_KEY"] = "sk-placeholder"

from praisonaiagents import Agent, Task, AgentFlow

pesquisador = Agent(
    name="Pesquisador",
    instructions="Pesquise fatos rapidos. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
)

escritor = Agent(
    name="Escritor",
    instructions="Escreva conteudo baseado na pesquisa. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
)

revisor = Agent(
    name="Revisor",
    instructions="Revise o texto e sugira melhoras. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
)

flow = AgentFlow()
flow.add(Task(name="pesquisa", agent=pesquisador, instruction="Pesquise: o que e RAG (Retrieval-Augmented Generation) e seus beneficios."))
flow.add(Task(name="escrita", agent=escritor, instruction="Escreva um resumo executivo sobre RAG baseado na pesquisa anterior."))
flow.add(Task(name="revisao", agent=revisor, instruction="Revise o resumo e melhore a clareza."))

result = flow.start()
print("\n=== RESULTADO DO WORKFLOW ===")
print(result)
