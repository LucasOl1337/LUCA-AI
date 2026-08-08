# Provenance — LUCA-AI SEO draft

Produto: LUCA-AI  
Queue index: 3  
PATH: C:/Projetos/LUCA-AI  
MIRROR: C:/Projetos/LUCA-AI/_afk-marketing  
BRAND: C:/Projetos/LUCA-AI/brand  
PROMO: C:/Projetos/LUCA-AI/promo  
Ângulo: fluxo de personas + missão coordenada (multi-agent com papéis explícitos)

## Arquivos lidos (absolutos)

- C:/Projetos/_content-factory/state/queue.json
- C:/Projetos/LUCA-AI/README.md
- C:/Projetos/LUCA-AI/AGENTS.md
- C:/Projetos/LUCA-AI/INDEX.md
- C:/Projetos/LUCA-AI/changelog.md
- C:/Projetos/LUCA-AI/patchnotes.md
- C:/Projetos/LUCA-AI/package.json
- C:/Projetos/LUCA-AI/docs/arquitetura.md
- C:/Projetos/LUCA-AI/docs/integracoes.md
- C:/Projetos/LUCA-AI/promo/roteiro.md
- C:/Projetos/LUCA-AI/promo/README.md
- git -C C:/Projetos/LUCA-AI log --oneline -15

## Refs visuais copiadas para OUT/refs/

- C:/Projetos/LUCA-AI/promo/public/captures/01-home.png
- C:/Projetos/LUCA-AI/promo/public/captures/02-personas.png
- C:/Projetos/LUCA-AI/promo/public/captures/03-team-flow.png
- C:/Projetos/LUCA-AI/promo/public/captures/04-mission-ready.png
- C:/Projetos/LUCA-AI/promo/public/captures/05-delivery.png
- C:/Projetos/LUCA-AI/promo/public/brand/icon-512.png
- C:/Projetos/LUCA-AI/promo/public/brand/cyber-owl.jpg

## Fatos extraídos (somente repo)

1. LUCA-AI é painel para criar, acompanhar e revisar missões executadas por agentes de IA (README.md).
2. Produção: interface React + runtime Express na VM; integra 9Router, Kamui e Yume na mesma máquina (README.md, docs/arquitetura.md).
3. Domínio/app: `app.luca-ai.com.br`; proxy Cloudflare + Tunnel da VM; PC de dev não entra no tráfego de produção (AGENTS.md, docs/arquitetura.md).
4. Stack: React, TypeScript, Vite, Tailwind CSS, Express, WebSocket, Node Test Runner, Cloudflare Workers/Tunnel (README.md, package.json v0.2.0 `luca-ai-heartbeat`).
5. Fluxo de personas (5/5): Supervisor, Decisor da missão, Executores, Aprovação, Exibição final (promo/roteiro.md; capturas 03-team-flow).
6. Personas vêm do Yume via Kamui GET somente (`server/kamui-client.js` documentado em docs/integracoes.md); LUCA não escreve no Yume (AGENTS.md).
7. `POST /api/luca-ai/persona-team/run` tem modos `workflow` (encadeia papéis) e `individual` (1–5 personas + juiz separado) (docs/integracoes.md).
8. Tagline de produto no comercial: “Sua missão. Uma equipe inteira.”; cores void `#090c11`, ação `#0a84ff`, realce `#64d2ff`, vivo `#30d158` (promo/roteiro.md).
9. Git recente: promo Remotion 42s, migração produção→VM, contas/admin, tracking de uso, API same-origin, marca LUCA, publicação 9Router (changelog.md / git log).
10. Repo público: https://github.com/LucasOl1337/LUCA-AI

## Nota de imagem

9Router img2img/edits retorna 404 nesta máquina — sem retry de edit. Imagens geradas por text-to-image groundeado nas capturas reais (descrição de UI/cores/papéis do fluxo 5/5), não fantasia genérica de “AI team dashboard”.
