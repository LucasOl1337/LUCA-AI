# v0.2.0 — Consolidação canônica

![v0.2.0](https://github.com/LucasOl1337/LUCA-AI/releases/download/v0.2.0/v0.2.0-card.png)

## Novidades
- Landing comercial com metadata social, `robots.txt`/`sitemap.xml`, proof chips e CTAs mobile full-width.
- Pipeline de stage comercial (`deploy/stage-release.mjs`) com guard de branch `main`.

## Melhorias
- Tokens de produto (`--l-*`) em auth, badges, term-lines, accents e pie palette.
- CTAs de retry/reconnect/focus-mission nos estados de erro e vazio do painel.

## Correções
- Documentação canônica deixa de tratar Cloudflare Worker como runtime de produção.
- `/api/health` e preflight expõem/exigem versão do pacote; install-vm valida drift.

## Sistemas
- Runtime de produção: Express na VM + proxy de borda.
- Gates: `npm test`, `npm run typecheck`, `npm run build`.
