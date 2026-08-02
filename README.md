# LUCA-AI

LUCA-AI e um painel para criar, acompanhar e revisar missoes executadas por agentes de IA. A produção usa a interface React e o runtime Express na VM, integrados ao 9Router, Kamui e Yume da mesma máquina.

O domínio público passa por um proxy reverso mínimo da Cloudflare e pelo Tunnel da VM. Nenhum processo do computador de desenvolvimento participa da produção.

Stack: React, TypeScript, Vite, Tailwind CSS, Express, WebSocket, Node Test Runner e Cloudflare Tunnel (borda via `deploy/luca-ai-vm-proxy.js`). O runtime em `worker/` é legado e não faz parte da produção atual.

Consulte [`INDEX.md`](./INDEX.md) para localizar codigo e documentacao sem carregar material historico.
