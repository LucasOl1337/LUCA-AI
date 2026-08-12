# Operacao

Leia SOMENTE ao instalar, executar, testar, diagnosticar estado local ou preparar release.

## Runtime local

Use Node.js e Python 3. O servidor chama `heartbeat_monitor.py`; o restante do runtime roda em Node.js.

```powershell
npm ci
npm start
```

`npm start` gera `dist/` e inicia o Express em `http://127.0.0.1:4242`. `npm run dev:full` inicia apenas o servidor e reutiliza o build existente.

Confira a saude em `GET /api/health` e o preflight em `GET /api/preflight`.

## Verificacao

```powershell
npm test
npm run typecheck
npm run build
```

O teste do catalogo local le `../TARS/ferramentas` e `../Yume/ferramentas`. Mantenha esses checkouts como irmaos do LUCA-AI para executar a suite completa.

## Estado local

O runtime grava estado em `.luca/system-state.json` e eventos em `.luca/runtime-events.jsonl`. A pasta esta ignorada pelo Git. Copie esses arquivos antes de limpar o estado quando precisar preservar missoes, personas importadas ou historico.

## Produção

Em produção, `luca-ai.service` inicia o Express em loopback na VM `sennin-core-01`, usando o 9Router, o Kamui e o Yume da mesma VM. O `cloudflared-luca-ai.service` mantém o Tunnel `luca-ai-production` até o Express em `127.0.0.1:4242`. O proxy de borda `luca-ai-vm-proxy` (Worker em `deploy/luca-ai-vm-proxy.js`) recebe `luca-ai.com.br/*` e alcança o Express via Workers VPC ligado a esse Tunnel — sem hostname de outro projeto. Nenhuma tarefa, Tunnel ou processo do PC Windows participa da produção. `deploy/run-luca-ai.ps1` existe apenas para desenvolvimento local.

O endereço público canônico é `https://luca-ai.com.br`, sem `www`. A borda redireciona HTTP permanentemente com status `308`, preservando caminho e query string, e adiciona HSTS às respostas HTTPS. Cookies de autenticação continuam obrigatoriamente `Secure`.

O produto possui autenticação própria por e-mail e senha. Contas listadas em `LUCA_ADMIN_EMAILS` visualizam o item `Admin` no menu. Somente quando essa variável não está configurada, a primeira conta criada se torna administradora para permitir o bootstrap.

Os dados persistentes ficam em `/var/lib/luca-ai` na VM (`LUCA_DATA_DIR`), incluindo `auth.json`, estado, eventos e heartbeat. Esse diretório deve fazer parte do backup privado da VM. Os arquivos contêm hashes de senha e de tokens de sessão, nunca senhas ou tokens em texto puro.

O painel `Admin` acompanha por conta logins, sessões, solicitações autenticadas, ações de escrita, execuções iniciadas, erros, conexões WebSocket e última atividade. O tracking guarda somente contadores e timestamps; conteúdo de prompts e respostas não é copiado para `auth.json`.
