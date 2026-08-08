# Provenance — LUCA-AI kit 20260801-170729

## Queue
- `C:/Projetos/_content-factory/state/queue.json` → index=3 → slug `LUCA-AI`
- PATH=`C:/Projetos/LUCA-AI` · MIRROR=`C:/Projetos/LUCA-AI/_afk-marketing` · BRAND=`C:/Projetos/LUCA-AI/brand` · PROMO=`C:/Projetos/LUCA-AI/promo`

## Arquivos lidos (absolutos)
1. `C:/Projetos/LUCA-AI/README.md`
2. `C:/Projetos/LUCA-AI/AGENTS.md`
3. `C:/Projetos/LUCA-AI/changelog.md`
4. `C:/Projetos/LUCA-AI/patchnotes.md`
5. `C:/Projetos/LUCA-AI/package.json`
6. `C:/Projetos/LUCA-AI/promo/roteiro.md`
7. `C:/Projetos/LUCA-AI/promo/README.md`
8. `git -C C:/Projetos/LUCA-AI log --oneline -15`

## Capturas/assets reais usados (refs/)
- `C:/Projetos/LUCA-AI/promo/public/captures/00-auth.png`
- `C:/Projetos/LUCA-AI/promo/public/captures/01-home.png`
- `C:/Projetos/LUCA-AI/promo/public/captures/02-personas.png`
- `C:/Projetos/LUCA-AI/promo/public/captures/03-team-flow.png`
- `C:/Projetos/LUCA-AI/promo/public/captures/04-mission-ready.png`
- `C:/Projetos/LUCA-AI/promo/public/captures/05-delivery.png`
- `C:/Projetos/LUCA-AI/promo/public/brand/icon-512.png`
- `C:/Projetos/LUCA-AI/promo/dist/preview-pain.png`
- `C:/Projetos/LUCA-AI/promo/dist/preview-team.png`

## Fatos extraídos (fonte inline)
1. **Produto:** painel para criar, acompanhar e revisar missões de agentes de IA. Stack React/TS/Vite/Tailwind + Express/WebSocket; produção em VM via 9Router/Cloudflare Tunnel. Domínio `app.luca-ai.com.br`. (`README.md`, `AGENTS.md`)
2. **Feature vendável:** fluxo de personas com 5 etapas — Supervisor, Decisor da missão, Executores, Aprovação, Exibição final; barra **5/5** pronta para executar. (`promo/roteiro.md` Ato 2 Momento 2)
3. **Tagline canônica:** “Sua missão. Uma equipe inteira.” / “Menos orquestração. Mais decisão.” (`promo/roteiro.md`, `patchnotes.md`)
4. **Comercial 42s:** Remotion + capturas reais; `npm run promo`. (`changelog.md` 2026-07-27, `package.json` script `promo`)
5. **Cores:** void `#090c11`, ação `#0a84ff`, realce `#64d2ff`, vivo `#30d158`. Tipografia Inter + JetBrains Mono. (`promo/roteiro.md`)
6. **Catálogo de personas** (Yume/Kamui, advisory): expertise como persona no painel, não modelo genérico. (`promo/roteiro.md`, `changelog.md` catálogo TARS/Yume)
7. **Git recente:** promo Remotion (`b14f395`…), migração VM, contas/admin, tracking de uso, API mesma origem, marca LUCA. (`git log`, `changelog.md`)
8. **Repo público:** https://github.com/LucasOl1337/LUCA-AI — sem auto-deploy no push. (`patchnotes.md`, `AGENTS.md`)

## Feature escolhida
**Fluxo de personas 5/5 (orquestração com donos claros)** — aparece em `promo/roteiro.md` e no comercial “uma missão, uma equipe” (`patchnotes.md` 2026-07-27).

## Visual pipeline
1. Refs reais copiadas para `refs/` e stills primários (BEFORE=preview-pain / AFTER=03-team-flow / HERO=02-personas).
2. img2img via `image_url` falhou (9Router 404 em `xai/grok-imagine-image-quality`).
3. Text-to-image Grok Imagine (`xai/grok-imagine-image`) gerou variantes BEFORE/AFTER/HERO/keyframe — copiadas como `*-gen.jpg`.
4. Vídeo: sem tool de mp4 neste job; keyframes + motion prompts. MP4 canônico do produto já existe em `promo/dist/luca-ai-commercial.mp4` (não republicado).
