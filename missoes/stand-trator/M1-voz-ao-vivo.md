# M1 — Cérebro de voz ao vivo do LUCA-AI

**Status:** aguardando execução. **Paralela a:** M2–M7.

**Leia antes:** [README das missões](README.md) (contexto do stand, contratos e regras comuns) e [transcrição](TRANSCRICAO.md).

## Pedido (áudio)

- [00:15] "Ele vai explicar todo o procedimento do sistema, falando com a pessoa que vier aqui perguntar para ele."
- [00:21] "Usando o GPT Live, a gente vai tentar fazer isso." Isso é voz ao vivo no estilo OpenAI Realtime.
- [00:24–00:34] "um agente que vai ter todo o conhecimento do sistema, ele já vai estar integrado na internet com o repositório… consegue pesquisar as coisas em tempo real… tipo regente mesmo."
- [00:44] Microfone na mão e caixa de som com volume alto.

## Entrega

1. Uma rota no app, por exemplo `/stand` (a página visual é da M2), com uma sessão de voz full-duplex: o microfone da máquina do stand entra, a voz da IA sai e a pessoa pode interromper (barge-in).
2. O provedor de voz ao vivo é decidido por teste, não por suposição. Antes, verifique se o 9Router tem rota realtime e se existe chave OpenAI liberada (skill `segredos`; nunca grave chave no repo nem no chat). Use o melhor que funcionar de verdade, nesta ordem:
   - (a) OpenAI Realtime via WebRTC, com token efêmero gerado pelo Express;
   - (b) STT local, LLM do 9Router e TTS (OmniVoice `localhost:3900` ou Kamui), em streaming.
   Registre a decisão e a latência medida (fim da fala até o primeiro áudio) no relatório.
3. Conhecimento do sistema: um prompt-base em PT-BR, gerado a partir de `docs/sompo.md`, `docs/sompo-demo.md`, `INDEX.md`, `README.md` e das user stories da home. Fale com investidor, em vocabulário não técnico, com respostas curtas pra uma conversa em pé.
4. Ferramentas (tools) da sessão: pesquisa web, reaproveitando `server/agent-tools.js` (`fetch_url`, busca Tavily/Brave se houver chave); `buscar_no_repo`, só leitura sobre o conteúdo do repo indexado no servidor; `tocar_video(id)`, que lê o manifesto `shared/stand/videos.json` (M7); `acao_site(...)`, que segue o contrato da M3 (aqui basta repassar o evento).
5. Emitir os eventos de `shared/stand/eventos.ts` (o arquivo é seu) num canal que a página da M2 consome (WebSocket do Express já existente ou um EventTarget local).
6. Guarda de custo e segurança: a sessão fecha após N s de silêncio, com teto por sessão. Sem gravar áudio do público. Um aviso visível de que é IA fica a cargo da M2.

## Aceite

- Na bancada, com áudio de teste (arquivo injetado como microfone), a pergunta "como funciona o fluxo do dado até a entrega para os agentes?" recebe resposta falada coerente com `docs/sompo.md`. A IA chama `tocar_video('pipeline-completo')` quando o manifesto já tiver esse id.
- Interromper no meio da fala corta o áudio da IA em menos de 500 ms.
- A latência medida está no relatório, com o provedor escolhido e o motivo.

## Arquivos seus

`server/stand/**`, `shared/stand/eventos.ts` e a rota de token/sessão no Express (registro mínimo em `server/index.js`).
