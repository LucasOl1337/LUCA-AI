# Menu de Missoes

O Menu de Missoes define a missao global ativa dos agentes.

Ele e a ferramenta que estabelece o escopo atual de trabalho. Quando existe uma missao ativa, os agentes devem tratar essa missao como prioridade operacional ate que os criterios de conclusao sejam atendidos ou a missao seja limpa.

## Campos

### Descricao

Define o objetivo atual dos agentes.

Deve responder: o que precisa ser feito agora?

### Criterios de Conclusao

Define como saber que a missao terminou.

Deve responder: quais condicoes precisam estar satisfeitas para considerar a missao concluida?

## Comportamento Esperado

- Se nao houver missao ativa, os agentes nao devem executar trabalho de missao.
- Se houver missao ativa e o supervisor estiver rodando, o heartbeat/supervisor distribui o trabalho para os agentes.
- Os agentes devem ler a descricao e os criterios antes de agir.
- Os agentes devem usar os criterios de conclusao para decidir se a resposta esta suficiente.
- Ao concluir uma etapa relevante, os agentes podem informar progresso no Chat Global.

## Regra Principal

A missao ativa e a fonte de verdade do objetivo global atual.

Nenhum agente deve inventar outro objetivo fora da descricao e dos criterios de conclusao definidos no Menu de Missoes.
