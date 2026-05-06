# Sompo agro: pesquisa e primeiro caso simulado

Data de corte: 2026-05-04

## Fontes verificadas

- Sompo Agricola: o produto publico cobre Custeio, Produtividade e Granizo, com culturas como soja, milho 1a safra, milho 2a safra, trigo e sorgo. Fonte: https://sompo.com.br/produto/sompo-agricola
- Condicoes Sompo Produtividade: a cobertura de seca/estiagem existe no produto subvencionavel, e a indenizacao usa produtividade garantida, produtividade obtida, preco, area segurada, salvados e franquia. Fonte: https://sompo.com.br/documents/d/global/vi-cg-susep-22082024
- Conab, 2026-03-02: a regiao Sul teve menor volume de chuva e houve restricao ao desenvolvimento da soja no Rio Grande do Sul, com lavouras em floracao e enchimento de graos. Fonte: https://www.gov.br/conab/pt-br/assuntos/noticias/chuvas-concentram-se-no-centro-norte-e-favorecem-lavouras-enquanto-sul-registra-menor-volume-e-restricao-a-soja
- Secretaria da Agricultura do RS, 2026-04: em ambientes com restricao hidrica persistente no Oeste e Noroeste do RS houve reducao de porte, abortamento de estruturas reprodutivas e impacto no peso de graos; produtividade media revista em 2.871 kg/ha. Fonte: https://www.agricultura.rs.gov.br/colheita-da-soja-alcanca-10-da-area-cultivada-no-rs
- Sompo Resseguradora, 2026-04-06: encerrou 2025 com R$ 85 mi em premios e mira R$ 200 mi em 2026, ampliando retencao local. Fonte: https://sompo.com.br/conteudo/sompo-resseguradora-lucra-em-primeiro-ano-de-opera%C3%A7%C3%A3o-e-mira-dobrar-volume-de-pr%C3%AAmios-em-2026
- Sompo Confraria Safra 2025, 2025-11-10: campanha com mais de 3 mil corretores, crescimento de 110% em Seguro Agricola entre os vencedores e 63% em premios emitidos no periodo. Fonte: https://sompo.com.br/conteudo/campanha-confraria-sompo-it%C3%A1lia-safra-2025-impulsiona-neg%C3%B3cios-e-premia-corretores-com-viagem-internacional
- CNN com informacao atribuida ao MAPA, 2025-06-24: congelamento de R$ 445 mi do PSR de cerca de R$ 1 bi, com distribuicao aprovada ate agosto de 2025. Fonte: https://www.cnnbrasil.com.br/economia/macroeconomia/governo-confirma-corte-de-quase-metade-do-orcamento-do-seguro-rural/

## Dor operacional prioritaria

A dor mais acionavel para um pipeline de prevencao de sinistro no campo e a combinacao:

1. produto agro da Sompo exposto a produtividade e eventos climaticos;
2. restricao hidrica real em soja no Rio Grande do Sul em 2026;
3. sinistro de produtividade que depende de diferenca entre produtividade garantida e obtida;
4. operacao de campo com necessidade de evidencia, vistoria, fila por severidade e comunicacao com corretor/produtor;
5. pressao de margem/resseguro como impacto executivo, nao como caso operacional.

## Primeiro caso simulado escolhido

**Caso 001: Triagem preventiva de soja no Rio Grande do Sul sob restricao hidrica.**

Motivo: e o caso mais realista para comecar porque cruza cobertura Sompo Agricola, evento de campo confirmado por fonte publica, risco direto de perda de produtividade e uma rotina operacional clara para agentes: mapear apolices, coletar evidencia georreferenciada, priorizar vistoria e gerar briefing executivo.

## Pipeline operacional

1. Fonte confiavel: Sompo Agricola, condicoes do produto e boletins oficiais Conab/RS.
2. Caso selecionado: soja RS com restricao hidrica.
3. Sinal de campo: municipio/talhao/fase da lavoura com lacuna de chuva, solo, manejo ou foto.
4. Scoring: severidade climatica + potencial de perda + completude da evidencia + impacto operacional.
5. Acao preventiva: contato tecnico, coleta de evidencia, visita de campo ou bloqueio de nova exposicao ate revisao.
6. Saida executiva: relatorio, procedimento, fonte da verdade e grafico/fluxo do caso.

## Campos minimos para simulacao

- policyId
- produtor
- municipio
- cultura
- UF
- talhao
- areaSeguradaHa
- produtividadeGarantidaKgHa
- produtividadeObtidaKgHa, se ja houver
- faseLavoura
- dataPlantio
- evidenciaChuvaLocal
- statusSolo
- statusManejo
- fotoGeorreferenciada
- severidade
- acaoPreventiva
- motivoDecisao

## Regra de simulacao segura

Nao inventar perda evitada em dinheiro sem carteira real. Enquanto nao houver dados internos de apolice e produtividade, usar `avoidedLossProxy = 0` e simular apenas fila operacional, qualidade de evidencia, severidade e acao preventiva.
