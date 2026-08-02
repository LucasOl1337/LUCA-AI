# SwarmLedger-landing — LUCA-AI

Ledger do enxame `swarm/LUCA-AI/landing`. Uma entrega de valor por sessão. Sem push/PR/deploy.

## Livre
- Hero secondary proof / visual de conversão além do owl
- CTA mobile (≥44px) se targets ficarem apertados
- Copy hero alinhada a proof de runtime/personas
- `site/` marketing paralelo (só se claim disjunto e dono pedir)
- Alinhar `public/manifest.webmanifest` description ao title comercial (opcional)

## Em andamento
_(nenhum — sessão fechou)_

## Concluído
### 2026-08-02T05:50:00Z — NX-LUCA-AI-landing
- Área: SEO / social share no shell público
- Escopo: `index.html`, `server/landing-social-metadata.test.js`, `SwarmLedger-landing.md`
- Base: `b14f395` → HEAD: `bea1fc7`
- Evidência: `node --test server/landing-social-metadata.test.js` → 3/3 pass; `git diff --numstat` index.html 23/3 (sem flip EOL)
- Resultado: title/description comerciais; canonical + og:type/locale/site_name/url/title/description/image absolutos; twitter:card/title/description/image; ban de `og:image` relativo-only
- NÃO push / deploy / PR
