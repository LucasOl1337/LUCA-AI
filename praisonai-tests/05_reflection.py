"""
Teste 5: Agente com self-reflection.
      O agente gera, revisa e reescreve a propria resposta.
Uso:  python 05_reflection.py
"""
import os
os.environ["OPENAI_API_KEY"] = "sk-placeholder"

from praisonaiagents import Agent

agent = Agent(
    instructions="Voce e um redator tecnico senior. Escreva textos claros e precisos. Responda em pt-BR.",
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
    self_reflect=True,
)

result = agent.start("Escreva um paragrafo executivo sobre os beneficios de agentes de IA em automacao empresarial.")
print("\n=== RESULTADO ===")
print(result)
