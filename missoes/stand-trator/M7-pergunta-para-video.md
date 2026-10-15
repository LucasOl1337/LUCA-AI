# M7 — Roteamento de pergunta para vídeo pré-gravado

**Status:** aguardando execução. **Paralela a:** M1–M6.

**Leia antes:** [README das missões](README.md) (contexto do stand, contratos e regras comuns) e [transcrição](TRANSCRICAO.md).

## Pedido (áudio)

- [02:54] "já fazer uma pré-atribuição de resposta vídeo, ao qual a gente já consegue deixar inerente no processamento da IA, que X pergunta pode ser jogada para o vídeo X e Z."
- [01:36] O motivo é não "alucinar ou perder-se no caminho" nas perguntas centrais.

## Entrega

1. O manifesto `shared/stand/videos.json` (o arquivo é seu), com o formato do README. Ids iniciais: `pipeline-completo` (M5), `painel-sompo` e `painel-segurado` (M6), mais um por cenário da M4, se fizer sentido. Para cada id: 8 a 15 perguntas de exemplo em PT-BR falado (incluindo jeitos informais e errados de perguntar) e um `resumo_falado` de 1–2 frases que a IA diz antes de soltar o vídeo.
2. Um roteador em `server/stand/roteador-video.js`: recebe a transcrição da pergunta e devolve `{id, confianca}` ou `null`. Implementação simples e auditável: embeddings (9Router `/v1/embeddings`, skill `9router-embeddings`) contra as perguntas de exemplo, com limiar. Abaixo do limiar, a IA responde ao vivo. Cache dos embeddings em disco.
3. Instrução pro cérebro de voz (M1), num arquivo de prompt seu que a M1 importa: quando o roteador acertar, a IA fala o `resumo_falado` e chama `tocar_video(id)`. Quando não acertar, responde normalmente e pode oferecer o vídeo mais próximo.
4. Um conjunto de perguntas de avaliação, fixo e curto (~30 casos, escritos à mão, sem gerar em lote), com o id esperado ou `null`, e um teste que roda essa tabela e mede acerto e falso positivo.

## Aceite

- Tabela de avaliação com ≥90% de acerto e 0 falso positivo nas perguntas fora de escopo, com o limiar anotado.
- Teste unitário passando e o manifesto válido, mesmo que os mp4 da M5/M6 ainda não existam (o roteador não depende do arquivo de vídeo).

## Arquivos seus

`shared/stand/videos.json`, `server/stand/roteador-video.js` (+ teste), `server/stand/prompt-videos.md` e o cache em `LUCA_DATA_DIR`.
