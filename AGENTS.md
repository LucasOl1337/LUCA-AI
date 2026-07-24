# LUCA-AI

Este checkout contem o painel React, o runtime Express local e o Worker Cloudflare publicado em `app.luca-ai.com.br`. `git push` nao deploya; o repositorio nao declara staging nem automacao de deploy.

1. Faca commit, push, release ou deploy somente com ordem explicita do dono.
2. Nao use `git clean`, `git reset --hard`, `git checkout --` nem `git stash`; preserve alteracoes alheias na arvore compartilhada.
3. Nao rode testes mutantes nem comandos de limpeza contra `app.luca-ai.com.br` ou o Durable Object de producao.
4. Nunca escreva direto no Yume; leia personas pelo cliente GET do Kamui em `server/kamui-client.js`.
5. Inclua a migration do Durable Object no mesmo commit do codigo que exige a mudanca de schema.
6. Consulte INDEX.md para onde esta cada coisa e quando ler cada documento.
