# SwarmLedger-landing — LUCA-AI

Ledger do enxame `swarm/LUCA-AI/landing`. Uma entrega de valor por sessão. Sem push/PR/deploy.

## Livre
- `site/` marketing paralelo (só se claim disjunto e dono pedir)
- residual microcopy só se proof de runtime/personas regredir
- NÃO reabrir social meta, webmanifest, hero chips, mobile CTA stack, hero lead runtime, robots/sitemap

## Em andamento
_(nenhum — sessão fechou)_

## Concluído
### 2026-08-02T13:14:50Z — NX-LUCA-AI-landing
- Área: SEO / descoberta pública (robots + sitemap)
- Escopo: `public/robots.txt`, `public/sitemap.xml`, `server/landing-robots-sitemap.test.js`, `SwarmLedger-landing.md`
- Base: `eb74cba` → HEAD: `df26858`
- Evidência: `node --test server/landing-robots-sitemap.test.js server/landing-social-metadata.test.js server/landing-manifest-metadata.test.js server/landing-hero-copy.test.js server/landing-hero-proof.test.js server/landing-mobile-cta.test.js` → 17/17 pass
- Resultado: `robots.txt` Allow:/ + Sitemap absoluto; `sitemap.xml` com home `https://app.luca-ai.com.br/`; crawlers deixam de achar zero discovery files no shell público
- NÃO push / deploy / PR
### 2026-08-02T12:34:52Z — NX-LUCA-AI-landing
- Área: hero / copy residual de conversão
- Escopo: `src/pages/LandingPage.tsx`, `server/landing-hero-copy.test.js`, `SwarmLedger-landing.md`
- Base: `2b9a540` → HEAD: `d14e3d0`
- Evidência: `node --test server/landing-hero-copy.test.js server/landing-hero-proof.test.js server/landing-mobile-cta.test.js server/landing-social-metadata.test.js server/landing-manifest-metadata.test.js` → 14/14 pass; numstat page 1/1 + test 33/0 (sem flip EOL)
- Resultado: lead do hero passa a nomear status do runtime ao vivo, alinhado ao chip `runtime` e à proof strip (fim da copy residual personas-only)
- NÃO push / deploy / PR
### 2026-08-02T10:50:42Z — NX-LUCA-AI-landing
- Área: responsivo / CTA mobile de conversão
- Escopo: `src/index.css`, `server/landing-mobile-cta.test.js`, `SwarmLedger-landing.md`
- Base: `642802b` → HEAD: `de9a8bb`
- Evidência: `node --test server/landing-mobile-cta.test.js server/landing-hero-proof.test.js server/landing-social-metadata.test.js server/landing-manifest-metadata.test.js` → 12/12 pass; numstat css 16/0 (sem flip EOL)
- Resultado: sob ≤560px a row `data-landing-cta-row` empilha CTAs full-width com `min-height: var(--l-touch)` (44px); desktop wrap preservado
- NÃO push / deploy / PR
### 2026-08-02T10:35:07Z — NX-LUCA-AI-landing
- Área: SEO / install shell commercial metadata
- Escopo: `public/manifest.webmanifest`, `server/landing-manifest-metadata.test.js`, `SwarmLedger-landing.md`
- Base: `1818359` → HEAD: `43bc3de`
- Evidência: `node --test server/landing-manifest-metadata.test.js server/landing-social-metadata.test.js server/landing-hero-proof.test.js` → 9/9 pass; numstat manifest 2/2 (sem flip EOL)
- Resultado: `name`/`description` do webmanifest alinhados ao title/description comerciais do `index.html` (fim do nome interno curto e description genérica no install shell)
- NÃO push / deploy / PR
### 2026-08-02T07:58:44Z — NX-LUCA-AI-landing
- Área: hero / prova visual de conversão
- Escopo: `src/pages/LandingPage.tsx`, `src/index.css`, `server/landing-hero-proof.test.js`, `SwarmLedger-landing.md`
- Base: `2f4288c` → HEAD: `6ab1705`
- Evidência: `node --test server/landing-hero-proof.test.js server/landing-social-metadata.test.js` → 6/6 pass; numstat page 18/2, css 21/0 (sem flip EOL)
- Resultado: strip `data-landing-proof` com 3 chips (personas / missão / runtime) + markers CTA; CSS com tokens `--l-text-soft` / `--l-gold-*` (sem hex ad-hoc)
- NÃO push / deploy / PR

### 2026-08-02T05:50:00Z — NX-LUCA-AI-landing
- Área: SEO / social share no shell público
- Escopo: `index.html`, `server/landing-social-metadata.test.js`, `SwarmLedger-landing.md`
- Base: `b14f395` → HEAD: `bea1fc7`
- Evidência: `node --test server/landing-social-metadata.test.js` → 3/3 pass; `git diff --numstat` index.html 23/3 (sem flip EOL)
- Resultado: title/description comerciais; canonical + og:type/locale/site_name/url/title/description/image absolutos; twitter:card/title/description/image; ban de `og:image` relativo-only
- NÃO push / deploy / PR
