# Changelog - LUCA-AI

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-05-31 (18-project Safe Sync Batch)

### Added
- `src/hooks/useTheme.tsx`: Complete LucaTheme "Cerrado" (Brazilian biome) — pergaminho/cream void, navy/forest greens, gold/sienna, fleet/alive accents, full semantic tokens (text, border, ok/error/warning, glows). Context + hook.
- `src/components/LucaOwl.tsx`: Iconic cyber owl (real /cyber-owl.jpg in circle) with ciano halo, dual SVG rotating ice rings (spiral-slow/reverse), ECG pulse overlay (gradient + alive state), breathe/spiral anims, stars.
- `src/pages/LandingPage.tsx`: New framer-motion landing with useTheme + useLuca (activeMission, supervisor, agents, db count, backendReady, heartbeat). Owl hero, status pills, mission/agent cards, gold accents, nav.
- `.claude/launch.json`: VSCode debug config (node server.js on 4242).
- COMPUTER_USE_SETUP.md + full goblin suite (ULTRA_MINIMAL_PASTE.txt, computer-use-goblin-helper*.js, PASTE_ME..., DO_THIS_NOW, QUICKSTART_GOBLIN): "Goblin no Paint" computer-use skill flow (fresh convo paste for drawing).
- grokassets/ full tree (visual-bible with cerrado/owl motifs, icons, logos, banners, prompts) — batch campaign.
- Tailwind + anim/font extensions matching theme (spiral etc).

### Changed
- **server/index.js + server/**: Agentic runtime updates (9router/GLM via router-client, Maestro model, PraisonAI, WS global chat/heartbeat, config for AGENTS/aliases/ROUTER_MODEL/MAESTRO_MODEL, conversation partners, closure).
- `tailwind.config.js` + postcss/vite: Cerrado color palette + fonts (Jost display, JP) + spiral animations.
- Existing components/Layout/pages: Adopt new theme tokens (no more hard-coded; e.g. gold/fleet/alive).
- Docs: Agentes/, DevDocs, KAMUI_INTEGRATION, PraisonAI-REPORT updated implicitly via server.
- package + dist/public: TS/React deps + built assets for new UI.
- heartbeat-report.json + monitor.py: Continued from prior.

### Technical Notes
- **Branch:** main
- **Pre-commit state:** 18 uncommitted (server, owl, theme hook, landing, tailwind, .claude, COMPUTER_USE_*, grokassets + related) after "2026-05-29+dirty safe commit" (b6f8007...).
- **Divergence:** 0 ahead / 0 behind at HEAD. Dirty WD + artifacts. FETCH shows extra remote branches (master, v2-cyberpunk-rural).
- **Multi-agent parallel:** See patchnotes.md "Multi-Agent Parallel Work Reconciliation" — specific theme/owl/landing + computer-use goblin + server edits. grokassets cross-project (shared pattern with ChessCam, Kamui, Sennin, simple-ai). Reconciled cleanly with prior migration + dirty safes. No hard conflicts in batch.
- LUCA = advanced agentic (PraisonAI + computer-use goblins + heartbeat + 9router/Maestro) now with beautiful natural Cerrado visual identity + landing.
- Source + config + helpers only.

## [b6f80072] - 2026-05-29
### 2026-05-29+dirty safe commit

---

## [6c104132] - 2026-05-29
### 2026-05-29 dirty safe commit

---

## [b359e591] - (clone baseline)
### Initial clone from https://github.com/LucasOl1337/LUCA-AI.git

(Full prior entries: PraisonAI integration, heartbeat monitor, computer-use goblin v1/v2, KAMUI_INTEGRATION, design.md, Agentes/ etc. See git log or previous changelog state.)

See accompanying patchnotes.md for detailed agent file impacts and batch synthesis.

---
*Updated 2026-05-31 for safe sync batch (LUCA + ChessCam + Kamui + Sennin + simple-ai focus).*
*Rich Multi-Agent section in patchnotes.md.*