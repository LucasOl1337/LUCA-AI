# FAILED image_generate (img2img) — 20260801-170222

## Error

Provider 9Router returned **404 HTML** for model `xai/grok-imagine-image-quality` when `image_url` (local path) was set — all 4 img2img calls failed.

Text-to-image (`xai/grok-imagine-image` without image_url) worked.

## Fallback applied

1. Repo-faithful portrait crops (1080×1920) from real captures + text overlay via Pillow → primary `cover.png` + `keyframes/kf-*.png`
2. Text-to-image Grok stills constrained to proven facts → `cover-grok.png` + `*-grok.png` as alt
3. No video tool available → `motion-prompts.md` instead of `shots/*.mp4`

## Copy-paste prompts (retry when img2img route fixed)

### cover (image_url=refs/00-pain.png)
Vertical 9:16 TikTok cover polish of this real LUCA-AI product UI. Keep exact product interface. Void #090c11, blue #0a84ff #64d2ff. Title "UMA MISSÃO" / "cinco conversas · nenhuma conclusão". No invented HUD.

### kf-personas (image_url=refs/capture-personas.png)
Vertical 9:16 polish of real Personas catalog. Overlay "ESCOLHA QUEM PENSA" / "Personas reais. Especialidades claras."

### kf-flow (image_url=refs/capture-team-flow.png)
Vertical 9:16 polish of real Fluxo de personas 5 steps. Overlay "CADA ETAPA TEM DONO" / "5/5. Pronto para executar." Green #30d158.

### kf-delivery (image_url=refs/capture-delivery.png)
Vertical 9:16 polish of real delivery screen. Overlay "UMA MISSÃO ENTRA" → "UMA ENTREGA SAI".
