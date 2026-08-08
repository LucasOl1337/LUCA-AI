# Manifest — LUCA-AI stills 20260801-181522

**Produto:** LUCA-AI  
**OUT:** `C:/Projetos/_content-factory/stills/LUCA-AI/20260801-181522/`  
**Mirror:** `C:/Projetos/LUCA-AI/_afk-marketing/stills/20260801-181522/`  
**Modelo:** grok-imagine-image · provider xai via 9Router  
**STATUS:** draft_only — NÃO publicar  
**Queue index:** 3 (não avançado)

## Assets (6/6)

| ID | Arquivo | Aspect | Uso |
|----|---------|--------|-----|
| A | `A-hero-16x9.jpg` | landscape 16:9 | landing hero, YT thumb base |
| B | `B-reels-portrait.jpg` | portrait 9:16 | capa Reels/TikTok/Shorts |
| C | `C-og-1x1.jpg` | square 1:1 | OG social / card |
| D | `D-feature-card.jpg` | landscape | feature kit · Fluxo 5/5 |
| E | `E-alt-hero-cinematic.jpg` | landscape 16:9 | alt hero / trailer end |
| F | `F-ad-banner-wide.jpg` | landscape wide | ad banner / OG wide |

## Prompts (EN, grounded)

### A — Hero 16:9
```
Premium dark SaaS product marketing hero key art, 16:9 landscape. Void background #090c11. Real-style AI mission-ops desktop UI: left persona cards grid (Yume specialists), right vertical team flow column with five stages Supervisor, Decisor da missão, Executores, Aprovação, Exibição final. Green completion bar labeled 5/5 in #30d158. Electric blue #0a84ff and cyan #64d2ff glass panels, Inter UI typography, subtle cyber owl brand mark in corner. Clean negative space top for title. Cinematic product poster lighting. Desktop SaaS panel only — not a game HUD, no invented logos, no fake brands, no fantasy arena.
```
**Cache:** `xai_grok-imagine-image_20260801_181600_927f1eeb.jpg`  
**Ref base (não editada):** `refs/03-team-flow.png` + `02-personas.png`

### B — Reels portrait
```
Vertical 9:16 Reels cover keyframe for dark AI mission-ops SaaS app. Tight crop on glass dark UI: stacked persona cards and green 5/5 progress bar #30d158 lighting up. Void field #090c11, electric blue #0a84ff rim light, cyan #64d2ff specular. Bold empty band in top third for Portuguese text overlay. TikTok Reels energy, motion-ready still. Desktop SaaS UI not game, no logos, no trademarks, no fantasy HUD.
```
**Cache:** `xai_grok-imagine-image_20260801_181607_09fd74dd.jpg`  
**Ref base:** `refs/02-personas.png` / crop `03-team-flow.png`

### C — OG 1:1
```
Square 1:1 Open Graph social card for LUCA-AI style dark SaaS product. Centered glass dark UI panel showing mission composer and Entrega final delivery view. Small row of five stage dots Supervisor to Exibição final with green checks #30d158. Blue #0a84ff glow rim, cyan accents #64d2ff, void #090c11 field. Clean space for short tagline. Premium B2B AI ops marketing still. No invented product titles, no game HUD, no trademarks.
```
**Cache:** `xai_grok-imagine-image_20260801_181615_3b00d908.jpg`  
**Ref base:** `refs/05-delivery.png` + `04-mission-ready.png`

### D — Feature card
```
Landscape feature card marketing still for AI mission-ops SaaS. Dark glass UI close-up of vertical team flow column: five stages Supervisor, Decisor da missão, Executores, Aprovação, Exibição final lighting in sequence, green 5/5 bar #30d158 filled. Void #090c11, electric blue #0a84ff accents, cyan #64d2ff highlights, Inter UI, product screenshot aesthetic. Premium feature highlight card composition with soft depth. Not a game, no fake brands, no logos invented.
```
**Cache:** `xai_grok-imagine-image_20260801_181622_031333c2.jpg`  
**Ref base:** `refs/03-team-flow.png`  
**Feature nomeada no repo:** Fluxo de personas 5/5

### E — Alt hero cinematic
```
Cinematic alternate hero 16:9 for dark AI mission control SaaS product. Wide void #090c11 stage, three translucent glass UI screens floating: persona grid, team flow 5/5 with green bar, Entrega final delivery card. Soft electric blue #0a84ff volumetric light, cyan #64d2ff rim, subtle cyber owl silhouette center background. Premium product cinema, depth of field, clean negative space. Desktop SaaS only — no game HUD, no invented logos, no dark fantasy arena.
```
**Cache:** `xai_grok-imagine-image_20260801_181631_5d4e7b30.jpg`  
**Ref base:** trio `02-personas` + `03-team-flow` + `05-delivery` + `cyber-owl.jpg`

### F — Ad banner wide
```
Wide landscape ad banner for dark AI mission-ops SaaS product. Horizontal composition: left third deep void #090c11 negative space for headline text, right two-thirds real-style dark UI with persona grid and vertical 5/5 team flow glowing blue #0a84ff cyan #64d2ff green completion #30d158. Subtle cyber owl silhouette. Premium B2B AI ops wide banner, ultra-wide feel. No invented product titles, no game HUD, no trademarks.
```
**Cache:** `xai_grok-imagine-image_20260801_181638_82c8b798.jpg`  
**Ref base:** `refs/03-team-flow.png` + owl

## Notas

- img2img não usado (9Router `POST /v1/images/edits` → 404).
- Medium forçado: desktop SaaS dark; banido HUD de jogo / marcas inventadas.
- Identidade de cor e Fluxo 5/5 vindos de `promo/roteiro.md`.
- Index da fila **não** avançado (só social pack avança).
