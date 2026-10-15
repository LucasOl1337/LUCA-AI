# M6 — Vídeos curtos: painel da Sompo e painel do segurado

**Status:** aguardando execução. **Paralela a:** M1–M5, M7. Usa o mesmo estilo visual da M5. Se a M5 ainda não tiver fixado o estilo, combine pelo arquivo `promo/src/stand/estilo.ts` (quem chegar primeiro cria; o outro reaproveita).

**Leia antes:** [README das missões](README.md) (contexto do stand, contratos e regras comuns) e [transcrição](TRANSCRICAO.md).

## Pedido (áudio)

- [02:18–02:35] "além dessa demonstração completa, ter duas frentes que mostram tanto a visão da Sompo, como funcionaria o painel do LUCA-AI com a Sompo, e como funcionaria esse painel para o segurado. Mas esteja essa pré-visualização já cadastrada, esse vídeo já pré-feito."
- [02:35] O motivo de deixar pré-gravado é poder "refinar e identificar as nuances… ajeitar as questões dos frames, dos motions e da visualização".

## Entrega

1. Dois roteiros curtos (30–60 s cada) em `missoes/stand-trator/roteiros/`:
   - **painel-sompo:** a seguradora vê carteira, frota, safra, episódios e a análise da bancada.
   - **painel-segurado:** o produtor vê o próprio trator, os alertas, o histórico e o que melhora no seguro dele.
   Antes de escrever, confira no app o que existe de verdade pra cada perfil (`src/pages/SompoPage.tsx`, `SompoFleetPanel.tsx`, `SompoStoryCards.tsx` e as user stories da home). **Se o painel do segurado não existir como tela própria, não invente:** grave o que existe, marque a lacuna no relatório e proponha a tela como missão nova.
2. Captura real na bancada + montagem em Remotion com avatar no canto, legenda e voz oficial, igual à M5.
3. Saída: `public/stand/videos/painel-sompo.mp4` e `painel-segurado.mp4` (+ `.srt`), com esses ids pra M7.

## Aceite

- Dois vídeos tocando, com cada afirmação ligada a uma tela real. Lacunas de produto listadas no relatório, sem tapar com mock disfarçado.

## Arquivos seus

`promo/src/stand/sompo/**`, `promo/src/stand/segurado/**`, os roteiros e os vídeos dos ids acima.
