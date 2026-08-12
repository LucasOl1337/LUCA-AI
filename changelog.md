# Changelog

## Unreleased

### Melhorias
- **Grok 4.6 no catálogo fechado** (`gcli/grok-4.6`): o seletor da bancada passa a oferecer a rota live do 9Router; o especialista visual e os presets passam a planejar nela (templates legados migram na abertura).
- Contrato da etapa visual pede infográficos/explained charts; a instrução de workflow deixou de pedir stills cinematográficos.
- Domínio público canônico em `https://luca-ai.com.br`: a borda redireciona HTTP com `308` e envia HSTS, evitando sessões aparentes sem cookie `Secure`.
- Módulo "Artefatos visuais" com toggle liga/desliga no painel de Seleção do modo individual: ligar auto-preenche a persona padrão; desligado, a rodada termina no juiz mesmo com persona salva (`visualEnabled` persistido na sessão).
- **Especialista visual disponível sem Yume**: builtin local `especialista-visual` entra no roster quando a slug falta no Kamui, com system prompt embutido (infográficos/explained charts via image gen + charts SVG).
- Contrato visual prioriza prompts de infográfico/gráfico explicado (labels legíveis, callouts, legenda) em vez de stills cinematográficos genéricos.
- **Imagem sempre materializada na etapa visual**: se a persona omitir `images[]`, o runtime sintetiza o prompt; se o 9Router não tiver provider de imagem (xAI/gpt-image), cai em infográfico SVG local e posta no chat.

## v0.4.0 — Artefatos visuais, suporte e histórico retido (2026-08-11)

### Novidades
- **Etapa visual** no modo equipe (sexta etapa `visual`, após a exibição final) e como etapa opcional pós-juiz no modo **individual**.
- Pack de artefatos: relatório markdown, gráficos `pie`/`tower`/`line` (até 8 itens) e imagens via 9Router `/images/generations`.
- Persona Yume canônica `especialista-visual` documentada em `docs/yume-personas/` (criar na VM; LUCA só lê).
- **Painel SOMPO**: casos de exemplo agrícolas/rurais (seca, granizo, geada, ZARC, penhor, renovação) com handoff do briefing para a bancada, escolha de equipe/individual e auto-run.
- **Suporte no Admin**: "Entrar" assume a sessão do cliente por cookie, com banner de modo suporte e retorno sem senha (não incrementa login).
- **Histórico retido**: sessão apagada pelo usuário some da UI mas permanece no library + archive JSONL para o admin.
- Anexos: colar imagem com `Ctrl+V` e arrastar arquivo direto no composer.

### Melhorias
- **Continuidade de follow-up**: cada rodada com `sessionId` recebe um bloco compacto (~3k chars) com perguntas anteriores e vereditos; anexos de turnos passados são reanexados (best-effort) e participantes individuais veem nomes anonimizados.
- Inspeção de chat no Admin em overlay full-screen com rail de sessões e bolhas operador/persona (somente leitura), no lugar do drawer de transcript cru.
- Página SOMPO redesenhada com tema agrícola, capa por caso e launch sem scroll.
- Retry automático de JSON na etapa visual: persona que responde prosa é re-promptada uma vez antes do fallback textual (badge "plano corrigido" no pack).
- Imagens do pack geram em paralelo (antes sequencial).
- Composer com auto-grow, rascunho fixado no canvas e limpeza imediata ao enviar (estilo Codex), com devolução de texto e anexos em caso de falha.

### Correções
- **Servidor vira dono da rodada**: o autosave do browser não reescreve mais transcript/finalResult; PATCH atrasado deixou de apagar resposta já gravada. Transcript e resultado passam pelo módulo compartilhado `shared/persona-run-transcript.js`, com merge por id derivado do `traceId`.
- **Archive deixou de crescer sem teto**: só eventos canônicos arquivam, gravação compactada e publicada por replace atômico; falha de archive deixou de ser silenciosa.
- Métricas do Admin passam a medir envio na bancada (1 prompt = 1 rodada), excluindo polling/infra do `requestCount` e rebaixando contadores legados inflados.
- Rodadas longas toleram 524/soft-fail de borda: poll resiliente, recuperação do resultado pela sessão e retomada de job ativo após F5.
- Etapa visual opcional não bloqueia mais o início da missão quando não há persona atribuída.
- Enter/paste no composer não são mais engolidos com equipe incompleta.
- `PUT /team-templates/:kind/order` registrado antes de `/:id` — as setinhas de prioridade voltaram a funcionar (era 404 `template_not_found`).

### Sistemas
- Borda alcança o Express pelo Connectivity Directory do tunnel `luca-ai-production`; `install-vm` e configs do cloudflared ficam só com hostnames de `luca-ai.com.br` (fim da dependência de `bombapvp`).
- `AGENTS.md`: commit + push + deploy viram padrão em trabalho pequeno/médio; guardrails destrutivos e `worker/` legado seguem exigindo confirmação.
- Handoffs operacionais das ondas anteriores versionados em `DocsDev/`.

## v0.3.0 — Anexos no chat (2026-08-08)

### Novidades
- Anexos privados por conta+sessão em equipe e individual, com validação por assinatura real do arquivo, quotas (4/mensagem, 10 MB cada, 20 MB/rodada, 50 MB/sessão) e download autenticado com `CSP sandbox` + `nosniff` + `no-store`.
- Bancada: ferramentas `web_search` e `calc`, motores heterogêneos nos presets, profundidade 1/2/3 no individual e entrada binária Individual/Equipe na home.

### Correções
- SSE válido sem texto degrada para resposta vazia em vez de estourar erro de JSON (`router-client.js`).
- Corrida de troca de sessão durante upload não contamina mais a conversa nova.

## v0.2.0 — Consolidação canônica (2026-08-05)

### Novidades
- Landing com metadata social, robots/sitemap, proof chips e CTAs mobile.
- Gates de release comercial: stage tarballs, deploy guard em main, version em `/api/health`.

### Melhorias
- Tokens visuais do produto nos badges, auth shell, accents e pie palette.
- CTAs de recuperação em Admin, Tools, Endpoints, Personas, Layout e estados vazios/erro do LUCA-AI.

### Correções
- Docs canônicos alinhados à produção Express na VM (borda via proxy, não Worker como runtime).
- install-vm falha fechado se a versão de health divergir.

### Sistemas
- Base canônica: produção VM (`codex/restore-current-luca`) + lanes aditivas (visual, bugs, contínuo, landing, ready-to-ship, docs).
