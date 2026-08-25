# LUCA-AI

Este checkout contem o painel React e o runtime Express (local e producao na VM). O dominio publico `luca-ai.com.br` chega ao Express via proxy de borda (`deploy/luca-ai-vm-proxy.js`) e Cloudflare Tunnel na VM. `worker/` + `wrangler.jsonc` e legado e nao participa da publicacao. `git push` so publica o repositorio; deploy na VM e passo separado (`npm run stage:release` + `deploy/install-vm.sh` na sennin). Nao ha espelho/staging de app; o `.env` local nao e o da VM (`/etc/sennin/luca-ai.env`).

## Regras

1. Commit, push e deploy so com ordem explicita do dono.
2. Nao use `git clean`, `git reset --hard`, `git checkout --` nem `git stash`; preserve alteracoes alheias na arvore compartilhada.
3. Nao rode testes mutantes nem limpeza contra a producao (`luca-ai.com.br`, origem Tunnel da VM, Durable Object legado em `app.luca-ai.com.br`).
4. Nunca escreva no Yume; leia personas pelo GET do Kamui em `server/kamui-client.js`.
5. Trate `worker/` e migrations do Durable Object como legado: so altere com ordem do dono; nao confunda com o proxy de borda em `deploy/luca-ai-vm-proxy.js`.
6. Consulte INDEX.md para onde esta cada coisa e quando ler cada documento.
