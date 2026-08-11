# v0.4.0 — Artefatos visuais, suporte e histórico retido

![v0.4.0](https://github.com/LucasOl1337/LUCA-AI/releases/download/v0.4.0/v0.4.0-card.png)

A rodada deixa de terminar no texto: a bancada agora entrega relatório, gráficos e imagens.
Do outro lado, o Admin ganha o que faltava para dar suporte de verdade — entrar na conta do
cliente, ver o chat como ele viu e continuar enxergando o histórico mesmo depois do apagar.

## Novidades

- **Etapa visual** — sexta etapa `visual` no modo equipe (após a exibição final) e etapa
  opcional pós-juiz no modo individual. O pack traz relatório markdown, até 3 gráficos
  (`pie` | `tower` | `line`, até 8 itens) e até 2 imagens geradas pelo 9Router.
- **Painel SOMPO** — casos de exemplo agrícolas e rurais (seca, granizo, geada, ZARC, penhor,
  renovação) com dossiê didático, escolha entre template de equipe ou individual e auto-run
  direto na bancada.
- **Suporte no Admin** — botão *Entrar* assume a sessão do cliente por cookie, com banner de
  modo suporte e retorno à conta admin sem senha. Não incrementa login.
- **Histórico retido** — sessão apagada pelo usuário sai da UI mas permanece no library e no
  archive JSONL, então o suporte continua enxergando a conversa depois do soft-delete.
- **Anexos no composer** — `Ctrl+V` cola imagem do clipboard e arrastar arquivo faz upload,
  reusando o mesmo storage privado por sessão.

## Melhorias

- **Continuidade de follow-up** — cada rodada com `sessionId` recebe um bloco compacto
  (~3k chars) com as perguntas anteriores do operador e os vereditos já dados; anexos de
  turnos passados são reanexados (best-effort) e participantes individuais recebem os nomes
  anonimizados, para a réplica não ser contaminada por autoridade.
- **Inspeção de chat em tela cheia** — overlay com rail de sessões e bolhas operador/persona
  em somente leitura, no lugar do drawer de transcript cru.
- **Etapa visual mais robusta** — persona que responde prosa fora do contrato é re-promptada
  **uma vez** antes de cair no fallback textual (badge "plano corrigido" no pack), e as
  imagens do pack passam a ser geradas em paralelo.
- **Composer** — auto-grow em missões longas, rascunho fixado no canvas e limpeza imediata ao
  enviar; em falha, texto e anexos voltam para reenvio.

## Correções

- **O servidor virou o dono da rodada.** O autosave do browser reescrevia transcript e
  `finalResult` a cada 450 ms, e um PATCH atrasado apagava a resposta já gravada. Agora o
  autosave carrega só rascunho e configuração; transcript, resultado e pack visual saem do
  servidor, com merge por id derivado do `traceId` (`shared/persona-run-transcript.js`).
- **O archive parou de crescer sem teto.** Um snapshot inteiro era gravado a cada autosave.
  Agora só eventos canônicos arquivam, a gravação é compactada (limites por sessão, registro
  e bytes) e publicada por replace atômico — e falha de archive deixou de ser silenciosa:
  delete e prune só seguem depois da gravação durável confirmada.
- **Métricas do Admin medem envio, não HTTP.** `requestCount` exclui polling e infraestrutura,
  contadores legados inflados foram rebaixados e os rankings passam a valer 1 prompt = 1 rodada.
- Rodadas longas toleram 524 / soft-fail de borda: poll resiliente, recuperação do resultado
  pela sessão e retomada do job ativo após F5, sem reenviar a missão.
- Etapa visual vazia não bloqueia mais o início da missão; Enter e paste deixaram de ser
  engolidos com a equipe incompleta.
- `PUT /team-templates/:kind/order` passou a ser registrado antes de `/:id` — as setinhas de
  prioridade devolviam `template_not_found` (404).

## Sistemas

- Borda alcança o Express pelo Connectivity Directory do tunnel `luca-ai-production`;
  `install-vm` e os configs do cloudflared ficaram só com hostnames de `luca-ai.com.br`
  (fim da dependência de `luca-origin.bombapvp.com`).
- `AGENTS.md`: commit + push + deploy viraram padrão em trabalho pequeno/médio; guardrails
  destrutivos e `worker/` legado seguem exigindo confirmação explícita.
- Handoffs operacionais das ondas anteriores versionados em `DocsDev/`.

## Validação

`npm test` 423/423 · `npm run typecheck` limpo · `npm run build` ok ·
health de produção `{"ok":true,"version":"0.4.0"}` · `https://luca-ai.com.br` HTTP 200.
