# Validacao da simulacao

## Pergunta de plausibilidade

Esta simulacao aconteceria na vida real?

Sim. Ela junta um produto real de seguro agricola, uma cobertura real de seca/estiagem, uma safra real com restricao hidrica no Rio Grande do Sul e uma rotina operacional comum em seguradora agricola: triagem de evidencia, vistoria, priorizacao e comunicacao com produtor/corretor.

## O que e factual

- Produto Sompo Agricola e suas modalidades.
- Existencia de cobertura de seca/estiagem nas condicoes de produtividade.
- Formula e variaveis de indenizacao de produtividade.
- Restricao hidrica em soja no RS na safra 2025/2026, especialmente Oeste e Noroeste.
- Produtividade media estadual revista para 2.871 kg/ha pela Emater/RS-Ascar.

## O que e simulado

- IDs de apolice, produtores, municipios, talhoes e nomes operacionais.
- Scores de severidade, completude de evidencia e prioridade.
- Filas de agente, prazos internos e recomendacoes de acao.
- Imagens de campo e dashboard, criadas como assets de simulacao sem marca real e sem dados pessoais.

## Parametros suficientes para agentes

O caso tem parametros em sete camadas:

1. Apolice: produto, cobertura, cultura, UF, municipio, area, produtividade garantida.
2. Campo: talhao, fase fenologica, data de plantio, chuva recente, solo, manejo, fotos.
3. Risco: severidade climatica, potencial de perda, lacunas de evidencia, prioridade de vistoria.
4. Operacao: responsavel, SLA, acao preventiva, status, proximo passo.
5. Governanca: fontes, regras de aceitacao, limites de simulacao e bloqueios anti-ficcao.
6. Sinistro: gatilho, pergunta de triagem, evidencia obrigatoria, pendencias, SLA e decisao.
7. Prevencao: alerta antecipado, coleta guiada, roteamento de vistoria, perguntas preventivas e regras de parada.

## Casos de sinistro

Os tres casos simulados cobrem uma fila realista:

- Caso critico que pode virar pre-aviso.
- Caso com evidencia insuficiente que precisa voltar para saneamento.
- Caso de colheita que so pode fechar depois de produtividade obtida.

Isso e util para agentes porque cria decisoes diferentes: escalar, devolver para evidencia, acompanhar ou bloquear calculo.

## Prevencao de sinistros

A prevencao ficou modelada antes do sinistro formal. O agente deve detectar risco, pedir evidencia, priorizar vistoria e impedir conclusao automatica quando faltam dados. Esse fluxo e plausivel porque reduz retrabalho operacional sem fingir que existe indenizacao real calculada.

## Limites

Nao ha dados internos da Sompo. Por isso, qualquer perda evitada financeira fica bloqueada. A simulacao e util para orquestrar agentes e testar o fluxo de prevencao, mas nao deve ser usada como calculadora atuarial, decisao de sinistro real ou proposta comercial.
