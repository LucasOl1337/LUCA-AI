# M5 — Vídeo do pipeline de ponta a ponta

**Status:** aguardando execução. **Paralela a:** M1–M4, M6, M7.

**Leia antes:** [README das missões](README.md) (contexto do stand, contratos e regras comuns) e [transcrição](TRANSCRICAO.md).

## Pedido (áudio)

- [01:23–02:10] "uma apresentação… com o motion graph… aparece no canto superior esquerdo o avatar dessa IA, a pessoa faz a pergunta… 'como que funciona o fluxo do dado até a entrega para os agentes'… pré-apresentação, já gravada, para não ter risco de… alucinar… mostra todo o fluxo do pipeline, desde a sinistralidade inerente no processo agrícola até o envio desses dados para a bancada agêntica, a classificação da bancada agêntica, como funciona a visualização do perfil da Sompo, como funciona a visualização do perfil do segurado."
- [03:24] Ferramentas citadas: Remotion (já no repo, em `promo/`), Hyperframes e "um repo que dá zoom no mouse", no estilo Screen Studio, com zoom automático no cursor. Pesquise e escolha uma opção open source que rode aqui, e justifique.
- [03:58] "a grande sacada… a pré-criação dos vídeos que mostram o pipeline funcionando… certeza que a gente tem uma demonstração end-to-end… vocabulário não técnico para… um investidor, um fundo de crédito."

## Entrega

1. **Roteiro primeiro.** Arquivo `missoes/stand-trator/roteiros/pipeline-completo.md` com a narração em PT-BR leiga e 6 a 8 blocos: risco no campo → sensor no trator (ESP32) → dado chegando no painel → episódio gravado → bancada de agentes analisando → classificação → visão da Sompo → visão do segurado → fechamento. Use só o que o app faz de verdade (`docs/sompo.md`). O que for simulado é dito como simulado. Duração alvo: 60–120 s.
2. **Captura real do app**, na bancada, com a demo local (`npm run demo:sompo`) e uma conta de demonstração: telas reais de cada etapa, com zoom no cursor. Siga a skill `mini-vitrine-sompo-capture` pra isolar o 3D e o áudio.
3. **Montagem em Remotion** (`promo/` ou uma composição nova ao lado): motion graphics de transição, legendas grandes, o avatar do LUCA-AI no canto superior esquerdo (use um placeholder com o contrato visual da M2 se o avatar final não estiver pronto; deixe o ponto de troca isolado) e a narração com a voz oficial (OmniVoice, skill `omnivoice`).
4. Saída: `public/stand/videos/pipeline-completo.mp4` (1080p) + `.srt` + o roteiro. Entregue com o id `pipeline-completo` pra M7.
5. Gancho nos 3 primeiros segundos pra prender quem passa ([03:35], "os hooks… para reter a atenção do público").

## Aceite

- O vídeo existe, toca e tem duração e tamanho razoáveis pra servir no app. Cada afirmação da narração bate com uma tela real capturada.
- No relatório: a ferramenta de zoom escolhida e por quê, a lista do que é real e do que é simulado, e o caminho do arquivo.
- O render roda pela fila (`agent-bench fila … rodar`).

## Arquivos seus

`promo/src/stand/**` (ou uma composição equivalente), `missoes/stand-trator/roteiros/pipeline-completo.md` e `public/stand/videos/pipeline-completo.*`.
