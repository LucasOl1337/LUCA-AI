# Plano database + Obsidian

## Objetivo

Transformar o quadrado `database` do frontend em um indice navegavel das tres camadas reais da base LUCA-AI e ligar cada camada a uma pagina Markdown preparada para Obsidian.

## Prompt step by step usado para execucao

1. Leia `AGENTS.md`, rode a baseline barata `npm run build` e preserve mudancas existentes.
2. Inspecione `src/main.jsx`, `src/styles.css` e `data/research-dashboard.json`.
3. Identifique as tres divisoes do database: camada 01 pesquisa bruta, camada 02 processamento, camada 03 dashboard.
4. Para cada divisao, exponha dados reais ja coletados, sem inventar fonte nova.
5. Adicione links clicaveis dentro do modal do database para abrir informacoes do registro selecionado.
6. Crie um indice de links por camada: fontes externas para a camada 01, simulacoes/metodos/procedimentos para a camada 02, relatorios/assets para a camada 03.
7. Crie notas Markdown locais em formato de vault Obsidian.
8. Use links `obsidian://open?vault=LUCA-AI&file=...` para tentar abrir diretamente a pagina certa no Obsidian.
9. Aplique uma segunda regra para a camada 03: transformar dados tecnicos em conteudo claro para diferentes publicos.
10. Incorpore essa regra ao agente `database` como skill local reutilizavel.
11. Atualize o README com o caminho do vault e a limitacao: o usuario precisa registrar a pasta como vault no Obsidian.
12. Rode `npm run build` e documente o resultado.

## Artefatos

- Frontend: `src/main.jsx`, `src/styles.css`.
- Dados usados: `data/research-dashboard.json`.
- Motor de curadoria: `server/publication-engine.js`.
- Vault local: `docs/obsidian-vault/LUCA-AI`.
- Notas: `Index.md`, `Camada 01 - Pesquisa Bruta.md`, `Camada 02 - Processamento.md`, `Camada 03 - Dashboard.md`.

## Skill de pos-processamento amigavel

Agente dono: `database`.

Script: `server/publication-engine.js`.

Contrato:

- Entrada: item aprovado da camada 03 e contexto do database.
- Saida: `publicView` com resumo claro, importancia, informacoes confirmadas, perguntas para o usuario e links aprovados.
- Bloqueio: nao exibir nomes de campos internos, caminhos de asset como conteudo principal, payload cru ou informacao indefinida.

## Limitacao operacional

O navegador so consegue disparar o protocolo `obsidian://`. Para abrir direto no Obsidian, a pasta `docs/obsidian-vault/LUCA-AI` precisa estar aberta/registrada no Obsidian como vault chamado `LUCA-AI`.
