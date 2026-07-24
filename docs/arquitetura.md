# Arquitetura

Leia ao mudar um fluxo que cruza frontend, Express ou integrações.

```text
LucaAiPage / PersonasPage
          |
          v
     src/lib/api.ts
          |
          v
    server/index.js
          |
          v
persona-workbench.js
   |          |          |
   v          v          v
Kamui       9Router   persona-store
(leitura)  (execução) (.luca/personas.json)
```

`server/persona-workbench.js` é a interface profunda do backend: lista e importa personas, executa o workflow fixo de cinco papéis e publica eventos. O servidor HTTP apenas valida o transporte e delega esse trabalho.

O frontend mantém somente estado de apresentação. Não existe estado global de missões, WebSocket, Worker cloud ou segunda implementação das regras. O Express serve `dist/` quando o build existe e expõe somente a superfície necessária da bancada sob `/api`.

Ao iniciar com um checkout antigo, `persona-store.js` migra uma única vez as personas encontradas em `.luca/system-state.json` para `.luca/personas.json`; o restante do estado legado não é carregado.
