"""
Teste 3: Agente com ferramenta customizada (@tool).
Uso:  python 03_tools.py
"""
import os
os.environ["OPENAI_API_KEY"] = "sk-placeholder"

from praisonaiagents import Agent, tool


@tool
def calcular(expressao: str) -> str:
    """Calcula uma expressao matematica. Use para qualquer conta."""
    try:
        resultado = eval(expressao, {"__builtins__": {}}, {})
        return f"Resultado: {resultado}"
    except Exception as e:
        return f"Erro no calculo: {e}"


@tool
def buscar_info(tema: str) -> str:
    """Busca informacao simulada sobre um tema. Retorna dados de exemplo."""
    dados = {
        "python": "Python e uma linguagem de uso geral, criada por Guido van Rossum em 1991.",
        "react": "React e uma biblioteca JS para UI, criada pelo Facebook em 2013.",
        "ia": "Inteligencia artificial e o campo da computacao que busca simular inteligencia humana.",
    }
    tema_lower = tema.lower()
    for chave, valor in dados.items():
        if chave in tema_lower:
            return valor
    return f"Nenhum dado encontrado sobre '{tema}'. Dados disponiveis: python, react, ia."


agent = Agent(
    instructions="Voce e um assistente com ferramentas de calculo e busca. Use as ferramentas quando necessario. Responda em pt-BR.",
    tools=[calcular, buscar_info],
    llm="openai/cx/gpt-5.4-mini-xhigh",
    base_url="http://127.0.0.1:20128/v1",
)

result = agent.start("Quanto e 15 * 37? E o que voce sabe sobre Python?")
print("\n=== RESULTADO ===")
print(result)
