# LUCA-AI

LUCA-AI é uma bancada local para executar missões com uma equipe de personas. O produto possui somente duas áreas:

- **LUCA-AI:** monta os papéis Supervisor, Decisor da missão, Executores, Aprovação e Exibição final, executa o fluxo e apresenta processo, canvas e comunicação.
- **Personas:** consulta o catálogo Yume via Kamui e gerencia quais personas estão disponíveis na bancada.

O backend Express concentra o caso de uso em `server/persona-workbench.js`, persiste apenas as personas importadas em `.luca/personas.json` e registra telemetria em `.luca/runtime-events.jsonl`. O 9Router e o Kamui/Yume são dependências locais externas.

Na publicação, o Express permanece em loopback e é alcançado por Cloudflare Tunnel + Access. 9Router, Kamui e Yume continuam privados na VM.

Stack: React, TypeScript, Vite, Tailwind CSS, Express e Node Test Runner.

Consulte [`INDEX.md`](./INDEX.md) para localizar código e documentação.
