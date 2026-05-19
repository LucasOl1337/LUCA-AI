"""
Teste 7: Agente com memoria (persiste entre sessoes).
Uso:  python 07_memory.py
      Rode duas vezes — na segunda ele lembra da primeira.
"""
import os
os.environ["OPENAI_API_KEY"] = "sk-placeholder"

from praisonaiagents import Agent

agent = Agent(
    name="Assistente",
    instructions="Voce e um assistente com memoria. Lembre das preferencias do usuario. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
    memory=True,
    user_id="luca-test",
)

print("Primeira interacao — dizendo preferencias...")
result1 = agent.start("Meu nome e Lucas e eu prefiro respostas curtas e diretas.")
print(f"\n=== RESPOSTA 1 ===\n{result1}\n")

print("Segunda interacao — testando memoria...")
result2 = agent.start("Qual e o meu nome e como eu gosto das respostas?")
print(f"\n=== RESPOSTA 2 ===\n{result2}")
