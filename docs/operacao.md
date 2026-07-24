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

## Release cloud

O repositorio nao possui workflow de CI nem script de deploy. `wrangler.jsonc` publica `dist/` no dominio de producao e declara a migration do Durable Object. O Wrangler nao esta fixado nas dependencias do projeto.
