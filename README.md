# LUCA-AI

Painel pra criar, acompanhar e revisar missões executadas por agentes de IA. Você define a missão, os agentes trabalham e cada rodada fica registrada pra revisão. Em produção em [luca-ai.com.br](https://luca-ai.com.br).

Módulos: SOMPO (`/sompo`, telemetria e gêmeo digital do ESP32), laboratório do sensor (`/sensor`, o IMU do ESP32 por dentro em 3D; ver [`docs/sensor-lab.md`](docs/sensor-lab.md)) e Laboratório Virtual (`/laboratorio`, replay e investigação de incidentes a partir de telemetria CSV/JSON, com cena 3D e relatório). Os limites da reconstrução geográfica estão em [`docs/laboratorio-fazendas.md`](docs/laboratorio-fazendas.md).

**EN:** A dashboard to create, follow and review missions run by AI agents, live at [luca-ai.com.br](https://luca-ai.com.br). It includes ESP32 telemetry with a digital twin, a 3D sensor lab and a virtual lab for replaying incidents from telemetry files.

**Stack:** React, TypeScript, Vite, Tailwind CSS, Express, WebSocket, Node Test Runner.

Consulte [`INDEX.md`](./INDEX.md) pra localizar código e documentação. Regras de operação pra agentes ficam em [`AGENTS.md`](./AGENTS.md).

## CLI para agentes

Node >=22, sem build ou dependencias extras. Opera todas as APIs do app e os calculos locais de simulacao/replay.

```bash
node bin/luca.js --help
node bin/luca.js commands
node bin/luca.js health
node bin/luca.js auth login --email agente@example.test --password-stdin
node bin/luca.js team run --data @rodada.json --wait
```

`npm link --ignore-scripts` disponibiliza `luca` no terminal. [Guia e receitas](docs/cli.md), [referencia completa](docs/cli-reference.md). JSON em stdout, arquivos/stdin, perfis por ambiente e acompanhamento de jobs. Validacao: `npm run test:cli`.
