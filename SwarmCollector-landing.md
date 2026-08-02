# SwarmCollector-landing — LUCA-AI

Coletor do enxame `landing`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/landing` @ `2f4288c`
- Branch integração: `swarm/LUCA-AI/landing-integracao` @ `2f4288c` (criada localmente neste coletor)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor landing)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `bea1fc7` | `fix(landing): complete social metadata for share previews` | **aprovar** | Integrado em `landing-integracao` |
| `2f4288c` | `chore(enxame): fecha rodada landing no SwarmLedger` | **aprovar** | Ledger da rodada; sem código de produto extra |

## Diff em escopo
- `index.html` — title/description comerciais; canonical + OG/Twitter absolutos em `https://app.luca-ai.com.br/`; remove `og:image` relativo-only
- `server/landing-social-metadata.test.js` — source-lock 3 testes
- `SwarmLedger-landing.md` — claim fechado; Livre: hero proof, CTA mobile, manifest description, `site/` só com pedido

Fora de escopo (não tocado): `src/*`, `site/*`, `_afk-marketing/*`, visual/auth, docs, push/deploy.

## Validação
```
cd C:/Projetos/LUCA-AI-landing   # execução
node --test server/landing-social-metadata.test.js   # 3/3 pass
# após criar landing-integracao no checkout principal:
node --test server/landing-social-metadata.test.js   # 3/3 pass
test -f public/icon-512.png                          # asset OG existe
```
Conflitos: nenhum (branch linear sobre `b14f395`; sem segunda entrega concorrente).

## Decisão
**aprovar** e manter integração local em `swarm/LUCA-AI/landing-integracao`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Hero secondary proof / conversão além do owl (`LandingPage.tsx` se claim)
2. CTA mobile ≥44px se targets apertados
3. Alinhar `public/manifest.webmanifest` description ao title comercial (opcional)
4. `site/` só com claim disjunto e pedido do dono

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só este relatório)
- Sem reabrir metadata social já shipada
- Sem misturar contínuo/visual/docs/bugs
