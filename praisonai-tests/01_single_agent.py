"""
Teste 1: Agente unico com 9router.
Uso:  python 01_single_agent.py
"""
import os
os.environ["OPENAI_API_KEY"] = "sk-placeholder"

from praisonaiagents import Agent

agent = Agent(
    instructions="Voce e um assistente util. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
)

result = agent.start("Escreva um haiku sobre inteligencia artificial.")
print("\n=== RESULTADO ===")
print(result)
