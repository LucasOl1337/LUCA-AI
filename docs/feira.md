# Dia da feira

Roteiro para quem vai cuidar do stand. Não precisa saber programar.

## Antes de abrir o stand

Alguém com o projeto no computador roda:

```
node bin/luca.js feira checar --url https://luca-ai.com.br --pretty
```

Se a última linha mostrar `"ok": true`, o site está pronto. Se aparecer `"ok": false`, mande a saída inteira para o Lucas antes de abrir o stand. O campo `falhas` mostra o que está faltando. O comando só lê o site e não muda nada.

## O que abrir em cada aparelho

Os dois aparelhos entram com **a mesma conta** do LUCA-AI. Sem isso, o tablet não vê o jogo do totem.

| Aparelho | Endereço | Para quê |
| --- | --- | --- |
| Totem, coruja que conversa | `https://luca-ai.com.br/stand/` | A coruja ouve o público e responde por voz. Quando o navegador pedir o microfone, clique em **Permitir**. |
| Totem, jogo do trator | `https://luca-ai.com.br/gameplay?quiosque=1` | O jogo já abre na cabine, em tela cheia. Se alguém apertar F5, ele volta para a cabine sozinho. |
| Tablet do operador | `https://luca-ai.com.br/operador` | Mostra o jogo do totem ao vivo. O selo no alto deve dizer **Ao vivo**. |

A página `https://luca-ai.com.br/totem` tem os dois botões: **Abrir Totem** (coruja) e **Abrir Gameplay em tela inteira** (jogo).

Atalho de equipe: **Shift+Q** sai do jogo em tela cheia e, na coruja sem login, abre a tela de entrar.

## Se der problema

### A internet caiu

- **Coruja:** continua na tela e passa os vídeos salvos no aparelho. Ela avisa "sem rede". A conversa volta sozinha quando a internet voltar.
- **Tablet:** o selo muda para "Sem sinal há N s" e volta para **Ao vivo** sozinho quando a rede voltar. Não precisa tocar em nada.
- **Passou de 2 minutos e não voltou:** confira o Wi-Fi do aparelho e aperte F5.

### O login caiu

- **Coruja:** aparece "sem login · equipe: Shift+Q e entre com a conta do totem". Aperte Shift+Q, entre com a conta, e a coruja completa volta sozinha.
- **Jogo ou tablet:** a tela de entrar aparece. Entre com a mesma conta, abra de novo o endereço da tabela acima e confira se o tablet voltou a dizer **Ao vivo**.

### A coruja ficou muda

Leia o aviso pequeno no rodapé da coruja:

| Aviso | O que fazer |
| --- | --- |
| "Permita o microfone pra conversar com o LUCA." | Clique no cadeado ao lado do endereço, ponha Microfone em **Permitir** e aperte F5. |
| "voz pausada: teto diário de créditos atingido" | Acabou a cota de voz do dia, que volta à meia-noite. A coruja segue passando vídeos. Avise o Lucas se precisar de mais. |
| "voz desligada no servidor (...)" | Problema no servidor. Mande o texto do aviso para o Lucas. |
| "voz caiu: ..." | Toque na tela ou aperte espaço para tentar de novo. Se repetir, aperte F5. |
| Nenhum aviso, mas não ouve | Confira se o microfone do totem está ligado e se é o microfone escolhido no computador. Depois aperte F5. |

Se a coruja abriu a partir da página `/totem` e não ouve, abra direto `https://luca-ai.com.br/stand/`.

### O tablet diz "Jogo pausado no totem"

A tela do jogo no totem foi minimizada ou escondida. Traga o jogo de volta para a frente no totem, e o tablet volta a dizer **Ao vivo** em 1 segundo.

## Quem chamar

Chame o **Lucas** (dono do LUCA-AI) e mande:

- o aviso da tela, ou uma foto dela;
- a saída do `feira checar`, se alguém conseguir rodar.
