# CLI para agentes: inventário e plano

Base: `origin/main` em `5a1cc9a` (25/09/2026). O checkout principal estava em uma branch antiga com edições de outras frentes; implementação em worktree própria.

## O que existia

- Express oferece autenticação por sessão, administração, estado, eventos, missões, agendamento, agentes, personas, chat, pastas, anexos, compartilhamento, templates, jobs multipersona, deliberações, telemetria SOMPO e casos do laboratório.
- `scripts/sompo-demo.mjs` e verificadores específicos são scripts de desenvolvimento, sem interface unificada.
- `/api/catalog/endpoints` é um catálogo de operação do runtime, não um contrato completo do produto. Não cobre todas as rotas Express.
- O token `LUCA_MACHINE_TOKEN` autentica apenas deliberações. As demais funções usam sessão de usuário e preservam os limites de conta/admin.
- Simulação, replay, geofencing, física MEMS e classificação de olhos são módulos determinísticos locais. Renderização WebGL, webcam, inferência MediaPipe e áudio dependem do navegador.

## Decisões

1. Executável `luca`, também acessível por `node bin/luca.js` e `npm run cli --`. Node >=22, módulos ESM, nenhuma dependência nova, sem carregar o servidor ou React.
2. Catálogo declarativo com comando, método, rota, campos, exemplos e autenticação. Ele produz a ajuda e a descoberta JSON offline. Um teste compara o catálogo com todas as rotas `/api/` registradas no Express, inclusive módulos.
3. Comandos por domínio, flags tipadas para uso comum e `--data @arquivo.json`/stdin para corpos completos. Escape hatch `api METHOD /api/...` para diagnóstico. Erros de digitação falham antes de qualquer chamada.
4. JSON em stdout, erros estruturados em stderr, códigos de saída estáveis; downloads binários e exportações por `--output`, observação limitada em NDJSON, espera de jobs retomável por ID. Nenhuma repetição automática de mutações.
5. Perfis por URL, cookie de sessão privado por perfil, login por stdin/env, senha nunca persistida. Trocar a origem não reaproveita a sessão; Bearer de máquina só vai para deliberações. Sem ler cookies do navegador.
6. Comandos locais reutilizam os módulos de domínio para importar/reproduzir CSV, simular cenários, avaliar geofencing, física do sensor e sequências de observações dos olhos. Ajuda explicita os limites de câmera/som/3D.

## Implementação e aceite

- [x] Catálogo e ajuda cobrindo todas as rotas atuais.
- [x] Parser, transporte HTTP, perfis, autenticação, upload/download e espera/observação.
- [x] Operações locais e fluxos de laboratório/telemetria por arquivo.
- [x] Testes do processo CLI contra servidor local: autenticação, isolamento, CRUD, arquivos, erros, jobs e comandos offline.
- [x] Documentação de instalação, receitas, contratos, limites e manutenção em README/INDEX/AGENTS.
- [x] Suíte do repositório, typecheck, build e inclusão do CLI no pacote de release. Publicação segue o fluxo obrigatório do projeto.

Testes mutantes usam somente processo local isolado, dados temporários e integrações bloqueadas. Não criam contas nem alteram dados na produção.

## Resultado validado

114 comandos, cobrindo 93 rotas HTTP distintas. A suíte teve 911 testes: 904 aprovados, 7 pulados e nenhuma falha. Typecheck e build passaram. Os testes CLI cobrem autenticação/ownership, CRUD, arquivos, suporte admin, templates, agenda, pipeline SOMPO → CSV → laboratório, relatório HTML, deliberação com integração indisponível, polling, timeout e interrupção.

Descoberta offline (`luca commands`) iniciou com mediana de 25 ms em dez processos nesta máquina, Node 26.7.0. Esse número mede inicialização local, não latência de APIs ou modelos. Nenhuma dependência de runtime foi adicionada.
