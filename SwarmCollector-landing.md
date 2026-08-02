# SwarmCollector-landing — LUCA-AI

Coletor do enxame `landing`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/landing` @ `1818359`
- Branch integração: `swarm/LUCA-AI/landing-integracao` @ `dbd6ab2` (cherry-pick local dos commits de execução)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor landing — 2ª passagem)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `bea1fc7` | `fix(landing): complete social metadata for share previews` | **aprovar** | Já em `landing-integracao` (coletor anterior) |
| `2f4288c` | `chore(enxame): fecha rodada landing no SwarmLedger` | **aprovar** | Já em `landing-integracao` |
| `6ab1705` → `19fb313` | `fix(landing): hero secondary proof chips for conversion` | **aprovar** | Cherry-pick limpo em integração |
| `1818359` → `dbd6ab2` | `chore(enxame): fecha rodada landing no SwarmLedger` | **aprovar** | Ledger da rodada hero proof |

## Diff em escopo (rodada nova)
- `src/pages/LandingPage.tsx` — strip `data-landing-proof` com 3 chips (personas / missão / runtime) + markers CTA `data-landing-cta`
- `src/index.css` — `.landing-hero-proof*` com tokens `--l-text-soft` / `--l-gold-*` (sem hex ad-hoc no bloco)
- `server/landing-hero-proof.test.js` — source-lock 3 testes
- `SwarmLedger-landing.md` — claim fechado; Livre: CTA mobile ≥44px, copy hero, manifest description, `site/` só com pedido

Já shipado e revalidado: `index.html` social metadata + `server/landing-social-metadata.test.js`.

Fora de escopo (não tocado): `site/*`, `_afk-marketing/*`, visual/auth, docs, bugs, contínuo, push/deploy.

## Validação
```
git checkout swarm/LUCA-AI/landing-integracao
git cherry-pick 6ab1705 1818359   # → 19fb313 + dbd6ab2
node --test server/landing-hero-proof.test.js server/landing-social-metadata.test.js   # 6/6 pass
test -f public/icon-512.png
git diff swarm/LUCA-AI/landing..landing-integracao -- product paths   # vazio (só SwarmCollector diverge)
```
Conflitos: nenhum (linear sobre `9e46a4f`; cherry-pick limpo).

## Decisão
**aprovar** hero proof + ledger; integração local em `swarm/LUCA-AI/landing-integracao` @ `dbd6ab2`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. CTA mobile ≥44px se targets ficarem apertados
2. Copy hero alinhada a proof de runtime/personas (refino, não reabrir chips)
3. Alinhar `public/manifest.webmanifest` description ao title comercial (opcional)
4. `site/` só com claim disjunto e pedido do dono

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só este relatório + cherry-picks seletivos)
- Sem reabrir metadata social nem hero proof já shipados
- Sem misturar contínuo/visual/docs/bugs
