# Simulacao Sompo 001 - risco de campo em soja RS

Data de corte: 2026-05-04

## Caso

Triagem preventiva de propriedades de soja no Rio Grande do Sul com restricao hidrica durante fases criticas da safra 2025/2026.

O objetivo nao e calcular indenizacao real nem prometer economia financeira. O objetivo e dar aos agentes do LUCA-AI um caso plausivel para trabalhar em cima: identificar apolices/talhoes em risco, cobrar evidencia minima, priorizar vistoria e gerar acao preventiva antes do pico de sinistro.

## Base verificada

- Sompo Agricola cobre modalidades Custeio, Produtividade e Granizo; Produtividade indeniza quando clima reduz produtividade medida abaixo da produtividade definida na apolice.
- A cobertura multirrisco inclui Seca/Estiagem.
- As condicoes de Sompo Produtividade usam produtividade garantida, produtividade obtida, preco, area segurada, salvados e franquia para apuracao.
- Conab registrou baixos volumes e distribuicao irregular de chuva no Rio Grande do Sul, com reducao das produtividades estimadas em parte do estado.
- Secretaria da Agricultura do RS/Emater registrou restricao hidrica persistente no Oeste e Noroeste, reducao de porte, abortamento de estruturas reprodutivas, senescencia antecipada e produtividade media revista para 2.871 kg/ha.

## Artefatos

- `scenario.json`: fonte da verdade estruturada da simulacao.
- `validation.md`: auditoria de plausibilidade e cobertura dos parametros.
- `assets/image-manifest.json`: prompts, modelo e caminhos das imagens.
- `assets/*.png`: imagens geradas pelo endpoint local 9router, modelo `cx/gpt-5.4-image`.

## Casos de sinistro simulados

A simulacao agora separa tres situacoes de sinistro provavel:

- `claim-risk-001-critical-drought-yield-loss`: pre-aviso critico por seca/estiagem, baixa chuva e evidencia incompleta.
- `claim-risk-002-incomplete-evidence`: caso informado pelo corretor, mas sem pacote minimo para regulacao.
- `claim-risk-003-harvest-confirmation`: acompanhamento de colheita para confirmar produtividade obtida antes de qualquer calculo.

Cada caso tem pergunta de triagem, evidencia obrigatoria, evidencia faltante, decisao operacional, SLA e tarefas para agentes.

## Prevencao de sinistros

O bloco `lossPreventionProgram` define tres camadas preventivas:

- Alerta antecipado por municipio, cultura e fase da lavoura.
- Coleta de evidencia antes do pico de aviso.
- Roteamento de vistoria por prioridade.

Essas camadas existem para reduzir atraso, retrabalho e decisao sem dado. Elas nao substituem regulacao real de sinistro.

## Regra de uso

Enquanto nao houver carteira real, `avoidedLossProxy` fica `0`. Os agentes devem operar fila, evidencia, severidade, TAT, acao preventiva e briefing. Valores financeiros reais so podem entrar com dados internos aprovados.
