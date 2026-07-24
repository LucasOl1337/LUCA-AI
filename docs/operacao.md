# Operação

Leia ao instalar, executar, testar ou diagnosticar o runtime local.

## Executar

Requer Node.js.

```powershell
npm ci
npm start
```

`npm start` gera `dist/` e inicia o Express em `http://127.0.0.1:4242`. Para desenvolver apenas a interface com hot reload, use `npm run dev`; para servir um build já existente, use `npm run server`.

Confira a saúde em `GET /api/health`.

## Verificar

```powershell
npm test
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
```

## Estado local

O runtime grava as personas importadas e o cache de seus prompts em `.luca/personas.json`; os eventos ficam em `.luca/runtime-events.jsonl`. A pasta é ignorada pelo Git.

Se existir `.luca/system-state.json` de uma versão anterior, as personas são migradas automaticamente no primeiro carregamento. O arquivo legado não é alterado e pode ser removido depois de conferir a nova lista.

## Segurança operacional

O servidor escuta `127.0.0.1` por padrão e não possui autenticação. Não altere `HOST` para uma interface pública sem desenhar autenticação, autorização e política de origem.
