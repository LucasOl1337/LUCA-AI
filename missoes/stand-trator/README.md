# Missões — stand do trator LUCA-AI (brainstorm de 15/10/2026)

**Status:** aguardando execução. Os arquivos descrevem o trabalho; nada daqui foi implementado.
**Fonte:** áudio do Lucas de 4min32s ([original](assets/audio-brainstorm-2026-10-15.ogg), [transcrição com tempo](TRANSCRICAO.md)) e fotos da cabine ([frente](assets/cabine-frente.jpg), [medida 10 cm](assets/cabine-medida-10cm.jpg), [medida 7 cm](assets/cabine-medida-7cm.jpg)).
**Execução prevista:** um agente jcode (Opus 5.5 high) por missão, cada um na própria worktree a partir de `origin/main`, todos em paralelo. As missões M1 a M6 só mexem nos arquivos que são delas. Onde uma depende da outra, o contrato está escrito aqui e cada lado constrói contra ele.

## O que é o stand

O trator de MDF azul tem um monitor no "para-brisa". Nele aparece um avatar do LUCA-AI, que faz o papel do operário. Uma caixa de som com volume alto e um microfone deixam qualquer pessoa conversar com ele ao vivo: quem passa vê alguém interagindo e para pra assistir. Ele explica o sistema usando o conhecimento do repo e pesquisa ao vivo, como o Regente. Pra não improvisar nas partes críticas, as perguntas principais são respondidas com vídeos pré-gravados do pipeline. Ao lado fica o simulador em primeira pessoa, com controle de PS5.

Público-alvo das falas e dos vídeos: investidor e fundo de crédito, em vocabulário não técnico ([04:02]).

## Missões

- [M1 — Cérebro de voz ao vivo](M1-voz-ao-vivo.md): conversa em tempo real, conhecimento do sistema e pesquisa. [00:06–00:54]
- [M2 — Avatar e modo stand no monitor](M2-avatar-stand.md): avatar animado, tela cheia, fala sincronizada e player de vídeo. [00:06], [00:47], [01:23]
- [M3 — IA clica no site](M3-ia-clica-no-site.md): o agente opera o próprio app LUCA-AI durante a conversa ("human click"). [03:48]
- [M4 — Simulador em primeira pessoa com controle de PS5](M4-simulador-primeira-pessoa.md) e três cenários pré-programados. [00:57–01:23]
- [M5 — Vídeo do pipeline de ponta a ponta](M5-video-pipeline.md): da sinistralidade no campo até a bancada, com a classificação e os perfis Sompo e segurado. [01:23–02:18], [03:24], [03:58]
- [M6 — Vídeos curtos: painel da Sompo e painel do segurado](M6-videos-sompo-segurado.md). [02:18–02:35]
- [M7 — Roteamento de pergunta para vídeo](M7-pergunta-para-video.md): a pergunta X toca o vídeo X ou Z. [02:54]
- **M8 — Cabine física (fica com a equipe, não vai pro jcode):** nenhum monitor cabe na altura. Pelas fotos, a moldura come de 7 a 10 cm de cada lado da tela. Plano dito no áudio [03:12]: alargar **10 cm em cada lateral**. Conferir também a altura útil da abertura contra o monitor escolhido antes de cortar.

## Contratos entre missões

Todos os arquivos ficam em `shared/stand/`. Quem cria cada um está indicado abaixo. Quem consome constrói contra o contrato e usa um stub enquanto o original não chega.

1. **`shared/stand/eventos.ts`** (M1): eventos que o cérebro de voz emite pro avatar. `{tipo:'estado', valor:'ocioso'|'ouvindo'|'pensando'|'falando'}`, `{tipo:'nivel_audio', valor:0..1}` (pro lip-sync), `{tipo:'legenda', texto}`, `{tipo:'tocar_video', id}`, `{tipo:'acao_site', acao, args}`.
2. **`shared/stand/videos.json`** (M7): manifesto `[{id, titulo, arquivo, duracao_s, perguntas_exemplo[], resumo_falado}]`. M5 e M6 entregam os arquivos com os ids `pipeline-completo`, `painel-sompo` e `painel-segurado`. M7 mantém o manifesto.
3. **`shared/stand/acoes-site.ts`** (M3): lista fechada de ações que a IA pode executar no app (`abrir_aba`, `abrir_caso`, `rodar_cenario`, `analisar_na_bancada`...), cada uma com descrição curta pro modelo.

## Regras pra todos os executores

- Ler `AGENTS.md` e `INDEX.md` do repo antes. Worktree em `/home/lol/Projects/` (nunca `/tmp`). Não usar `git clean`, `reset --hard`, `stash` nem `checkout --`.
- Rota nova no Express exige atualizar `cli/catalog.js` e rodar `npm run cli:docs` e `npm run test:cli` (regra do `AGENTS.md`). O CLI `node bin/luca.js` serve pra operar e testar o app sem navegador.
- Nada de fuzz e nada de teste contra a produção (`luca-ai.com.br`). Teste local e focado.
- Render de vídeo, WebGL pesado ou gravação longa só entra pela fila da bancada: `agent-bench fila NOME rodar -- CMD`. Navegação e captura acontecem na bancada (skill `human-agent-coexistence`), nunca na tela do Lucas.
- Dado simulado aparece como simulado. Não inventar número de sinistralidade, cliente ou resultado.
- Fechar com commit e push na `main` e deploy na sennin-kvm, conforme o `AGENTS.md`, quando a entrega tocar o app. Relatar o SHA, o que foi testado de verdade e o que ficou faltando.
