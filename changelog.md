# Changelog

## Unreleased — Etapa visual no modo equipe

### Novidades
- Workflow de equipe ganha sexta etapa `visual` (Especialista visual) após a exibição final.
- Pack de artefatos: relatório markdown, gráficos pie/tower e imagens via 9Router `/images/generations`.
- Persona Yume canônica `especialista-visual` documentada em `docs/yume-personas/` (criar na VM; LUCA só lê).
- Templates seed de equipe já preenchem o slot visual.

## v0.2.0 — Consolidação canônica (2026-08-05)

### Novidades
- Landing com metadata social, robots/sitemap, proof chips e CTAs mobile.
- Gates de release comercial: stage tarballs, deploy guard em main, version em `/api/health`.

### Melhorias
- Tokens visuais do produto nos badges, auth shell, accents e pie palette.
- CTAs de recuperação em Admin, Tools, Endpoints, Personas, Layout e estados vazios/erro do LUCA-AI.

### Correções
- Docs canônicos alinhados à produção Express na VM (borda via proxy, não Worker como runtime).
- install-vm falha fechado se a versão de health divergir.

### Sistemas
- Base canônica: produção VM (`codex/restore-current-luca`) + lanes aditivas (visual, bugs, contínuo, landing, ready-to-ship, docs).
