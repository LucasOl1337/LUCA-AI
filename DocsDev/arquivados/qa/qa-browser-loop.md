# QA Browser Loop - LUCA-AI

Data de inicio: 2026-06-12
Ambiente alvo: Chrome, app local em `http://127.0.0.1:4242`.

## Criterio de PASS

- Cada controle clicado/alterado responde em ate 2s ou mostra estado de loading.
- Console sem erro novo depois da acao.
- Network sem falha nova.
- Layout sem corte, sobreposicao, overflow incoerente ou texto ilegivel.
- Fluxos com canvas, modais e relatorios validados em desktop e mobile.

## Fila

1. [em teste] Operacional - navegacao, trilho de agentes, modal de terminal, controles heartbeat, briefing Sompo, textarea de missao, reset/ativar, canvas e chat.
   - Corrigido e revalidado: `src/components/AgentRail.tsx` adicionou feedback imediato `ligando/pausando` no toggle do supervisor; `src/components/AgentTerminal.tsx` adicionou semântica de dialog ao modal.
   - Corrigido e revalidado: `src/components/CopyLogButton.tsx` tenta fallback quando `navigator.clipboard.writeText` falha e expõe estado visual de falha.
   - Corrigido em reteste mobile: `src/components/AgentTerminal.tsx` ampliou o alvo de fechar e passou a fechar/acionar controles heartbeat por pointer/mouse/touch down/up, inclusive em captura; `src/components/CopyLogButton.tsx` também responde a pointer/mouse/touch down/up em captura e usa alvo de 40px para cópia no mobile.
   - Validado em desktop: modal heartbeat abre, copia log, executa play/pause/limpar e fecha sem erro novo.
   - Validado em desktop: card database navega/volta; maestro, transformador de missão, planejador, pesquisador e designer abrem terminal, copiam log e fecham sem erro novo.
   - Validado em desktop: copiar log do supervisor e copiar log do chat global.
   - Corrigido e revalidado: `src/components/MissionBar.tsx` associa explicitamente labels e `aria-labels` aos campos do briefing Sompo; cinco campos preenchidos no Chrome sem erro novo.
   - Corrigido em reteste mobile: `src/components/MissionBar.tsx` aumentou para 40px os alvos `briefing Sompo` e `ocultar campos` e passou a acionar botões da barra por pointer/mouse/touch down/up em captura.
   - Validado em mobile: `src/components/AgentRail.tsx` manteve altura do trilho, terminal heartbeat abriu em <=2s; `src/components/CopyLogButton.tsx` copiou log no mobile em 714ms com estado `copiado`; `src/components/AgentTerminal.tsx` fechou modal em 1,5s após ampliar alvo/eventos.
   - Bloqueio atual: ao retestar `briefing Sompo` mobile, CUA/locator/CDP click não abriram os campos mesmo com alvo de 40px e botão habilitado; em seguida o runtime do plugin Chrome/Node resetou repetidamente durante teste por teclado/bootstrap. Não avançar para o próximo item até repetir esse mesmo alvo no Chrome.
   - Validado em desktop: ocultar campos do briefing, ativar missão, estado ativo do canvas/chat e resetar missão.
   - Correções aplicadas: `src/components/Layout.tsx` colapsa sidebar no mobile; `src/pages/OperacionalPage.tsx` permite scroll vertical mobile; `src/components/MissionBar.tsx` evita sobreposição entre status pills e `briefing Sompo`; `src/components/AgentRail.tsx` fixa altura mínima do trilho para os cards não escaparem no mobile.
   - Proximo alvo: retomar em `Operacional > mobile > briefing Sompo`, clicar o botão no Chrome, confirmar abertura dos cinco campos e só então seguir para preenchimento/ativação/reset.
2. [pendente] Inicio - CTA Centro Operacional, Rodar Caso Sompo, cards de status e responsividade.
3. [pendente] Agentes - grid de agentes, abertura/fechamento de terminal, card database, responsividade.
4. [pendente] Database - tabs de camada, cards de registros, links Obsidian/externos e detalhe aberto.
5. [pendente] Ferramentas - carregamento do catalogo, selecao de ferramentas, copiar contrato, paineis schema/payload.
6. [pendente] Endpoints - carregamento do catalogo, selecao de modulos, abas Entrada/Saida e listas de rotas.
7. [pendente] Heartbeat - play, pause, diagnostico, limpar, log, cards, mobile.
8. [pendente] Historico - agendadas/passadas, pausar/retomar/cancelar quando houver dados, abrir/copiar/fechar relatorio quando houver dashboard.

## Execucao

- Item atual: 1. Operacional.
- Resultado atual: fluxo Operacional passou em desktop; mobile corrigiu trilho e modal heartbeat, mas segue bloqueado no reteste do botão `briefing Sompo` porque o plugin Chrome/Node resetou repetidamente antes de concluir a validação. Próximo alvo: retomar exatamente em `Operacional > mobile > briefing Sompo`.
