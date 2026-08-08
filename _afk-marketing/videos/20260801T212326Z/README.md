# Video shot pack — LUCA-AI · 20260801T212326Z

| Campo | Valor |
|-------|--------|
| Produto | LUCA-AI v0.2.0 |
| Queue index | 3 (não avançado) |
| Status | **draft_only** · keyframes OK · **sem mp4** |
| Shots | 5 × 6s (1 beat cada) |
| OUT | `C:/Projetos/_content-factory/videos/LUCA-AI/20260801T212326Z/` |
| Mirror | `C:/Projetos/LUCA-AI/_afk-marketing/videos/20260801T212326Z/` |
| Tagline | Sua missão. Uma equipe inteira. |
| Domínio | app.luca-ai.com.br |

## Entrega deste tick

1. **5 keyframes** Grok Imagine (`xai/grok-imagine-image` via 9Router) em `keyframes/shot-0N-keyframe.jpg` (+ cópias na raiz)
2. **Sem tool de vídeo** no runtime → `motion-prompts.md` + `shotlist.json` para copy-paste no **Grok Imagine Video**
3. Refs reais do repo em `refs/` + `provenance.md`
4. `concat.txt` template para quando os mp4 existirem

## Beats

| # | Beat | Aspect | Keyframe |
|---|------|--------|----------|
| 01 | HOOK caos de conversas | 16:9 | `keyframes/shot-01-keyframe.jpg` |
| 02 | PROOF expertise = persona | 9:16 | `keyframes/shot-02-keyframe.jpg` |
| 03 | VALUE Fluxo 5/5 | 16:9 | `keyframes/shot-03-keyframe.jpg` |
| 04 | REVEAL missão → entrega | 16:9 | `keyframes/shot-04-keyframe.jpg` |
| 05 | CLOSE tagline + coruja | 16:9 | `keyframes/shot-05-keyframe.jpg` |

## Limitações deste tick

- **img2img/edit** no 9Router: 404 conhecido — keyframes em **t2i** ancorados em fatos + refs reais em `refs/`.
- **Não há tool mp4** aqui — isto **não** é vídeo final de produto; é pack de keyframe + motion.
- NÃO publique. NÃO poste redes. Index da fila **não** foi avançado.

## Próximo passo humano

1. Abrir cada keyframe no Grok Imagine Video + colar prompt de `motion-prompts.md`
2. Salvar `shot-01.mp4`…`shot-05.mp4`
3. `ffmpeg -f concat -safe 0 -i concat.txt -c copy LUCA-AI-30s.mp4`
4. Opcional: cutaways de `refs/02-personas.png`, `refs/03-team-flow.png`, `refs/05-delivery.png`

## Paths WhatsApp

- Factory: `C:/Projetos/_content-factory/videos/LUCA-AI/20260801T212326Z/`
- Mirror: `C:/Projetos/LUCA-AI/_afk-marketing/videos/20260801T212326Z/`
- Roteiro: `C:/Projetos/_content-factory/scripts/ISO-LUCA-AI-roteiro.md`
- Stills: `C:/Projetos/_content-factory/stills/LUCA-AI/20260801-181522/`
