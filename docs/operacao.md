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

`deploy/run-luca-ai.ps1` inicia o Express em loopback com o 9Router e o Kamui da VM. O Tunnel configurado fora do repositório publica `luca-ai.com.br` e o acesso público não exige conta Cloudflare.

O produto possui autenticação própria por e-mail e senha. Contas listadas em `LUCA_ADMIN_EMAILS` visualizam o item `Admin` no menu. Somente quando essa variável não está configurada, a primeira conta criada se torna administradora para permitir o bootstrap.

Os dados de autenticação ficam em `.luca/auth.json` e devem fazer parte do backup privado da VM. O arquivo é ignorado pelo Git e contém hashes de senha e hashes de tokens de sessão, nunca senhas ou tokens em texto puro.
