# LUCA-AI

Este checkout contem o painel React e o runtime Express (local e producao na VM). O dominio publico `luca-ai.com.br` chega ao Express via proxy de borda (`deploy/luca-ai-vm-proxy.js`) e Cloudflare Tunnel na VM. O runtime em `worker/` + `wrangler.jsonc` (rota historica `app.luca-ai.com.br` / Durable Object) e legado e nao participa da publicacao atual. `git push` so publica o repositorio — deploy na VM e passo separado (`npm run stage:release` + `deploy/install-vm.sh` na sennin).

## Entrega (padrao)

Trabalho **pequeno/medio finalizado** (fix, feature contida, UI, docs operacionais, regras de agente) **nao espera** o dono pedir "faz o commit". Em sequencia:

1. Verificar o resultado real (testes/typecheck/smoke do que mudou, quando aplicavel).
2. **Commit** na `main` (mensagem no estilo do historico do repo).
3. **Push** para `origin/main`.
4. **Deploy** na VM quando o change afeta runtime ou UI servidos em producao: empacotar com `npm run stage:release`, instalar com `deploy/install-vm.sh <commit>` na sennin. Docs-only / so-agente / sem impacto em `dist` ou `server` nao exigem deploy.

So **interrompa e pergunte** antes de: force-push, `reset --hard`, limpeza destrutiva, secrets, alterar `worker/` legado, mudanca grande/arriscada (auth/schema, breaking, multi-PR, release com tag/marketing).

## Guardrails

1. Nao use `git clean`, `git reset --hard`, `git checkout --` nem `git stash`; preserve alteracoes alheias na arvore compartilhada.
2. Nao rode testes mutantes nem comandos de limpeza contra a producao (`luca-ai.com.br`, origem Tunnel da VM, Durable Object legado em `app.luca-ai.com.br` se ainda existir).
3. Nunca escreva direto no Yume; leia personas pelo cliente GET do Kamui em `server/kamui-client.js`.
4. Trate `worker/` e migrations do Durable Object como legado: so altere com ordem explicita do dono; nao confunda com o proxy de borda em `deploy/luca-ai-vm-proxy.js`.
5. Consulte INDEX.md para onde esta cada coisa e quando ler cada documento.
