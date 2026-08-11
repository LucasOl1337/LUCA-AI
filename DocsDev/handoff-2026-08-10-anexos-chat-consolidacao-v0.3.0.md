# Handoff — 2026-08-10 — Anexos no chat + consolidação canônica v0.3.0

> Passagem de bastão. Documentação de referência do produto continua em `docs/`
> (`arquitetura.md`, `integracoes.md`, `operacao.md`) — nada foi movido para cá.

## Objetivo central da sessão

Permitir anexar arquivos às missões do LUCA-AI (modo equipe e modo individual),
garantindo que o conteúdo realmente chegue às personas via 9Router, e depois
consolidar o repositório numa única linha `main` publicada em produção e como
release oficial.

## O que foi implementado

### Anexos no chat (fotos e arquivos de texto)

| Camada | Arquivo |
|---|---|
| Storage, validação, quota, purga | `server/chat-attachments.js` |
| Conversão para o provider | `buildUserContent` em `server/agent-loop.js` |
| Rotas upload/download/delete + fan-out | `server/index.js` |
| Composer, chips, prévia, remoção | `src/pages/LucaAiPage.tsx` |
| Hook de limpeza em cascata | `onChatSessionsRemoved` em `server/chat-library.js` |

- Isolamento por conta+sessão via `requireWorkspaceUserId()`; outra conta recebe
  `404`, anônimo recebe `401`.
- Validação por **assinatura real do arquivo** (magic bytes), nunca pela extensão.
- Limites: 4 anexos/mensagem, 10 MB cada, 20 MB por rodada e **50 MB acumulados
  por sessão** (`MAX_CHAT_SESSION_STORAGE_BYTES`).
- Download com `CSP sandbox` + `nosniff` + `no-store`; anexos ficam fora do
  snapshot público de `/s/:token`.
- Purga de arquivos ao apagar sessão e no cascade de pasta (sem órfãos em disco).

### Decisões técnicas que não são óbvias

1. **Texto é embutido no prompt, não enviado como bloco de arquivo.** No 9Router,
   Claude (`cc/*`) ignora `input_file` **em silêncio** e a persona responde como
   se nenhum arquivo existisse. Imagens seguem nativas (`image_url`).
2. **PDF é recusado no upload (`attachment_pdf_not_supported`, HTTP 415).** Probes
   em `cx/gpt-5.6-sol`, `cc/claude-fable-5` e `gcli/grok-4.5`, nos dois formatos de
   bloco, mostraram **todos cegos** a PDF — o GPT chegou a inventar resposta.
   Aceitar o upload produziria persona confiante sobre documento que nunca viu.
3. **Truncamento é declarado no prompt.** Texto acima de 120.000 chars é cortado
   com aviso explícito, para a persona não concluir a partir de meio documento.
4. **Imagens precisam de ≥32×32** — Claude devolve 400 em imagens muito pequenas.

### Correções colaterais

- `server/router-client.js`: SSE válido sem texto (`finish_reason: length`)
  degradava para `Unexpected token 'd', "data: {"id"...`. Bug **pré-existente**,
  só ficou visível com prompts maiores.
- `src/pages/LucaAiPage.tsx`: corrida ao trocar de sessão durante upload
  contaminava a conversa nova (`stillOwner()` + rollback dos arquivos já subidos).
- `server/luca-chat-run-error-cta.test.js`: teste frágil que fatiava o source por
  contagem de caracteres (`start + 5200`); passou a delimitar por marcador real.

### Consolidação e publicação

- Merge de 10 arquivos em conflito preservando os dois lados: o trabalho do outro
  agente (`toolsEnabled`, `runLucaAiIndividualRevision`, `individualDepth`,
  `setErrorRetry`) e os fixes de anexos revisados.
- Release **v0.3.0** publicada (tag + GitHub Release), commit `9a04c11`.
- `shared/release-version.js` é fonte única travada contra `package.json` pelo
  teste `RELEASE_VERSION_SINGLE_SOURCE_V1` — atualize os dois juntos.
- Stash `temp-wip-before-pure-models` e branch `codex/official-persona-roster`
  auditados e removidos: já superados pela produção (`isPureModelAgent` já estava
  em `d20baf2`; o stash ainda trazia um bypass de auth de protótipo).

## Estado atual (verificado nesta data)

| Item | Valor |
|---|---|
| `HEAD` / `origin/main` | `1093212` (sincronizados) |
| Tag `v0.3.0` | `9a04c11` |
| Produção (`/opt/sennin/luca-ai/current`) | `1093212` |
| Health produção | `{"ok":true,"version":"0.3.0"}` |
| `npm test` | 387/387 |

**Atenção:** o repo avançou depois da minha release — outro agente entregou
`feat/equipe: etapa visual`, `feat/sompo` e fixes de deploy, e já publicou. A tag
`v0.3.0` aponta para `9a04c11`, **não** para o `HEAD` atual. Os fixes de anexos
foram conferidos e continuam presentes em `1093212`.

## Pendências e próximos passos

1. **PDF continua sem suporte.** Para habilitar, é preciso um passo de extração de
   texto no servidor (ex.: `pdfjs`/`pdf-parse`) antes do `buildUserContent`; aí
   remova o `throw` em `normalizeAttachmentType` e devolva PDF ao `accept` e ao
   tooltip do composer.
2. **Nova tag/release** para o trabalho posterior a `9a04c11` (visual/sompo), se o
   dono quiser a release novamente alinhada ao `HEAD`.
3. `.scratch/luca-deploy-0ad79f2/` está untracked na árvore (artefato de deploy de
   outro agente) — não removi por não ser meu.
4. Depth 3 do modo individual segue idêntico ao depth 2 (round-robin planejado,
   não implementado) — **não verificado** nesta sessão, vem da skill.

## Bugs, riscos e pontos de atenção

- **Árvore compartilhada:** outro agente trabalha no mesmo checkout. Nesta sessão
  um `git reset` às 10:44 destruiu trabalho não commitado e obrigou a
  reconstrução inteira da feature. Commite incremental e cheque `git log` antes de
  assumir que a `main` é o que você deixou.
- **Fixture de PDF engana:** um PDF montado à mão sem compressão decodifica como
  UTF-8 e *parece* funcionar. PDF real usa `/Filter/FlateDecode`. Se for testar,
  gere o fixture comprimido ou o teste não prova nada.
- **Probe por família:** verde em `cx/` não certifica `cc/` nem `gcli/`. Use um
  token único que só existe dentro do anexo e exija o eco.
- **Testes source-lock** (`*-ui.test.js`) leem o `.tsx` e afirmam por regex. Nunca
  fatie por contagem de caracteres, e não confunda essas asserções com prova de
  upload, isolamento ou entrega ao modelo.
- **Verificação visual pendente:** a prova no navegador (chips, miniatura,
  bolha do operador) foi feita na branch isolada **antes** do merge com
  `toolsEnabled`/`individualDepth`. Não reabri o navegador após a consolidação —
  **não verificado** no estado atual.

## Contexto essencial para continuar

- Runbook de deploy, topologia da VM e pitfalls de SSH/permissão estão na skill
  `luca-ai-runtime` (inclui `references/chat-attachments.md`). Leia antes de
  qualquer publicação.
- Deploy resumido: `npm run stage:release` → `scp source.tar dist.tar` para
  `/opt/sennin/luca-ai/releases/<sha>/` → `tar -xf` + `npm ci --omit=dev` →
  `ln -sfn` em `current` → `systemctl restart luca-ai`. Nunca envie `state.tar`.
- SSH em git-bash exige `MSYS_NO_PATHCONV=1 ssh -i "C:/Users/user/.ssh/oracle-9router"`.
- 9Router local em `:20128` (dashboard) mas **produção usa `:20129/v1`**.
- Regras do `AGENTS.md` valem: nunca escrever no Yume, `worker/` é legado, não usar
  `git reset --hard`/`clean`/`stash` na árvore compartilhada.
