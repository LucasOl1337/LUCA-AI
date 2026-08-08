# Provenance — LUCA-AI TikTok 20260801_181700

## Product from queue

- STATE: `C:/Projetos/_content-factory/state/queue.json` → index=3 → slug=`LUCA-AI`
- PATH: `C:/Projetos/LUCA-AI`
- MIRROR: `C:/Projetos/LUCA-AI/_afk-marketing`
- BRAND: `C:/Projetos/LUCA-AI/brand`
- PROMO: `C:/Projetos/LUCA-AI/promo`
- OUT: `C:/Projetos/_content-factory/tiktok/LUCA-AI/20260801_181700`
- MIRROR OUT: `C:/Projetos/LUCA-AI/_afk-marketing/tiktok/20260801_181700`

## Absolute paths read

1. `C:/Projetos/_content-factory/state/queue.json`
2. `C:/Projetos/LUCA-AI/README.md`
3. `C:/Projetos/LUCA-AI/changelog.md`
4. `C:/Projetos/LUCA-AI/patchnotes.md`
5. `C:/Projetos/LUCA-AI/promo/roteiro.md`
6. `git -C C:/Projetos/LUCA-AI log --oneline -15`
7. Brand: `C:/Projetos/LUCA-AI/brand/icon-512.png`, `C:/Projetos/LUCA-AI/public/cyber-owl.jpg`, `C:/Projetos/LUCA-AI/release-assets/v0.1.0-card.png`
8. UI real:
   - `C:/Projetos/LUCA-AI/promo/public/captures/00-auth.png` … `05-delivery.png`
   - `C:/Projetos/LUCA-AI/luca-mission-runtime-after-fix.png`
   - `C:/Projetos/LUCA-AI/prod-luca-post-preflight-deploy.png`

## Facts extracted (marketing-safe)

1. **Produto:** painel para criar, acompanhar e revisar missões executadas por agentes de IA. (README.md)
2. **Stack:** React, TypeScript, Vite, Tailwind CSS, Express, WebSocket, Cloudflare Workers e Tunnel. (README.md)
3. **Domínio:** produção via proxy Cloudflare + Tunnel da VM; app público citado em patchnotes como `app.luca-ai.com.br`. (README.md, patchnotes.md)
4. **Tagline:** “Sua missão. Uma equipe inteira.” / “Menos orquestração. Mais decisão.” (promo/roteiro.md, patchnotes)
5. **UI real:** catálogo de Personas; “Fluxo de personas” 5 etapas — Supervisor, Decisor da missão, Executores, Aprovação, Exibição final; barra 5/5; composer de missão → entrega final + aba Atividade. (promo/roteiro.md + captures)
6. **Marca:** void `#090c11`, ação `#0a84ff`, realce `#64d2ff`, vivo `#30d158`; coruja canônica. (promo/roteiro.md)
7. **Infra recente (git):** VM de produção, API mesma origem, 9Router, contas + painel admin + tracking de uso. (`5a1dada`, `d0e7fcd`, `626858f`, `93f8803`, `58538b1`)
8. **Repo:** https://github.com/LucasOl1337/LUCA-AI (público).

## Visual truth order used

a) Real captures/brand → `OUT/refs/`  
b) img2img via `image_generate(image_url=…)` — 9Router edits known 404; one-shot skip if fails  
c) Grounded text-to-image (Grok Imagine portrait 9:16) constrained by facts above  

## Forbidden avoided

Sem títulos inventados, sem HUD fantasia, sem “assistente chat genérico”, sem features fora de README/changelog/roteiro.
