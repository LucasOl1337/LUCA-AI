# SwarmLedger — ready-to-ship (LUCA-AI)

## Em andamento
_(nenhum — sessão coletor em integração)_

## Concluído
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
- Guard de deploy/branch se wrangler/worker cloud voltar a ser caminho de release
- Docs/operacao que citem o campo `version` no preflight/worker health (opcional)
- Ao bump de `package.json`, atualizar `shared/release-version.js` (lock `worker-health-version`)
