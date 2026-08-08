# Grok Imagine Video — LUCA-AI · 5×6s

**Uso:** copy-paste no Grok Imagine Video. Preferir **image-to-video** com o keyframe correspondente em `keyframes/`.  
**STATUS:** draft_only · NÃO publicar  
**Medium:** desktop SaaS agent mission panel (React). Banir game HUD / fantasy arena.  
**Ângulo:** expertise = persona + Fluxo 5/5 + missão→entrega + tagline canônica.  
**Paleta:** void `#090c11` · ação `#0a84ff` · realce `#64d2ff` · vivo `#30d158`.

---

## shot-01 — HOOK caos de conversas (6s · 16:9)

**Keyframe:** `keyframes/shot-01-keyframe.jpg`  
**On-screen PT (overlay humano):** `UMA MISSÃO · cinco conversas · zero fim`  
**Ref truth cutaway:** `refs/00-auth.png`, `refs/01-home.png`

```
6-second simple camera push-in on a dark void #090c11 mission-control desk. Translucent conflicting chat tabs and AI reply cards collide and drift out of focus while a firm empty center band holds for title text. Electric blue #0a84ff pulse starts at center and begins cleaning the noise. Glass SaaS UI fragments only, no logos, no trademarks, no faces, no game HUD, no fantasy, premium B2B product motion, 16:9 crop-safe center
```

---

## shot-02 — PROOF grade de personas (6s · 9:16)

**Keyframe:** `keyframes/shot-02-keyframe.jpg`  
**On-screen PT:** `Expertise não é aba`  
**Ref truth cutaway:** `refs/02-personas.png`

```
6-second simple vertical product motion, dark void #090c11 agent persona catalog UI, dense glass specialist cards, soft blue #0a84ff halo settles on one selected card, cyan #64d2ff edge accents, subtle selected-state chip energy, readable modern web dashboard density, vertical 9:16 crop-safe, no logos, no faces, no game HUD, Reels energy but still real SaaS product truth
```

---

## shot-03 — VALUE Fluxo 5/5 (6s · 16:9)

**Keyframe:** `keyframes/shot-03-keyframe.jpg`  
**On-screen PT:** `5/5 · cada etapa tem dono`  
**Ref truth cutaway:** `refs/03-team-flow.png`

```
6-second slow top-to-bottom track on a vertical five-stage mission pipeline UI: Supervisor, Decisor, Executores, Aprovacao, Exibicao. Each glass row lights in sequence with blue #0a84ff glow cascading down, progress bar fills and locks green #30d158 5/5 energy, monospaced status chips, void #090c11, no logos, no trademarks, no game HUD, premium B2B trailer motion, 16:9
```

---

## shot-04 — REVEAL missão → entrega (6s · 16:9)

**Keyframe:** `keyframes/shot-04-keyframe.jpg`  
**On-screen PT:** `UMA MISSÃO ENTRA → UMA ENTREGA SAI`  
**Ref truth cutaway:** `refs/04-mission-ready.png`, `refs/05-delivery.png`

```
6-second simple lateral reveal, split dark SaaS UI: left mission composer send pulse in blue #0a84ff, right single conversation thread resolving into a final delivery card with green #30d158 success hit, soft activity trail strip, cyan #64d2ff accents, void #090c11 glass panels, no logos, no trademarks, no faces, no game HUD, premium product trailer energy without baked-in text, 16:9
```

---

## shot-05 — CLOSE coruja + tagline (6s · 16:9)

**Keyframe:** `keyframes/shot-05-keyframe.jpg`  
**On-screen PT:** `Sua missão. Uma equipe inteira.`  
**Ref truth cutaway:** `refs/cyber-owl.jpg`, `refs/icon-512.png`

```
6-second gentle scale-out on centered cyber owl eyes with electric blue #0a84ff iris glow and cyan #64d2ff rim light on deep void #090c11, subtle circular pulse, clean empty bands above and below reserved for brand tagline overlay, elegant AI product end-card energy, no text, no logos, no trademarks, no game HUD, no fantasy castle, photoreal glossy owl eyes, 16:9
```

---

## Montagem (humano)

1. Gerar 5 clips 6s (i2v a partir dos keyframes quando o Grok permitir).
2. Salvar como `shot-01.mp4` … `shot-05.mp4` nesta pasta.
3. Atualizar `concat.txt` e rodar:
   ```bash
   ffmpeg -f concat -safe 0 -i concat.txt -c copy LUCA-AI-30s.mp4
   ```
4. Vertical ~24s: shot-02 + recortes de 01/03/04 + close 05 em CapCut; VO do roteiro CF.
5. Cutaways reais: `refs/02-personas.png`, `refs/03-team-flow.png`, `refs/05-delivery.png`.
6. CTA humano: `ABRA O LUCA-AI` · domínio `app.luca-ai.com.br`.
7. **NÃO publicar automaticamente.**
