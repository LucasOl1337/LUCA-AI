# Dia da feira

Roteiro para quem vai cuidar do stand. Não precisa saber programar.

## Antes de abrir o stand

Alguém com o projeto no computador roda:

```
node bin/luca.js feira checar --url https://luca-ai.com.br --pretty
```

Se logo no começo da saída aparecer `"ok": true`, o site está pronto. Se aparecer `"ok": false`, mande a saída inteira para o Lucas antes de abrir o stand. O campo `falhas` mostra o que está faltando. O comando só lê o site e não muda nada.

## O que abrir em cada aparelho

Os dois aparelhos entram com **a mesma conta** do LUCA-AI. Sem isso, o tablet não vê o jogo do totem.

Use no máximo 8 telas ao vivo na mesma conta. A nona espera uma vaga. Cada conta também aceita no máximo 10 sessões de login: entrar num 11º navegador encerra a sessão mais antiga, que pode ser a do totem. Evite novos logins na conta do stand durante a feira e feche abas de operador que não estiver usando.

| Aparelho | Endereço | Para quê |
| --- | --- | --- |
| Totem, coruja que conversa | `https://luca-ai.com.br/stand/` | A coruja ouve o público e responde por voz. Quando o navegador pedir o microfone, clique em **Permitir**. |
| Totem, jogo do trator | `https://luca-ai.com.br/gameplay?quiosque=1` | O jogo já abre na cabine, em tela cheia. Se alguém apertar F5, ele volta para a cabine sozinho. |
| Tablet do operador | `https://luca-ai.com.br/operador` | Mostra o jogo do totem ao vivo. O selo no alto deve dizer **Ao vivo**. Se disser **Aguardando o totem** e aparecer "Nenhum gameplay rodando nesta conta", o jogo do totem não está aberto ou entrou com outra conta. |

A página `https://luca-ai.com.br/totem` tem os dois botões: **Abrir Totem** (coruja) e **Abrir Gameplay em tela inteira** (jogo).

Atalho de equipe: **Shift+Q** sai do jogo em tela cheia e, na coruja sem login, abre a tela de entrar.

### Medir se o jogo está liso (antes de abrir, uma vez)

1. No totem, abra `https://luca-ai.com.br/gameplay?quiosque=1&fps=1`. É o mesmo jogo, só que com um selo pequeno no canto de cima, à esquerda.
2. Dirija o trator por 30 s. No primeiro segundo o selo mostra `… fps`. É normal.
3. Tire uma foto do selo e mande no grupo. Ele aparece assim: `52 fps  mín 47  degrau 0/3  1920×1080`.
   - **fps:** a média dos últimos 5 s. Acima de 50 está ok.
   - **mín:** o pior momento desses 5 s.
   - **degrau:** a qualidade da imagem. 0/3 é a melhor. Se subir, o jogo baixou a qualidade sozinho para não travar. Ele volta a 0/3 quando folga.
   - **o último número:** o tamanho da imagem do jogo.
4. Para o público, abra de novo `https://luca-ai.com.br/gameplay?quiosque=1`, sem `&fps=1`.

O selo só aparece na tela do totem. O tablet do operador não muda.

### Webcam de sonolência no jogo (só se o Lucas pedir)

A câmera e seus alertas estão desligados no servidor de produção por ordem do Lucas em 21/10. Os passos abaixo só valem em ambiente local de validação ou depois de autorização explícita para reativar `LUCA_CAMERA_ENABLED`. Acrescentar `webcam=1` não ultrapassa esse bloqueio. O microfone da coruja continua disponível. Não há cobrança automática implementada neste release.

1. Ligue a webcam no totem e abra `https://luca-ai.com.br/gameplay?quiosque=1&webcam=1`.
2. Quando o navegador pedir a câmera, clique em **Permitir**. A imagem da câmera aparece num quadro pequeno no canto de cima, à direita, e não sai do totem.
3. Teste: feche os olhos por 2 s. A tela avisa **"Atenção: sinais de sono"** e o tablet do operador mostra o mesmo aviso.

Se o quadro disser "Nenhuma webcam encontrada", confira o cabo da câmera e toque em **Tentar de novo**. O jogo continua normal mesmo sem câmera. Para medir o FPS com a webcam ligada, junte os dois no endereço: `?quiosque=1&webcam=1&fps=1`.

## Se der problema

### A internet caiu

- **Coruja:** continua na tela e passa os vídeos salvos no aparelho. Ela avisa "sem rede · vídeos salvos neste aparelho · a conversa volta quando reconectar". A Simulação some enquanto estiver sem rede. A conversa volta sozinha quando a internet voltar.
- **Tablet:** o selo muda para "Sem sinal há N s" e volta para **Ao vivo** sozinho quando a rede voltar. Não precisa tocar em nada.
- **Passou de 2 minutos e não voltou:** confira o Wi-Fi do aparelho. Só aperte F5 depois que o Wi-Fi voltar: sem rede, o F5 no tablet mostra a página de erro do navegador (o dinossauro). A coruja aguenta o F5 mesmo sem rede.

### O login caiu

- **Coruja:** aparece "sem login · equipe: Shift+Q e entre com a conta do totem". Aperte Shift+Q, entre com a conta, e a coruja completa volta sozinha.
- **Jogo ou tablet:** a tela de entrar aparece cerca de 2 s depois. Entre com a mesma conta nessa tela. O aparelho volta sozinho para o jogo ou para o painel. Confira se o tablet voltou a dizer **Ao vivo**. Só se não voltar, abra o endereço da tabela acima. No computador do totem, entrar uma vez (pela coruja ou pelo jogo) traz os dois de volta.

### A coruja ficou muda

Leia o aviso pequeno no rodapé da coruja:

| Aviso | O que fazer |
| --- | --- |
| "Permita o microfone pra conversar com o LUCA." | Clique no cadeado ao lado do endereço, ponha Microfone em **Permitir** e aperte F5. |
| "voz pausada: teto diário de créditos atingido · volta à meia-noite" ou "voz desligada no servidor (teto_diario)" | Acabou a cota de voz do dia, que volta à meia-noite. A coruja segue passando vídeos. Avise o Lucas se precisar de mais. |
| "voz desligada no servidor (...)", com qualquer texto entre parênteses que não seja `teto_diario` | Problema no servidor. Mande o texto do aviso para o Lucas. |
| "voz caiu: ..." | Espere 1 minuto. Nesse tempo a coruja fica sem voz, e tocar ou apertar espaço não adianta. Depois de 1 minuto o aviso some. Fale ou toque para tentar de novo. Se o aviso voltar, aperte F5. Se voltar depois do F5, mande o texto do aviso ao Lucas. |
| Nenhum aviso, mas não ouve | Confira se o microfone do totem está ligado e se é o microfone escolhido no computador. Depois aperte F5. |

Se a coruja abriu a partir da página `/totem` e não ouve, abra direto `https://luca-ai.com.br/stand/`.

### O tablet diz "Jogo pausado no totem"

A tela do jogo no totem foi minimizada ou escondida. Traga o jogo de volta para a frente no totem, e o tablet volta a dizer **Ao vivo** em 1 segundo. Se o jogo ficou escondido mais de 15 minutos, o tablet passa a dizer "Sem sinal há N s". Trazer o jogo para a frente resolve do mesmo jeito.

## Quem chamar

Chame o **Lucas** (dono do LUCA-AI) e mande:

- o aviso da tela, ou uma foto dela;
- a saída do `feira checar`, se alguém conseguir rodar.
