# LUCA-AI

Este checkout contém uma bancada local para executar missões com equipes de personas. A interface React conversa apenas com o runtime Express; o Express lê personas do Yume via Kamui e executa os cinco papéis da bancada pelo roteador 9Router.

1. Faça commit, push, release ou deploy somente com ordem explícita do dono.
2. Preserve alterações alheias na árvore compartilhada e nunca apague `plans/` ou o histórico em `DocsDev/` sem ordem explícita.
3. Nunca escreva direto no Yume; `server/kamui-client.js` deve permanecer somente leitura.
4. Mantenha o servidor restrito ao loopback enquanto não existir autenticação desenhada para exposição externa.
5. Use CodeGraph primeiro para mapear estrutura, chamadas e impacto; sincronize o índice se estiver inconsistente.
6. Consulte `INDEX.md` para localizar o código e a documentação oficial.
