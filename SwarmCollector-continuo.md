# SwarmCollector-continuo — LUCA-AI

Coletor do enxame `contínuo`. Só este assunto. Sem push/PR/deploy/main.

## Estado
- Branch execução: `swarm/LUCA-AI/enxame-continuo` @ `2d79def` (worktree `C:/Projetos/LUCA-AI-enxame`)
- Branch integração: `swarm/LUCA-AI/continuo-integracao` @ `4144334` (local)
- Base produto: `codex/restore-current-luca` / `b14f395`
- Coleta: 2026-08-02 (AFK cron NX coletor contínuo — rodada Personas)

## Fila revisada

| Commit | Mensagem | Classificação | Ação |
|---|---|---|---|
| `90ce39d` | `fix(ux): Endpoints error state gets retry CTA` | **aprovar** | Já em `continuo-integracao` (coleta anterior) |
| `7809284` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger Endpoints |
| `158adde` | `fix(ux): Admin error state gets retry CTA` | **aprovar** | Já em `continuo-integracao` (coleta anterior) |
| `499227d` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger Admin |
| `5dd45f3` → `f195d74` | `fix(ux): Personas Yume error/empty gain recovery CTAs` | **aprovar** | Cherry-pick limpo nesta coleta |
| `2d79def` → `4144334` | `chore(enxame): fecha rodada no EnxameTalk` | **aprovar** | Ledger Personas; sem produto extra |

## Diff em escopo (tip integração)
- `src/pages/EndpointsPage.tsx` — falha de `/api/catalog/endpoints` → `role=alert` + `data-endpoints-error` + `data-tone=error` + CTA `data-endpoints-retry` (`reloadKey`)
- `server/endpoints-error-cta.test.js` — source-lock Endpoints
- `src/pages/AdminPage.tsx` — falha overview/users → `data-admin-error` + CTA `data-admin-retry` → `load(search)`
- `src/index.css` — bloco `.admin-state[data-admin-error]` (tokens `--l-error` / `--l-text-*`)
- `server/admin-error-cta.test.js` — source-lock Admin error
- `src/pages/PersonasPage.tsx` — Yume fail → `data-personas-error` + `data-personas-retry` (“Tentar novamente” → `load()`); empty filtrado/zero → `data-personas-empty` + dual CTA clear/open-Yume + reload
- `server/personas-recovery-cta.test.js` — source-lock Personas error+empty (2 testes)
- `EnxameTalk.md` — claims fechados; Livre: Tools empty se rota voltar; Histórico/GlobalChat órfãos; NÃO reabrir Personas/Admin/Endpoints recovery

Fora de escopo (não tocado): `ToolsPage` (bugs), auth CSS / StatePill / agent accents (visual), `index.html` (landing), release health/install-vm (ready-to-ship), docs, `_afk-marketing/*`, push/deploy.

## Validação
```
# execução (worktree)
cd C:/Projetos/LUCA-AI-enxame
node --test server/personas-recovery-cta.test.js \
  server/endpoints-error-cta.test.js server/admin-error-cta.test.js   # 6/6 pass

# integração
git checkout swarm/LUCA-AI/continuo-integracao
git cherry-pick 5dd45f3 2d79def   # → f195d74 + 4144334
node --test server/personas-recovery-cta.test.js \
  server/endpoints-error-cta.test.js server/admin-error-cta.test.js   # 6/6 pass
node --check server/personas-recovery-cta.test.js \
  server/endpoints-error-cta.test.js server/admin-error-cta.test.js
git diff --numstat b14f395..HEAD -- \
  src/pages/PersonasPage.tsx src/pages/EndpointsPage.tsx src/pages/AdminPage.tsx \
  src/index.css server/personas-recovery-cta.test.js \
  server/endpoints-error-cta.test.js server/admin-error-cta.test.js EnxameTalk.md
# Personas 92/7 · Endpoints 36/3 · Admin 19/2 · index.css 33/0 ·
# personas-test 41/0 · endpoints-test 28/0 · admin-test 28/0 · EnxameTalk 38/0
```
PersonasPage CRLF preservado. Rota `personas` ativa em `App.tsx` (`ACTIVE_PAGES`). Conflitos: nenhum (linear; paths disjuntos de bugs/visual/landing).

## Decisão
**aprovar** Personas recovery + manter Endpoints/Admin já aprovados.  
Integração local: `swarm/LUCA-AI/continuo-integracao` @ `4144334`.  
Main / `codex/restore-current-luca` **não** atualizados. Precisa humano só para merge futuro na base comercial.

## Próximo livre (executor)
1. Tools empty “Nenhuma ferramenta disponível” **somente se** a rota Tools voltar ao `App.tsx` (hoje fora do grafo; bugs já shipou Tools error + Admin empty)
2. Histórico / GlobalChat empty — **órfãos**; só se rotas retornarem
3. NÃO reabrir: Personas recovery, Admin/Endpoints error CTA, Admin empty (bugs `05bb20b`)

## Anti-padrões evitados
- Sem merge/push/PR/deploy
- Sem `git add -A` (só relatório + cherry-picks seletivos; dirty `_afk-marketing/` intocado)
- Sem reabrir Endpoints/Admin error já shipados
- Sem misturar bugs/visual/landing/docs/ready-to-ship
- Sem worktree extra; só branch de integração local
- Sem classificar órfãos como bloqueio — Personas é rota viva, por isso aprovada
