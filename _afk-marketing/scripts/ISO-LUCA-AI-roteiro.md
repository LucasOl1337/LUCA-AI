# Roteiro — LUCA-AI
- **Gerado:** 2026-08-01T21:20:00-03:00
- **Produto:** LUCA-AI
- **Slug:** LUCA-AI
- **Versão:** v0.2.0 · painel web React + Express (VM)
- **Fonte ideias:** `queue/2026-08-01T211727Z-LUCA-AI-ideas.md` (#2 Reels missão→entrega + #1 expertise/persona + #3 Hero + #4 workflow/individual + #5 Imagine)
- **STATUS:** draft_only — NÃO publicar · NÃO gerar mídia neste job
- **Identidade:** void `#090c11` · ação `#0a84ff` · realce `#64d2ff` · vivo `#30d158`
- **Tagline:** “Sua missão. Uma equipe inteira.”
- **Domínio:** `app.luca-ai.com.br`
- **Ângulo deste ciclo:** “Expertise não é aba — é persona” + loop missão→Fluxo 5/5→Entrega final + modos `workflow` / `individual`+juiz

---

## Pitch em 1 linha
Missão no composer → personas Yume no Fluxo 5/5 (Supervisor → Decisor → Executores → Aprovação → Exibição) → uma conversa, uma Entrega final.

---

## Provenance (repo fidelity)

| Path absoluto | Uso |
|---|---|
| `C:/Projetos/_content-factory/state/queue.json` | index=3 → LUCA-AI; path/mirror/brand/promo |
| `C:/Projetos/_content-factory/queue/2026-08-01T211727Z-LUCA-AI-ideas.md` | ideias base deste roteiro |
| `C:/Projetos/LUCA-AI/README.md` | painel missões+agentes; stack; produção VM + CF Tunnel |
| `C:/Projetos/LUCA-AI/AGENTS.md` | app.luca-ai.com.br; Kamui GET-only; nunca escrever Yume |
| `C:/Projetos/LUCA-AI/INDEX.md` | mapa src/server/shared/worker/docs |
| `C:/Projetos/LUCA-AI/changelog.md` | promo Remotion 42s; contas/Admin; tracking; VM |
| `C:/Projetos/LUCA-AI/patchnotes.md` | comercial “uma missão, uma equipe”; v0.2.0 pipeline |
| `C:/Projetos/LUCA-AI/package.json` | v0.2.0; `npm run promo` |
| `C:/Projetos/LUCA-AI/docs/arquitetura.md` | React→Express→.luca; auth scrypt; cadastro sem e-mail |
| `C:/Projetos/LUCA-AI/docs/integracoes.md` | 9Router 14→12; Kamui GET; persona-team workflow/individual |
| `C:/Projetos/LUCA-AI/docs/operacao.md` | Admin tracking contadores (sem prompts); Express :4242 |
| `C:/Projetos/LUCA-AI/promo/roteiro.md` | comercial 42s; 3 atos; identidade; Fluxo 5/5; tagline |
| `C:/Projetos/LUCA-AI/promo/README.md` | `npm run promo` |
| `git -C C:/Projetos/LUCA-AI log --oneline -15` | `b14f395` … `214b33d` |

### Fatos extraídos (3–8+)
1. Painel para criar/acompanhar/revisar missões com agentes; stack React/TS/Vite/Tailwind + Express + WebSocket; produção na VM, PC só dev (`README.md`, `docs/arquitetura.md`).
2. Personas Yume via Kamui GET-only (`server/kamui-client.js`); nunca escrever no Yume (`AGENTS.md`, `docs/integracoes.md`).
3. Fluxo de personas 5/5: Supervisor, Decisor da missão, Executores, Aprovação, Exibição final (`promo/roteiro.md`).
4. `POST /api/luca-ai/persona-team/run` modos `workflow` (encadeia papéis) e `individual` (1–5 isolados + persona juíza em chamada separada) (`docs/integracoes.md`).
5. 9Router: 14 perfis visuais → 12 IDs de rota; rota externa nunca encaminhada; import preserva nome/prompt/versão e normaliza rota só no estado local (`docs/integracoes.md`).
6. Contas + Admin + tracking (logins/sessões/WS/execuções/erros; contadores/timestamps **sem** copiar prompts) — `93f8803`, `58538b1` (`changelog.md`, `docs/operacao.md`).
7. Comercial Remotion 42s; tagline “Sua missão. Uma equipe inteira.”; CTA “ABRA O LUCA-AI”; `npm run promo` (`promo/roteiro.md`, `package.json`, `patchnotes.md`).
8. Domínio `app.luca-ai.com.br` / `luca-ai.com.br`; API mesma origem; cadastro cria sessão sem confirmação por e-mail (`AGENTS.md`, `docs/arquitetura.md`).
9. Identidade: void `#090c11`, ação `#0a84ff`, realce `#64d2ff`, vivo `#30d158`; coruja `public/cyber-owl.jpg` / `brand/icon-512.png` (`promo/roteiro.md`).

### Refs visuais reais (ordem a — capturas; preferir img2img/moldura; NÃO inventar HUD)
- `C:/Projetos/LUCA-AI/promo/public/captures/00-auth.png`
- `C:/Projetos/LUCA-AI/promo/public/captures/01-home.png`
- `C:/Projetos/LUCA-AI/promo/public/captures/02-personas.png`
- `C:/Projetos/LUCA-AI/promo/public/captures/03-team-flow.png`
- `C:/Projetos/LUCA-AI/promo/public/captures/04-mission-ready.png`
- `C:/Projetos/LUCA-AI/promo/public/captures/05-delivery.png`
- `C:/Projetos/LUCA-AI/public/cyber-owl.jpg`
- `C:/Projetos/LUCA-AI/brand/icon-512.png`
- `C:/Projetos/LUCA-AI/promo/dist/preview-team.png` (se existir no dist)
- `C:/Projetos/LUCA-AI/promo/dist/preview-pain.png` (se existir no dist)

---

## 1) Vertical 9:16 — 15–30s
**Duração alvo:** 24s · **Formato:** Reels / TikTok / Shorts  
**Áudio:** ticks de etapa + whoosh de cut + hit verde 5/5  
**Texto on-screen:** PT-BR, bold, centro-superior · cuts no azul `#0a84ff`  
**Base ideia:** #2 “UMA MISSÃO ENTRA → UMA ENTREGA SAI” + #1 “expertise = persona” (`queue/…211727Z…`, ritmo `promo/roteiro.md` 00:00–00:30)

### Beats (hook → proof → value → reveal → close)

| t | Beat | Visual | Texto on-screen | Narração PT-BR |
|---|------|--------|-----------------|----------------|
| 0.0–3.0 | **HOOK** | Void `#090c11` + fragmentos de abas/respostas (estilo Ato 1 comercial). Labels colidem: “sem dono · sem critério · sem fim”. | `UMA MISSÃO · cinco conversas · zero fim` | “Uma missão. Cinco conversas. Nenhuma conclusão.” |
| 3.0–8.0 | **PROOF** | Captura real `02-personas.png`: grade Personas Yume. Halo `#0a84ff` em um card; chip “NO LUCA”. | `Expertise não é aba` | “No chat genérico você escolhe modelo. No LUCA você escolhe quem pensa.” |
| 8.0–16.0 | **VALUE** | Captura `03-team-flow.png`: coluna Fluxo acende Supervisor→Decisor→Executores→Aprovação→Exibição. Barra 5/5 fecha verde `#30d158`. | `5/5 · cada etapa tem dono` | “Supervisor, Decisor, Executores, Aprovação, Exibição — cada etapa com dono.” |
| 16.0–21.0 | **REVEAL** | Composer envia (`04-mission-ready`) → conversa única + “Entrega final” (`05-delivery`) + flash aba Atividade. | `UMA MISSÃO ENTRA → UMA ENTREGA SAI` | “Uma missão entra. A equipe trabalha. A decisão chega em uma conversa só.” |
| 21.0–24.0 | **CLOSE** | Coruja `cyber-owl.jpg` + pulso `#0a84ff` + tagline. Endcard nome LUCA-AI. | `Sua missão. Uma equipe inteira.` | “LUCA-AI. Sua missão. Uma equipe inteira.” |

### Narração completa (VO, ~24s)
> Uma missão. Cinco conversas. Nenhuma conclusão.  
> No chat genérico você escolhe modelo. No LUCA você escolhe quem pensa.  
> Supervisor, Decisor, Executores, Aprovação, Exibição — cada etapa com dono.  
> Uma missão entra. A equipe trabalha. A decisão chega em uma conversa só.  
> LUCA-AI. Sua missão. Uma equipe inteira.

### Notas de edição
- Preferir capturas reais em moldura; motion só pan/zoom e acender etapas — sem HUD inventado.
- Corte seco no beat final (igual comercial 00:42).
- Safe area 9:16: texto fora da faixa inferior 15%.
- Fontes: Inter títulos · JetBrains Mono estados (`promo/roteiro.md` identidade).

---

## 2) Hero 16:9 — 20–40s · 3 atos
**Duração alvo:** 36s · **Formato:** YouTube/LinkedIn/landing embed  
**Base:** comercial oficial 42s comprimido + H1 “Menos orquestração. Mais decisão.” (`promo/roteiro.md` Ato 3 + ideias #3)

### Ato 1 — Dor (0–8s)
| t | Visual | On-screen | VO PT-BR |
|---|--------|-----------|----------|
| 0–3 | Ruído de abas/respostas sobre void; “UMA MISSÃO” firme | `UMA MISSÃO` / `cinco conversas` / `nenhuma conclusão` | “Uma missão. Cinco conversas. Nenhuma conclusão.” |
| 3–8 | Auth/home real desfocada (`00-auth` / `01-home`); três labels “sem dono · sem critério · sem fim”; pulso azul limpa | `sem dono · sem critério · sem fim` | “Quando todo mundo responde, alguém ainda precisa organizar, comparar e decidir.” |

### Ato 2 — Prova (8–28s)
| t | Visual | On-screen | VO PT-BR |
|---|--------|-----------|----------|
| 8–14 | `02-personas.png` — grade Yume; halo + “NO LUCA” | `ESCOLHA QUEM PENSA` | “No LUCA, expertise não é aba. É a persona certa para o problema certo.” |
| 14–22 | `03-team-flow.png` — 5 etapas acendem; barra 5/5 verde | `CADA ETAPA TEM DONO` / `5/5` | “Você define quem supervisiona, executa, aprova e entrega.” |
| 22–28 | `04-mission-ready` → `05-delivery` + Atividade | `UMA MISSÃO ENTRA → UMA ENTREGA SAI` | “Uma missão entra. A equipe trabalha. A decisão chega em uma conversa só.” |

**Micro-beat feature (opcional 1s on-screen, sem VO extra):** chips `workflow` · `individual+juiz` (`docs/integracoes.md`).

### Ato 3 — Convite (28–36s)
| t | Visual | On-screen | VO PT-BR |
|---|--------|-----------|----------|
| 28–32 | Três telas reais alinham; coruja emerge | `MENOS ORQUESTRAÇÃO.` / `MAIS DECISÃO.` | “Menos tempo orquestrando IA. Mais tempo decidindo o que fazer com ela.” |
| 32–36 | Logo + tagline + CTA | `Sua missão. Uma equipe inteira.` / `ABRA O LUCA-AI` | “LUCA-AI. Sua missão. Uma equipe inteira.” |

### Narração completa (VO, ~36s)
> Uma missão. Cinco conversas. Nenhuma conclusão.  
> Quando todo mundo responde, alguém ainda precisa organizar, comparar e decidir.  
> No LUCA, expertise não é aba. É a persona certa para o problema certo.  
> Você define quem supervisiona, executa, aprova e entrega.  
> Uma missão entra. A equipe trabalha. A decisão chega em uma conversa só.  
> Menos tempo orquestrando IA. Mais tempo decidindo o que fazer com ela.  
> LUCA-AI. Sua missão. Uma equipe inteira.

### Notas de edição
- 16:9 1920×1080 referência; 30 fps se render.
- Só UI real do produto (Web SaaS dark panel) — proibido “game HUD” / marca fantasia.
- CTA único do comercial: “ABRA O LUCA-AI” · URL `app.luca-ai.com.br`.

---

## 3) 4 prompts Grok Imagine — stills
**Regra visual:** medium = dark desktop SaaS UI (React painel), void `#090c11`, azul `#0a84ff` / cyan `#64d2ff`, verde `#30d158`. Preferir **img2img** com `image_url` = captura real; polish só luz/tipografia. Sem logos inventados, sem fake game HUD, sem títulos de marca inventados.

### 3.1 Hero 16:9 (key art landing / YouTube thumb)
**Ref:** `C:/Projetos/LUCA-AI/promo/public/captures/03-team-flow.png`  
**Prompt EN:**
```
Dark desktop SaaS product UI key art, 16:9, void background #090c11, electric blue #0a84ff and cyan #64d2ff accents, green #30d158 completion bar labeled 5/5, AI mission operations panel with vertical team flow column labeled Supervisor Decisor Executores Aprovacao Exibicao final, glass dark panels, Inter UI and JetBrains Mono labels, subtle cyber owl brand mark corner, cinematic soft blue rim light, polished product screenshot style, no invented logos, no fake game HUD, no fantasy armor, photoreal UI chrome only
```

### 3.2 Reels 9:16 (cover / first frame)
**Ref:** `C:/Projetos/LUCA-AI/promo/public/captures/02-personas.png`  
**Prompt EN:**
```
Vertical 9:16 mobile cover, dark SaaS product UI screenshot style, void #090c11, persona cards grid with one card halo electric blue #0a84ff chip text NO LUCA, cyan #64d2ff highlights, bold Portuguese headline space at top third empty for overlay, glass dark cards, Inter type, cyber owl subtle watermark, clean product still, no game HUD, no invented brand name, no cluttered icons
```

### 3.3 OG 1200×630 (social share)
**Ref:** `C:/Projetos/LUCA-AI/public/cyber-owl.jpg` + moldura UI `05-delivery.png`  
**Prompt EN:**
```
Open Graph 1200x630 social card, left third cyber owl product brand photo on void #090c11, right two-thirds dark SaaS delivery panel with final answer card and green #30d158 status, electric blue #0a84ff glow line divider, space for title overlay top-left, clean corporate tech aesthetic, Inter UI, no fake logos, no esports banner, no game UI
```

### 3.4 Card 1:1 (LinkedIn/X square)
**Ref:** `C:/Projetos/LUCA-AI/promo/public/captures/05-delivery.png`  
**Prompt EN:**
```
1:1 product card still, dark React SaaS mission delivery screen, void #090c11 panels, single conversation thread ending in Entrega final highlight, soft cyan #64d2ff and blue #0a84ff accents, green success chip, minimal chrome, Inter and JetBrains Mono, brand-safe LUCA-AI product look only, no invented titles, no fantasy elements, no game scoreboard
```

---

## 4) 3 prompts Grok Imagine Video — shots 6s (motion simples)
**Regra:** pan/zoom/acender etapas sobre UI real; sem câmera de action game; sem texto inventado de marca.

### 4.1 Shot A — Grade personas (6s)
**Ref still:** `02-personas.png`  
**Prompt EN:**
```
6 second simple motion, dark SaaS UI screenshot of persona cards grid on void #090c11, slow push-in, electric blue #0a84ff halo travels across one card, subtle cyan #64d2ff specular, soft UI glow, no camera shake, no HUD overlays added, product demo polish only
```

### 4.2 Shot B — Fluxo 5/5 acendendo (6s)
**Ref still:** `03-team-flow.png`  
**Prompt EN:**
```
6 second simple motion, dark desktop mission ops UI, vertical team flow column steps light up top to bottom Supervisor then Decisor then Executores then Aprovacao then Exibicao final, progress bar fills to 5/5 green #30d158, gentle downward pan, electric blue #0a84ff edge glow, void #090c11, no invented UI widgets, no game effects
```

### 4.3 Shot C — Missão → Entrega (6s)
**Ref still:** `04-mission-ready.png` → `05-delivery.png`  
**Prompt EN:**
```
6 second simple motion, dark SaaS product UI, start on mission composer panel then soft cut or morph to single conversation with Entrega final card emphasized, blue #0a84ff send pulse then green #30d158 settle, void #090c11, minimal motion graphics only, realistic UI chrome, no fake brand, no action game camera
```

---

## Checklist de fidelidade
- [x] Grounding em README/AGENTS/docs/promo/changelog/git antes do copy
- [x] Features só com evidência: Fluxo 5/5, Yume GET-only, workflow/individual+juiz, 9Router 12 rotas, Admin tracking sem prompts
- [x] Medium correto: painel web SaaS dark (não jogo)
- [x] Marca/tagline do repo: LUCA-AI · “Sua missão. Uma equipe inteira.” · ABRA O LUCA-AI
- [x] Refs = capturas `promo/public/captures/*` + coruja/brand
- [ ] Mídia: **não gerada neste job** (texto only)
- [ ] Publicação: **não**

---

## WhatsApp (entrega)
**Título:** Roteiro LUCA-AI — missão → 5/5 → entrega  
**Path:** `C:/Projetos/_content-factory/scripts/ISO-LUCA-AI-roteiro.md`  
**Mirror:** `C:/Projetos/LUCA-AI/_afk-marketing/scripts/ISO-LUCA-AI-roteiro.md`  
**Hook:** “No chat genérico você escolhe modelo. No LUCA você escolhe quem pensa.” → Fluxo 5/5 → UMA MISSÃO ENTRA → UMA ENTREGA SAI.  
**Status:** draft_only · sem mídia · sem publish
