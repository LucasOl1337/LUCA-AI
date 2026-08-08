# Provenance — LUCA-AI Feature Kit · 20260801-211820

**Status:** draft-only · NÃO publicado  
**Produto:** LUCA-AI  
**PATH:** `C:/Projetos/LUCA-AI`  
**URL:** https://app.luca-ai.com.br  
**Repo:** https://github.com/LucasOl1337/LUCA-AI  
**Queue index (não avançado):** 3 → LUCA-AI

## Arquivos lidos

| Path | Uso |
|------|-----|
| `C:/Projetos/_content-factory/state/queue.json` | PRODUTO = products[3] LUCA-AI |
| `C:/Projetos/LUCA-AI/README.md` | painel de missões, stack React/Express, 9Router/Kamui/Yume |
| `C:/Projetos/LUCA-AI/changelog.md` | promo Remotion 2026-07-27; contas/admin; tracking; VM |
| `C:/Projetos/LUCA-AI/patchnotes.md` | comercial “uma missão, uma equipe”; capturas reais |
| `C:/Projetos/LUCA-AI/AGENTS.md` | app.luca-ai.com.br; sem deploy por push |
| `C:/Projetos/LUCA-AI/promo/roteiro.md` | Ato 2 Personas 00:08–00:14; cores de marca; tagline |
| `git -C C:/Projetos/LUCA-AI log --oneline -15` | commits 58538b1…b14f395 (cadastro, tracking, VM, marca LUCA) |
| Kit anterior `kits/LUCA-AI/20260801-170729` | feature anterior = Fluxo 5/5 → esta rodada = Personas |

## Fatos extraídos (3–8)

1. **Feature vendável desta rodada:** catálogo de **Personas** (Yume no LUCA) — “ESCOLHA QUEM PENSA / Personas reais. Especialidades claras.” Badge de estado **NO LUCA**. Fonte: `promo/roteiro.md` Ato 2 00:08–00:14; captura `promo/public/captures/02-personas.png`.
2. LUCA-AI é painel para criar, acompanhar e revisar **missões** executadas por agentes de IA (README).
3. Produção: React + Express na VM; domínio `app.luca-ai.com.br` via Cloudflare proxy/Tunnel (README, AGENTS.md).
4. Integração com **9Router, Kamui e Yume** na mesma máquina (README).
5. Tagline canônica: **“Sua missão. Uma equipe inteira.”** (`promo/roteiro.md`, patchnotes).
6. Identidade: void `#090c11`, ação `#0a84ff`, realce `#64d2ff`, vivo `#30d158`; Inter + JetBrains Mono; coruja/icon (`promo/roteiro.md`).
7. Comercial Remotion 42s + capturas sanitizadas em `promo/public/captures/` e previews em `promo/dist/` (changelog 2026-07-27).
8. Kit anterior (170729) já cobriu **Fluxo de personas 5/5** — esta rodada não repete; foca catálogo Personas.

## Refs copiadas para OUT/refs/

- `promo/public/captures/00-auth.png` … `05-delivery.png`
- `promo/dist/preview-personas.png`, `preview-team.png`, `preview-delivery.png`, `preview-pain.png`
- `brand/icon-512.png`, `promo/public/cyber-owl.jpg` (se presente)

## Visual truth

1. Stills primários de marketing com UI real = capturas `promo/public/captures/*` e previews `promo/dist/*`.
2. img2img/edit via 9Router: **não usado** (rota edits 404 nesta máquina) — grounded text-to-image + refs.
3. Vídeo draft 8s: slideshow ffmpeg de keyframes reais+gen (não é o comercial Remotion).
4. Comercial canônico existente (referência, não re-renderizado neste tick): `C:/Projetos/LUCA-AI/promo/dist/luca-ai-commercial.mp4`.
