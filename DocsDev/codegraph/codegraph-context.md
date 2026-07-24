# Contexto CodeGraph — bancada de personas

```text
App
├── Layout
│   ├── LUCA-AI
│   └── Personas
├── LucaAiPage ── lucaApi.runPersonaTeam
└── PersonasPage ── lucaApi.list/import/remove
                         │
                         v
                   server/index.js
                         │
                         v
                createPersonaWorkbench
                  ├── persona-store
                  ├── kamui-client
                  ├── router-client
                  └── event-log
```

O ponto de mudança preferencial para regras de negócio é `server/persona-workbench.js`. Transporte HTTP, persistência e integrações são adaptadores ao redor dele.
