# LUCA-AI

Painel para criar, acompanhar e revisar missoes executadas por agentes de IA.

**Status:** producao na VM (`sennin-core-01`). Interface React + runtime Express. Dominio publico `https://luca-ai.com.br` via proxy de borda (`deploy/luca-ai-vm-proxy.js`) e Cloudflare Tunnel. `worker/` e legado e nao faz parte da producao.

**Stack:** React, TypeScript, Vite, Tailwind CSS, Express, WebSocket, Node Test Runner.

Consulte [`INDEX.md`](./INDEX.md) para localizar codigo e documentacao.

## Fluxo padrao de entrega

Toda alteracao solicitada pelo dono e concluida deve seguir o fluxo completo: validar, criar commit atomico, enviar para `origin/main` e fazer deploy na VM de producao. Esta e uma ordem permanente; nao espere uma nova confirmacao a cada entrega. Interrompa uma dessas etapas somente quando o dono pedir explicitamente ou quando houver um bloqueio real de seguranca ou validacao, que deve ser informado com clareza.
