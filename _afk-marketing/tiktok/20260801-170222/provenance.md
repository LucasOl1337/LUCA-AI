# Provenance — LUCA-AI TikTok 20260801-170222

## Product from queue

- STATE: `C:/Projetos/_content-factory/state/queue.json` → index=3 → slug=`LUCA-AI`
- PATH: `C:/Projetos/LUCA-AI`
- MIRROR: `C:/Projetos/LUCA-AI/_afk-marketing`
- BRAND: `C:/Projetos/LUCA-AI/brand`
- PROMO: `C:/Projetos/LUCA-AI/promo`

## Absolute paths read

1. `C:/Projetos/LUCA-AI/README.md`
2. `C:/Projetos/LUCA-AI/AGENTS.md`
3. `C:/Projetos/LUCA-AI/changelog.md`
4. `C:/Projetos/LUCA-AI/patchnotes.md`
5. `C:/Projetos/LUCA-AI/package.json`
6. `C:/Projetos/LUCA-AI/promo/roteiro.md`
7. `git -C C:/Projetos/LUCA-AI log --oneline -15`
8. Capturas/refs copiados de:
   - `C:/Projetos/LUCA-AI/promo/public/captures/*.png`
   - `C:/Projetos/LUCA-AI/promo/dist/preview-*.png`
   - `C:/Projetos/LUCA-AI/public/cyber-owl.jpg`
   - `C:/Projetos/LUCA-AI/public/icon-512.png`
   - `C:/Projetos/LUCA-AI/luca-mission-runtime-after-fix.png`

## Facts extracted (marketing-safe)

1. **Produto:** painel para criar, acompanhar e revisar missões executadas por agentes de IA. (README.md)
2. **Stack:** React, TypeScript, Vite, Tailwind, Express, WebSocket, Cloudflare Workers/Tunnel. (README.md)
3. **Domínio público:** `app.luca-ai.com.br` (AGENTS.md, patchnotes.md)
4. **Tagline / promessa:** “Sua missão. Uma equipe inteira.” / “Menos orquestração. Mais decisão.” (promo/roteiro.md, patchnotes.md)
5. **Feature kit UI real:** catálogo de Personas; “Fluxo de personas” com 5 etapas — Supervisor, Decisor da missão, Executores, Aprovação, Exibição final; barra 5/5; entrega final + aba Atividade. (promo/roteiro.md)
6. **Marca visual:** void `#090c11`, ação `#0a84ff`, realce `#64d2ff`, vivo `#30d158`; coruja `public/cyber-owl.jpg` / `icon-512.png`. (promo/roteiro.md)
7. **Infra recente:** produção em VM; API mesma origem; publicação via 9Router; contas + painel admin + tracking de uso. (changelog.md, git log: 5a1dada, d0e7fcd, 626858f, 93f8803, 58538b1)
8. **Repo:** https://github.com/LucasOl1337/LUCA-AI — público; `git push` não deploya. (patchnotes.md, AGENTS.md)

## Visual truth order used

a) Real captures → `OUT/refs/` (promo captures + previews + brand + mission runtime)  
b) image_generate img2img com `image_url` nesses refs (polish 9:16)  
c) Text-to-image não usado como base

## Forbidden avoided

Sem títulos inventados, sem HUD fantasia, sem features fora de README/changelog/roteiro.
