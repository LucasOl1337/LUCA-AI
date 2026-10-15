# M2 — Avatar e modo stand no monitor do trator

**Status:** aguardando execução. **Paralela a:** M1, M3–M7.

**Leia antes:** [README das missões](README.md) (contexto do stand, contratos e regras comuns) e [transcrição](TRANSCRICAO.md).

## Pedido (áudio)

- [00:06] "um avatar do nosso LUCA-AI, que vai aparecer aqui no monitorzinho do trator. E aí ele vai ser como se fosse o operário."
- [00:47] "Esse bot vai ter um avatar que aparece no monitor na hora que estiver no modo de conversa live."
- [01:23] Nos vídeos, "aparece ali no canto superior esquerdo o avatar dessa IA".

## Entrega

1. A página `/stand` em tela cheia, pensada pro monitor do trator (ver [foto](assets/cabine-frente.jpg); a moldura de MDF esconde as bordas, então deixe uma margem segura de ~6% em cada lado). Ela tem três estados:
   - **Atração (ocioso):** avatar em loop leve, com uma chamada curta ("Pega o microfone e pergunta pro operador LUCA") e a marca LUCA-AI/Sompo.
   - **Conversa:** avatar grande com lip-sync pelo `nivel_audio`, legenda grande da fala e o indicador ouvindo/pensando/falando.
   - **Vídeo:** player em tela cheia, com o avatar pequeno no canto superior esquerdo. Ao terminar, volta pra conversa.
2. O avatar é um operário com a identidade do LUCA-AI (brand em `brand/`, tokens existentes). A forma é livre: 2D animado (SVG/Lottie/canvas) ou 3D leve com Three.js, que o repo já usa. Critérios: lê bem a 2–3 m, roda liso sem travar o PC do stand e tem boca e olhos reagindo ao áudio. Mostre 2 ou 3 variações num print antes de fechar uma.
3. Consumir `shared/stand/eventos.ts` (contrato da M1). Até ele existir, use um stub que gera os eventos a partir de um áudio local, pra testar o lip-sync.
4. Selo visível "Assistente de IA". Atalho de teclado pra sair ou reiniciar a sessão.

## Aceite

- Prints dos três estados em 1920×1080 e na resolução do monitor do stand, tirados na bancada.
- Lip-sync visivelmente acompanhando um áudio de teste.
- Um vídeo do manifesto toca e, ao terminar, volta ao estado de conversa.

## Arquivos seus

`src/pages/StandPage.tsx`, `src/components/stand/**`, `src/stand.css` e o registro da rota em `App.tsx`.
