# PraisonAI + 9router — Testes

Todos os testes usam o 9router local como backend LLM.

## Requisitos

- Python 3.10+
- 9router rodando em `http://127.0.0.1:20128`
- `praisonaiagents` instalado (`pip install "praisonaiagents[llm]"`)

## Como rodar

### Opção 1: Direto pelo Python
```bash
cd praisonai-tests

# Setup (verificar conexão com 9router)
python 00_setup.py

# Testar
python 01_single_agent.py
python 02_multi_agents.py
python 03_tools.py
python 04_multi_model.py
python 05_reflection.py
python 06_workflow.py
python 07_memory.py
python 08_providers.py
python 09_luca_sim.py
```

### Opção 2: Pelo run.bat (Windows)
```cmd
run 1      (roda teste 01)
run 3      (roda teste 03)
run        (menu interativo)
```

## Testes disponíveis

| # | Arquivo | O que testa |
|---|---------|-------------|
| 00 | `00_setup.py` | Verifica conexão com 9router e lista modelos |
| 01 | `01_single_agent.py` | Agente único, pergunta simples |
| 02 | `02_multi_agents.py` | 2 agentes em sequência (Pesquisador → Planejador) |
| 03 | `03_tools.py` | Ferramentas customizadas (@tool) — cálculo + busca |
| 04 | `04_multi_model.py` | Modelos diferentes por agente (GPT-5.5 supervisor + GPT-5.4-mini workers) |
| 05 | `05_reflection.py` | Self-reflection — agente revisa e reescreve |
| 06 | `06_workflow.py` | Workflow com AgentFlow (pesquisa → escrita → revisão) |
| 07 | `07_memory.py` | Memória entre sessões (rode 2x para ver lembrar) |
| 08 | `08_providers.py` | Testa modelos variados (GPT, GLM, Gemini) |
| 09 | `09_luca_sim.py` | Simulação LUCA-AI completa com tools (web_search, save_to_database) |

## Modelos configurados

| Papel | Modelo | Motivo |
|-------|--------|--------|
| Rápido (workers) | `openai/cx/gpt-5.4-mini-xhigh` | Respostas rápidas, bom custo |
| Forte (supervisor) | `openai/cx/gpt-5.5` | Raciocínio mais profundo |

## Variáveis de ambiente

```bash
export OPENAI_API_KEY=sk-placeholder       # Required, valor não importa para 9router local
export OPENAI_BASE_URL=http://127.0.0.1:20128/v1
```

No Windows: `set` em vez de `export`.
