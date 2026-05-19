"""
Teste 8: Modelos diferentes do 9router — Claude, Gemini, DeepSeek, GLM, GPT.
Uso:  python 08_providers.py
"""
import os
os.environ["OPENAI_API_KEY"] = "sk-placeholder"

from praisonaiagents import Agent

modelos = [
    ("GPT-5.5 (cx)", "cx/gpt-5.5"),
    ("GLM-5.1", "glm/glm-5.1"),
    ("GPT-5.4-mini-xhigh (cx)", "cx/gpt-5.4-mini-xhigh"),
]

pergunta = "Em uma frase: qual e a maior vantagem de usar agentes de IA?"

for nome, modelo in modelos:
    print(f"\n{'='*50}")
    print(f"Modelo: {nome} ({modelo})")
    print(f"{'='*50}")
    try:
        agent = Agent(
            instructions="Responda em pt-BR, uma unica frase.",
            llm=modelo,
            base_url="http://127.0.0.1:20128/v1",
        )
        result = agent.start(pergunta)
        print(result)
    except Exception as e:
        print(f"ERRO: {e}")
