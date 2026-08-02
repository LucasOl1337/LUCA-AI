# LUCA-AI

Este checkout contem o painel React e o runtime Express (local e producao na VM). O dominio publico `luca-ai.com.br` chega ao Express via proxy de borda (`deploy/luca-ai-vm-proxy.js`) e Cloudflare Tunnel na VM. O runtime em `worker/` + `wrangler.jsonc` (rota historica `app.luca-ai.com.br` / Durable Object) e legado e nao participa da publicacao atual. `git push` nao deploya; o repositorio nao declara staging nem automacao de deploy.

1. Faca commit, push, release ou deploy somente com ordem explicita do dono.
2. Nao use `git clean`, `git reset --hard`, `git checkout --` nem `git stash`; preserve alteracoes alheias na arvore compartilhada.
3. Nao rode testes mutantes nem comandos de limpeza contra a producao (`luca-ai.com.br`, origem Tunnel da VM, Durable Object legado em `app.luca-ai.com.br` se ainda existir).
4. Nunca escreva direto no Yume; leia personas pelo cliente GET do Kamui em `server/kamui-client.js`.
5. Trate `worker/` e migrations do Durable Object como legado: so altere com ordem explicita do dono; nao confunda com o proxy de borda em `deploy/luca-ai-vm-proxy.js`.
6. Consulte INDEX.md para onde esta cada coisa e quando ler cada documento.
