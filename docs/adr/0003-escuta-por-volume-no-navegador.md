# 0003 · Escuta por volume no navegador

19/10/2026 · aceita

## Contexto

O Lucas pediu que o assistente do stand fique ativo por padrão: a pessoa chega e fala, sem tocar na tela. Ele também pediu que o toque fique só para liberar o áudio, se o navegador exigir. O Scribe cobra por minuto de conexão aberta (~36 créditos/min) e o teto do dia é 25.000. Deixar o Scribe aberto o dia todo custaria ~17.000 créditos em 8 h, antes de qualquer resposta falada.

## Decisão

O navegador mede o volume do microfone e só abre a sessão quando alguém fala perto (3× o ruído de fundo, por 250 ms). Não há palavra de ativação ("Ei, LUCA"). Os 600 ms anteriores ao despertar vão ao Scribe junto, e a sessão despertada não saúda. Se ninguém falar de verdade em 6 s, a sessão fecha e conta como despertar falso. Falsos seguidos pausam a escuta por um tempo crescente. `STAND_ESCUTA=0` volta ao toque.

Alternativas descartadas:

- **Scribe sempre aberto:** custo de ~17 mil créditos/dia e transcrição de conversas de quem só passa pelo stand.
- **Palavra de ativação no navegador** (modelo local de wake word): mais uma dependência e mais peso de CPU num aparelho fraco, e o público não sabe a palavra.
- **VAD por rede neural no navegador:** melhor contra música e conversa ao lado, mas é mais um pacote de vários MB. Fica para depois, se a feira mostrar falsos demais.

## Consequências

- Na feira, barulho alto e variável (anúncio no som, gente gritando perto) pode despertar. O custo de cada falso é ~4 créditos, e a pausa crescente limita a 30 falsos por hora no pior caso (~120 créditos/h).
- Os vídeos da Vitrine com som estão fora da Coruja, e a escuta só existe na Coruja. Vídeo do stand na Coruja já roda dentro de uma conversa.
- O microfone fica aberto no aparelho enquanto a Coruja está na tela, e o indicador do navegador aparece o tempo todo. Nada sai do aparelho antes do despertar.

Arquitetura e números: [`docs/stand-voz.md`](../stand-voz.md#escuta-conversa-sem-toque).
