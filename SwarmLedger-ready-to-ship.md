# SwarmLedger — ready-to-ship (LUCA-AI)

## Em andamento
_(nenhum — sessão fechou)_


## Concluído
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
- Alinhar worker cloud `/api/health` com `package.json` se DO cloud reentrar no fluxo comercial
- Preflight/docs que citem campos de health após version
- Guard de deploy/branch se wrangler/worker cloud voltar a ser caminho de release
