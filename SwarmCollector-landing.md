# SwarmCollector-landing — LUCA-AI

Coletor do enxame `landing`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/landing` @ `d44850c`
- Branch integração: `swarm/LUCA-AI/landing-integracao` @ tip atual (produto até `7c3fb45`; ledger `7f99b07`; relatório coletor no tip)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02T13:57Z (AFK cron NX coletor landing)

## Fila revisada

| Commit exec | Integração | Mensagem | Classificação | Ação |
|---|---|---|---|---|
| `bea1fc7` | `bea1fc7` | `fix(landing): complete social metadata for share previews` | **aprovar** | Já em integração (coletor anterior) |
| `2f4288c` | `2f4288c` | `chore(enxame): fecha rodada landing no SwarmLedger` | **aprovar** | Já em integração |
| `6ab1705` | `19fb313` | `fix(landing): hero secondary proof chips for conversion` | **aprovar** | Já em integração (coletor anterior) |
| `1818359` | `dbd6ab2` | `chore(enxame): fecha rodada landing no SwarmLedger` | **aprovar** | Já em integração |
| `43bc3de` | `feefe13` | `fix(landing): align webmanifest name/description to commercial share copy` | **aprovar** | Cherry-pick limpo |
| `de9a8bb` | `2db0556` | `fix(landing): stack full-width mobile hero CTAs under 560px` | **aprovar** | Cherry-pick limpo |
| `d14e3d0` | `1e61f54` | `fix(landing): hero lead names live runtime status` | **aprovar** | Cherry-pick limpo |
| `df26858` | `7c3fb45` | `fix(landing): ship robots.txt and sitemap for public discovery` | **aprovar** | Cherry-pick limpo |
| `c4c1b0c`/`51c915d`/`eb74cba`/`d44850c` + claims | `7f99b07` | ledger closes / claims | **aprovar** | Espelho seletivo do ledger de execução (sem double `## Concluído`) |

## Diff em escopo (rodadas novas nesta coleta)
- `public/manifest.webmanifest` — `name`/`description` alinhados ao share comercial do `index.html`
- `src/index.css` — stack full-width CTAs ≤560px com `min-height: var(--l-touch)`
- `src/pages/LandingPage.tsx` — lead do hero nomeia runtime ao vivo (além de personas/missão)
- `public/robots.txt` + `public/sitemap.xml` — Allow:/ + Sitemap absoluto; home `https://app.luca-ai.com.br/`
- locks: `landing-manifest-metadata` · `landing-mobile-cta` · `landing-hero-copy` · `landing-robots-sitemap`
- `SwarmLedger-landing.md` — Livre atualizado; Em andamento vazio; Concluído com 6 rodadas

Já shipado e revalidado: social metadata + hero proof chips.

Fora de escopo (não tocado): `site/*`, `_afk-marketing/*`, visual/auth, docs, bugs, contínuo, ready-to-ship, push/deploy.

## Validação
```
git checkout swarm/LUCA-AI/landing-integracao
git cherry-pick 43bc3de de9a8bb d14e3d0 df26858   # → feefe13 2db0556 1e61f54 7c3fb45
git checkout swarm/LUCA-AI/landing -- SwarmLedger-landing.md
node --test server/landing-robots-sitemap.test.js \
  server/landing-social-metadata.test.js \
  server/landing-manifest-metadata.test.js \
  server/landing-hero-copy.test.js \
  server/landing-hero-proof.test.js \
  server/landing-mobile-cta.test.js   # 17/17 pass
git diff swarm/LUCA-AI/landing -- public/robots.txt public/sitemap.xml \
  public/manifest.webmanifest src/index.css src/pages/LandingPage.tsx \
  server/landing-*.test.js index.html   # vazio
rg -n "^## " SwarmLedger-landing.md   # Livre + Em andamento + Concluído (únicos)
```
Conflitos: nenhum nos product commits. Ledger close via multi cherry-pick `--no-commit` gerou `## Concluído` duplicado → descartado; espelho do tip de execução em commit `7f99b07`.

## Decisão
**aprovar** webmanifest + mobile CTA + hero lead + robots/sitemap + ledger.  
Integração local em `swarm/LUCA-AI/landing-integracao` (produto `7c3fb45` + ledger `7f99b07` + relatório coletor).  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. `site/` só com claim disjunto e pedido do dono
2. residual microcopy **somente** se proof de runtime/personas regredir
3. **NÃO** reabrir social meta, webmanifest, hero chips, mobile CTA stack, hero lead runtime, robots/sitemap

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só product paths + ledger + este relatório; `_afk-marketing/` intocado)
- Sem reabrir social/hero proof já shipados
- Sem misturar contínuo/visual/docs/bugs/ready-to-ship
- Sem double `## Concluído` no ledger de integração
