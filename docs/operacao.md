# Operacao

Leia SOMENTE ao instalar, executar, testar, diagnosticar estado local ou preparar release.

## Local

Node.js e Python 3 (`heartbeat_monitor.py`).

```powershell
npm ci
npm start
```

`npm start` gera `dist/` e sobe o Express em `http://127.0.0.1:4242`. `npm run dev:full` so inicia o servidor e reusa o build. Saude: `GET /api/health`. Preflight: `GET /api/preflight`.

```powershell
npm test
npm run typecheck
npm run build
```

Estado local fica em `.luca/` (ignorado pelo Git): `system-state.json`, `runtime-events.jsonl`, `auth.json`. Copie antes de apagar se precisar preservar missoes ou contas.

## Producao

`npm run stage:release` empacota source/dist/state. Suba os tres tarballs para `/tmp/luca-deploy-<commit12>/` na sennin — e o diretorio de staging que `install-vm.sh` procura por padrao, e se faltar o script sai em silencio pelo `set -e`. `stage:release` empacota o WORKING TREE, nao o commit: com a arvore suja (agente no meio de uma edicao) o deploy leva o trabalho pela metade — nesse caso empacote de uma worktree limpa no commit. Na sennin: `deploy/install-vm.sh <commit>`. Units: `luca-ai.service` (Express em `127.0.0.1:4242`) e `cloudflared-luca-ai.service` (Tunnel `luca-ai-production`). Env da VM: `/etc/sennin/luca-ai.env`. Dados: `/var/lib/luca-ai` (`LUCA_DATA_DIR`) — entra no backup da VM.

Dominio canonico: `https://luca-ai.com.br` (sem `www`). A borda responde HTTP com `308` e manda HSTS; cookie de sessao e `Secure`. Contas em `LUCA_ADMIN_EMAILS` veem Admin; se a variavel estiver vazia, a primeira conta vira admin.
