## Em andamento
_(nenhum — sessão fechou)_

## Concluído
### 2026-08-02T14:19:59Z — NX-LUCA-ready-to-ship
- Área: stage-release Windows tar paths
- Escopo: `deploy/stage-release.mjs`, `server/stage-release.test.js`
- Base: `97f29a1d98f9a892c930a1d72211c5cee943690b` → HEAD: `171dad5d8c2486a1ddfa3b0a2213b1906e6c662d`
- Entrega: `tar --force-local` no `STAGE_RELEASE_V1` (GNU tar no Windows trata `C:` como host remoto).
- Evidência: write smoke com fixture `dist/index.html` + `ALLOW_NON_MAIN_DEPLOY=1` → source/dist/state tarballs; suite stage 4 pass; suite RTS 18 pass após re-run.
- Risco: baixo — só flag de tar local; comportamento Linux inalterado.

### 2026-08-02T14:18:23Z — NX-LUCA-ready-to-ship
- Área: stage de packaging comercial com deploy guard
- Escopo: `deploy/stage-release.mjs`, `server/stage-release.test.js`, `package.json`
- Base: `a7bc434221212dadad15f15707df5cf5f876a6ad` → HEAD: `97f29a1d98f9a892c930a1d72211c5cee943690b`
- Entrega: `STAGE_RELEASE_V1` em `deploy/stage-release.mjs` chama `assertProductionDeployAllowed` antes de montar `source.tar`/`dist.tar`/`state.tar` para `install-vm.sh`; dry-run aberto off-main; scripts npm `stage:release` / `deploy:stage`.
- Evidência: `node --test server/stage-release.test.js server/deploy-branch-guard.test.js server/install-vm-health-gate.test.js server/release-metadata.test.js server/worker-health-version.test.js server/preflight-health-version.test.js` (18 pass); CLI dry-run ok + write bloqueado off-main.
- Risco: baixo — packaging local; não altera Express/install-vm/preflight. Write real exige `main` ou `ALLOW_NON_MAIN_DEPLOY=1`; `dist/` precisa existir ou build roda.

### 2026-08-02T12:44:34Z — NX-LUCA-ready-to-ship
- Área: guard de deploy/branch (main-only)
- Escopo: `deploy/assert-production-deploy.mjs`, `server/deploy-branch-guard.test.js`, `package.json`
- Base: `d279ea95002efc7f9ad1b04880de20a45e868a6d` → HEAD: `65f2f7a50ced4796ee046b52c1306addf33e8419`
- Entrega: `DEPLOY_MAIN_ONLY_V1` em `deploy/assert-production-deploy.mjs` bloqueia deploy comercial fora de `main` salvo `ALLOW_NON_MAIN_DEPLOY=1`; dry-run (`DEPLOY_DRY_RUN=1`) permanece aberto; scripts npm `deploy:guard` / `deploy:check`.
- Evidência: `node --test server/deploy-branch-guard.test.js server/install-vm-health-gate.test.js server/release-metadata.test.js server/worker-health-version.test.js server/preflight-health-version.test.js` (14 pass).
- Risco: baixo — só gate de pré-deploy; não altera Express/install-vm/preflight. Operador precisa chamar `npm run deploy:guard` antes de packaging/wrangler.

### 2026-08-02T11:11:28Z — NX-LUCA-ready-to-ship
- Área: worker cloud /api/health version + preflight always-require version
- Escopo: `shared/release-version.js`, `shared/preflight.js`, `worker/src/index.js`, `server/preflight.test.js`, `server/worker-health-version.test.js`
- Base: `af8bf71391ca5ed1ac0901030ac4cc10a3a0610f` → HEAD: `9fbca68e52ca59f37260a29f7761bc91ac1c1d23`
- Entrega: cloud `/api/health` e probe do `runCloudPreflight` passam a expor `version: RELEASE_VERSION` (`WORKER_HEALTH_VERSION_V1`); `shared/release-version.js` trava sync com `package.json`; preflight exige version mesmo com `detail` custom (`PREFLIGHT_HEALTH_VERSION_ALWAYS_V1`) — fecha bypass do preflight cloud.
- Evidência: `node --test server/preflight.test.js server/preflight-health-version.test.js server/worker-health-version.test.js server/release-metadata.test.js server/install-vm-health-gate.test.js` (12 pass).
- Risco: baixo — worker legado + preflight; Express health/install-vm intactos. Bump de version exige atualizar `shared/release-version.js` junto (lock falha se drift).

### 2026-08-02T11:06:37Z — NX-LUCA-ready-to-ship
- Área: preflight exige version no /api/health
- Escopo: `shared/preflight.js`, `server/preflight.test.js`, `server/preflight-health-version.test.js`
- Base: `c916295` → HEAD: `0dbb43f15aaa38f3d95df632171ced91f7b2c9e8`
- Entrega: `runOperationalPreflight` falha se GET `/api/health` não trouxer `version` string não-vazia (marker `PREFLIGHT_HEALTH_VERSION_V1`); detail inclui `v{version}` no caminho verde.
- Evidência: `node --test server/preflight.test.js server/preflight-health-version.test.js server/release-metadata.test.js server/install-vm-health-gate.test.js` (8 pass).
- Risco: baixo — só gate de preflight; health Express já expõe `PACKAGE_VERSION`; probes legados sem version passam a bloquear missão viva.

### 2026-08-02T08:09:58Z — NX-LUCA-ready-to-ship
- Área: install VM post-deploy health/version gate
- Escopo: `deploy/install-vm.sh`, `server/install-vm-health-gate.test.js`
- Base: `052c991` → HEAD: `6ba3f18a4a92bd7684d3888ca10f9d8115f993ba`
- Entrega: `install-vm.sh` passa a falhar se `/api/health` não responder `ok`/`service=luca-ai` ou se `version` ≠ `package.json` (marker `INSTALL_VM_HEALTH_GATE_V1`); imprime `HEALTH_VERSION`.
- Evidência: `node --test server/install-vm-health-gate.test.js server/release-metadata.test.js` (4 pass).
- Risco: baixo — só gate pós-restart no install; não altera runtime Express.

### 2026-08-02T06:02:16Z — NX-LUCA-ready-to-ship
- Área: release metadata / health version single-source
- Escopo: `server/config.js`, `server/index.js`, `server/release-metadata.test.js`
- Base: `b14f39552ae8ab82959c28073aa5958651d7fabf` → HEAD: `e5fa97d111f1a99d1873236a093bd50950bd73c8`
- Entrega: `/api/health` passa a expor `version` lida de `package.json` via `PACKAGE_VERSION` / `readProjectVersion()` (sem hardcode).
- Evidência: `node --check server/config.js server/index.js`; `node --test server/release-metadata.test.js` (2 pass).
- Risco: baixo — só campo novo no health; preflight existente não exige o campo.

## Livre
- Docs/operacao que citem o campo `version` no preflight/worker health (opcional; docs swarm)
- Ao bump de `package.json`, atualizar `shared/release-version.js` (lock `worker-health-version`)
- Multi-file release notes / changelog consistency se o processo de bump ainda divergir
- Não reabrir health/install-vm/preflight/worker/deploy-guard/`STAGE_RELEASE_V1`
