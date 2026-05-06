# LUCA-AI database index

Este vault conecta o menu `database` do frontend as tres camadas de informacao coletada.

## Camadas

- [[Camada 01 - Pesquisa Bruta]]
- [[Camada 02 - Processamento]]
- [[Camada 03 - Dashboard]]

## Fonte de verdade

- Dataset: `data/research-dashboard.json`
- Caso estruturado: `Simulations/sompo-field-risk-001/scenario.json`
- Validacao: `Simulations/sompo-field-risk-001/validation.md`
- Pesquisa resumida: `docs/sompo-field-loss-research.md`

## Regra

Camada 01 preserva fonte bruta, camada 02 guarda informacao filtrada para agentes, camada 03 guarda somente saidas aprovadas para visualizacao no dashboard.
