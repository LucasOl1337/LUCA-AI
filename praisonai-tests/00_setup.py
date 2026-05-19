"""
Configuracao do ambiente 9router para PraisonAI.
Este script configura as variaveis de ambiente necessarias.
Rode ANTES dos testes:  python 00_setup.py
"""
import os

os.environ["OPENAI_API_KEY"] = "sk-placeholder"
os.environ["OPENAI_BASE_URL"] = "http://127.0.0.1:20128/v1"

# Teste rapido de conectividade
import urllib.request
try:
    req = urllib.request.Request("http://127.0.0.1:20128/v1/models")
    with urllib.request.urlopen(req, timeout=3) as resp:
        data = resp.read().decode()
        import json
        models = json.loads(data)
        total = len(models.get("data", []))
        print(f"9router online: {total} modelos disponiveis.")
        print("\nModelos recomendados para testes:")
        recomendados = [
            "cx/gpt-5.5          (forte, para supervisor/transformador)",
            "cx/gpt-5.4-mini-xhigh (rapido, para workers)",
            "gemini/gemini-3.1-pro-preview (Gemini Pro)",
            "glm/glm-5.1          (GLM-5.1)",
            "cc/claude-sonnet-4-6  (Claude Sonnet via cc)",
        ]
        for m in recomendados:
            print(f"  {m}")
except Exception as e:
    print(f"ERRO: 9router nao esta acessivel em http://127.0.0.1:20128/v1")
    print(f"Detalhe: {e}")
    print("\nVerifique se o 9router esta rodando antes de continuar.")
