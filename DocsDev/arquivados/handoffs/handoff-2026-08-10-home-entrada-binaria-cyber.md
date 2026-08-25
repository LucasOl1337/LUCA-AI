# Handoff — Home binária Individual/Equipe + arte cyber

**Data:** 2026-08-10  
**Repo:** `C:\Projetos\LUCA-AI`  
**Branch no fim da sessão (verificado):** `main` = `origin/main` (histórico local já avançou além do commit da home; ver commits recentes abaixo)

---

## 1. Objetivo central

Redesenhar a home do LUCA-AI para:

1. Induzir o usuário a escolher **Individual** ou **Equipe** logo no first fold.
2. Levar cada CTA direto à bancada real no modo certo.
3. Mostrar agentes/personas ao scrollar.
4. Substituir arte “coruja cartoon” por arte no estilo **cyber-owl** original.
5. Promover o protótipo aprovado para produção, commit e deploy na VM.

Pedido final do usuário: protótipo curtiu; única ressalva = ícones bobos → trocar arte → considerar aprovado → mandar para produção e commitar. Depois reclamou que as 4 corujas ficaram iguais e pediu variações.

---

## 2. Decisões

| Decisão | Detalhe |
|---|---|
| Layout vencedor | Variante **A** (escolha lado a lado) virou home de produção |
| Protótipo B/C | Removidos da UI de produção (não há mais switcher) |
| Handoff de modo | One-shot `sessionStorage` key `luca.lucaAi.entryMode` = `individual` \| `team` |
| Consumo | `LucaAiPage` lê e **remove** a key no hydrate da sessão; não usa localStorage |
| Arte | Retratos em `public/home/agent-{supervisor,planner,researcher,designer}.jpg` derivados de `public/cyber-owl.jpg` |
| Image gen | Preferido; **falhou** porque Hermes image_gen aponta para `127.0.0.1:20129` (morto). `:20128` sobe mas `/v1/images/generations` retornou 400 |
| Deploy | Manual extract na VM (não usar `install-vm.sh` full — ainda referencia tunnel legado `bombapvp-lab.yml`) |
| Escopo de commit | Só arquivos da home + handoff de modo em `LucaAiPage`; trabalho paralelo (anexos etc.) ficou de fora do commit da home |

---

## 3. O que foi implementado / alterado

### Home de produção

- `src/pages/LandingPage.tsx` — home real com:
  - Hero: “Como você quer chegar à resposta?”
  - Cards **Individual** / **Equipe** + CTAs `Usar modo individual` / `Usar modo equipe`
  - Seção de agentes (Supervisor, Planejador, Pesquisador, Designer)
  - Proof strip + status/recovery do runtime
- `src/home-page.css` — estilos da home A (produção)
- Removidos do fluxo de produção:
  - `src/pages/HomePrototype.tsx` (apagado)
  - `src/components/PrototypeSwitcher.tsx` (apagado)
  - `src/home-prototype.css` (apagado)
  - Gate `?prototype=home` em `main.tsx` / `App.tsx` (revertidos ao fluxo normal de auth)

### Handoff bancada

- `src/pages/LucaAiPage.tsx` (no commit da home):
  - `LUCA_AI_ENTRY_MODE_STORAGE_KEY = 'luca.lucaAi.entryMode'`
  - `consumeEntryMode()`
  - `setOperationMode(consumeEntryMode() || session.operationMode…)`

### Assets

- `public/home/agent-supervisor.jpg`
- `public/home/agent-planner.jpg`
- `public/home/agent-researcher.jpg`
- `public/home/agent-designer.jpg`

**Importante:** as 4 imagens foram geradas por crop/tratamento local do **mesmo** `cyber-owl.jpg` (crop + grade/contraste leves). Visualmente ficaram **quase clones** — o usuário reclamou explicitamente.

### Testes (source-lock)

- `server/home-entry.test.js` (novo)
- Atualizados:
  - `server/landing-hero-copy.test.js`
  - `server/landing-hero-proof.test.js`
  - `server/landing-mobile-cta.test.js`
  - `server/landing-system-status-cta.test.js`

### Commit da home

```
9ea8cd7 feat(home): entrada binária Individual/Equipe com arte cyber
```

Arquivos no commit (12):

- `public/home/agent-*.jpg` (4)
- `src/pages/LandingPage.tsx`
- `src/pages/LucaAiPage.tsx` (só handoff de modo, no momento do commit)
- `src/home-page.css`
- `server/home-entry.test.js`
- `server/landing-*.test.js` (4)

### Deploy VM (feito nesta sessão)

| Item | Valor |
|---|---|
| Host | `sennin@57.156.59.165` (`sennin-bridge`) |
| SSH key | `C:/Users/user/.ssh/oracle-9router` |
| Release dir | `/opt/sennin/luca-ai/releases/9ea8cd79b33b` |
| Symlink | `/opt/sennin/luca-ai/current` → release acima |
| Stage local | `C:/Users/user/AppData/Local/Temp/luca-deploy-9ea8cd79b33b42b9c06181f32157883d09b18701/` |
| Método | `source.tar` + `dist.tar` + `npm ci --omit=dev` + `systemctl restart luca-ai` |
| **Não** aplicado | `state.tar` (preserva workspaces/auth) |

Prova pública no momento do deploy (verificada então):

- `https://luca-ai.com.br/api/health` → `service:luca-ai`, `version:0.2.0`, header `X-Luca-Origin: vm`
- HTML assets: `index-BM1Q8w-2.js` + `index-Bor8PByP.css` (match local build do commit)
- `/home/agent-*.jpg` → HTTP 200

**Nota:** `main` local/remoto já tem commits **posteriores** a `9ea8cd7` (ex.: `1093212`, `970466f`, `0ad79f2`). A home pode ou não ser a ponta atual de produção — **revalidar** `readlink -f /opt/sennin/luca-ai/current` e assets públicos antes de assumir o que está live agora.

---

## 4. Pendências e próximos passos

### P0 — variações das corujas (pedido explícito do usuário, incompleto)

Usuário: *“ficaram todas corujas iguais… cria umas variações pelo menos”*.

**Status:** **não concluído**.  
Image gen falhou (`:20129` down). Script Pillow de variações fortes foi escrito em:

```
C:/Users/user/AppData/Local/Temp/make-owl-variants.py
```

…mas a execução (junto com inspeção de auth) **foi bloqueada por timeout/approval** e **não** chegou a sobrescrever os JPGs com certeza de sucesso.

**Próximo passo recomendado:**

1. Rodar `python C:/Users/user/AppData/Local/Temp/make-owl-variants.py` (ou reescrever com 4 identidades bem distintas).
2. Ideal: levantar image gen (9Router API porta **20129** ou apontar Hermes image_gen para endpoint que funcione) e regenerar 4 busts cyber com papéis distintos:
   - Supervisor: armadura densa + chevrons/core forte
   - Planejador: mapa de rotas/circuitos no peito
   - Pesquisador: lentes multi-anel + sensores
   - Designer: placas polidas + curvas elegantes
3. Commit só dos JPGs (e CSS se necessário).
4. Hot deploy: re-stage/re-copy `public/home/*` + restart **ou** release completo se o commit atual de produção já mudou.

### P1 — revalidar produção

```bash
ssh -i C:/Users/user/.ssh/oracle-9router sennin@57.156.59.165 \
  'readlink -f /opt/sennin/luca-ai/current; systemctl is-active luca-ai.service'
curl -sS https://luca-ai.com.br/api/health
curl -sS https://luca-ai.com.br/ | tr '"' '\n' | rg 'index-'
```

### P2 — opcional polish home

- Distinguir ainda mais os cards Individual vs Equipe (arte de fundo, não só avatares).
- Garantir que testes de landing continuem verdes se copy/markers mudarem de novo.

---

## 5. Bugs, riscos e pontos de atenção

| Item | Severidade | Notas |
|---|---|---|
| 4 agentes visualmente iguais | Alta (UX) | User feedback explícito; não shipar “como resolvido” sem novas artes |
| Image gen Hermes → `:20129` | Alta (tooling) | Conexão recusada; dashboard/API chat em `:20128` não substitui sem config correta |
| `install-vm.sh` full | Média | Ainda referencia `/etc/cloudflared/bombapvp-lab.yml`; produção real usa `cloudflared-luca-ai.service` + `luca-ai.yml` |
| Árvore compartilhada | Alta | Outras frentes mexem em `LucaAiPage`, agent-tools, attachments, deliberations. No commit da home, `LucaAiPage` foi **isolado** (só entryMode); working tree depois restaurou backup com anexos (`C:/Users/user/AppData/Local/Temp/LucaAiPage.working.tsx`) — **estado atual do arquivo pode ter divergido de novo** |
| Suíte global instável durante a sessão | Média | Falhas intermitentes em tests de outras frentes; testes **da home** passaram 12/12 no momento da promoção |
| Auth bypass de protótipo | Baixa (removido) | Existia só em DEV + `?prototype=home`; removido na promoção |
| Docs de skill | Info | Skill `luca-ai-runtime` tem `references/home-prototype-routing.md` (ainda fala em protótipo DEV). Home agora é produção; skill pode estar desatualizada |

---

## 6. Contexto essencial para o próximo agente

### Fluxo de modo

```
Landing CTA
  → sessionStorage.setItem('luca.lucaAi.entryMode', 'individual'|'team')
  → onNavigate('luca-ai')
LucaAiPage hydrate sessão
  → consumeEntryMode()  // get + remove
  → setOperationMode(entry || session.operationMode)
```

Não reintroduzir localStorage para isso (vaza entre sessões).

### Arquivos-chave

| Path | Papel |
|---|---|
| `src/pages/LandingPage.tsx` | Home produção |
| `src/home-page.css` | Layout home |
| `src/pages/LucaAiPage.tsx` | Consome entryMode |
| `public/home/agent-*.jpg` | Arte agentes (precisa variação) |
| `public/cyber-owl.jpg` | Referência de marca cyber |
| `server/home-entry.test.js` | Source-lock home + handoff |
| `server/landing-*.test.js` | Source-locks de copy/CTA/status |
| `deploy/stage-release.mjs` | Empacota release |
| `DocsDev/` | Docs humanas (esta pasta) |
| `docs/` | Docs de arquitetura/operação do produto (não mover) |

### Como provar local

```bash
# com backend ou mocks de API
npm run typecheck
node --test server/home-entry.test.js server/landing-hero-copy.test.js \
  server/landing-hero-proof.test.js server/landing-mobile-cta.test.js \
  server/landing-system-status-cta.test.js
npm run build
```

UI: abrir `/` autenticado → deve mostrar os dois modos, não a hero antiga “Abrir LUCA-AI / Ver personas” como único caminho.

### Deploy (receita que funcionou)

```bash
# local main
node deploy/stage-release.mjs --commit "$(git rev-parse HEAD)"
# scp source.tar + dist.tar para /tmp/luca-deploy-<short>/
# na VM:
#   extract em /opt/sennin/luca-ai/releases/<short>
#   npm ci --omit=dev --ignore-scripts
#   ln -sfn .../current
#   systemctl restart luca-ai
# NÃO extrair state.tar em hotfix
```

SSH: `export MSYS2_ARG_CONV_EXCL='*'` e IdentityFile `C:/Users/user/.ssh/oracle-9router`.

### Não fazer

- Não reintroduzir switcher A/B/C em produção.
- Não reativar bypass de auth em prod.
- Não deployar `state.tar` por cima de `/var/lib/luca-ai`.
- Não assumir que image_gen do Hermes funciona sem checar `:20129`.
- Não commitar trabalho paralelo alheio “de carona” no fix das artes.

---

## 7. Estado residual no working tree (fim desta sessão)

Verificado agora:

- `git status`: `main...origin/main` limpo de M tracked da home; só untracked `.scratch/luca-deploy-*`
- `public/home/*.jpg` existem
- `src/home-page.css` e `server/home-entry.test.js` existem
- protótipo `HomePrototype.tsx` **não** está mais no tree
- HEAD recente do repo já inclui commits posteriores à home (equipe/bancada/visual)

Antes de editar `LucaAiPage.tsx` de novo: **diff contra HEAD** e não reverter anexos/visual de frentes posteriores.

---

## 8. Checklist do próximo turno (curto)

1. [ ] Gerar 4 artes **claramente distintas** (image gen se `:20129` up; senão Pillow script).
2. [ ] Substituir `public/home/agent-*.jpg`.
3. [ ] Screenshot real da home (Brave/localhost ou prod).
4. [ ] Testes home + typecheck + build.
5. [ ] Commit só assets (+ paths se mudarem).
6. [ ] Deploy VM e provar `/home/agent-*.jpg` + HTML assets.
7. [ ] Atualizar skill `home-prototype-routing.md` se ainda falar em protótipo-only.

---

*Handoff baseado no que foi executado e verificado nesta sessão. Onde a ponta atual de produção divergiu por deploys posteriores, está marcado para revalidação.*
