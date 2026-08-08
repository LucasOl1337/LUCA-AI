# VideoSpec — LUCA-AI TikTok/Reels microdemo (9:16)

**Duração-alvo:** 18–24s  
**Formato:** 1080×1920, safe areas top 12% / bottom 18% (UI TikTok/Reels)  
**Slug:** LUCA-AI · **ts:** 20260801-170222  
**Draft-only. Não publicar.**

## Arco

| Bloco | s | Função | Visual (repo) | Narração PT-BR |
|-------|---|--------|---------------|----------------|
| HOOK | 0–3 | Dor de orquestração | Ref pain + UI escura real | “Uma missão. Cinco conversas. Nenhuma conclusão.” |
| PROOF | 3–8 | Personas reais no catálogo | Capture personas / preview-personas | “No LUCA, expertise não é uma aba. É a pessoa certa.” |
| VALUE | 8–14 | Fluxo 5/5 com donos | Capture team-flow | “Supervisor, decisores, executores, aprovação, entrega.” |
| REVEAL | 14–19 | Missão → entrega final | Capture delivery / mission runtime | “Uma missão entra. Uma entrega sai — com o rastro à vista.” |
| CLOSE | 19–22 | Marca + CTA | Icon/coruja + end brand | “LUCA-AI. Sua missão. Uma equipe inteira.” |

## Overlay tipografia (safe)

- Centro vertical 35–55%; evitar cantos com botões nativos.
- Frases curtas: `ESCOLHA QUEM PENSA` · `CADA ETAPA TEM DONO` · `UMA ENTREGA SAI`
- Cores canônicas: void `#090c11`, ação `#0a84ff`, realce `#64d2ff`, vivo `#30d158` (promo/roteiro.md)

## Claims permitidos (só proveniência)

- Painel para criar, acompanhar e revisar missões de agentes de IA
- Personas / fluxo de personas 5 etapas
- Produção: React + Express na VM; domínio via Cloudflare Tunnel
- URL: `app.luca-ai.com.br`
- Tagline: “Sua missão. Uma equipe inteira.”

## Shots de vídeo (se gen disponível)

1. `shot-hook.mp4` ~6s — pain UI → pulso azul limpa ruído (img2vid de cover/kf-hook)
2. `shot-flow.mp4` ~6s — scroll vertical no fluxo 5/5 acendendo etapas (kf-flow)
3. `shot-delivery.mp4` ~6s — composer envia → entrega final + coruja (kf-delivery)

Sem tool de vídeo: usar `motion-prompts.md` + keyframes portrait.
