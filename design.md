# LUC.AI Design Requirements

## Objetivo

Definir a direcao visual e funcional do dashboard do LUC.AI: um centro operacional para agentes de IA, com cards clicaveis, terminais individuais, chat compartilhado, menu simples de missoes e canvas central para resultados.

O design deve combinar tecnologia, organizacao e fantasia visual controlada, usando alguns aspectos inspirados em composicoes cinematograficas simetricas, paleta pastel, dioramas, movimentos mecanicos e microinteracoes precisas.

## Direcao Criativa

O LUC.AI deve parecer um painel de comando inteligente dentro de um pequeno laboratorio cinematografico de agentes.

A interface deve adaptar alguns elementos do estilo Wes Anderson para um dashboard moderno:

- Composicao meticulosamente simetrica.
- Cards, paineis e secoes alinhados em grades bem centradas.
- Paleta pastel sofisticada combinada com tons escuros tecnologicos.
- Microinteracoes com sensacao mecanica, como botoes com clique fisico, wipes horizontais e transicoes por molduras.
- Elementos visuais com aparencia de miniaturas, dioramas ou maquetes digitais.
- Animacoes em loop sutis nos cards e assets, evitando imagens completamente estaticas quando possivel.

O resultado nao deve parecer uma landing page de hotel. Deve ser 100% adaptado para um dashboard operacional do LUC.AI.

## Paleta De Cores

Usar uma paleta inspirada na marinha real, com tons navais clássicos, brancos cerimoniais e azuis profundos, mantendo contraste suficiente para uma interface de produto:

Admiralty Navy: #0B1F3A
Royal Fleet Blue: #1E4E8C
Officer White: #F8FAFC
Sailcloth Cream: #EDE7D9
Brass Gold: #C9A227
Signal Sky: #7FB3D5
Deep Harbor: #061426
Deck Slate: #4A5A6A


Diretrizes:

- Usar `Uniform Navy` para areas profundas, terminais, textos fortes e contraste.
- Usar `Bellboy Cream` como base clara de paineis e fundos.
- Usar `Lobby Pink`, `Concierge Mint` e `Elevator Mustard` como acentos por agente, status e graficos.
- Manter sombras suaves, gradientes discretos e brilho sutil.
- Evitar neon excessivo ou visual cyberpunk generico.

## Tipografia

Diretrizes tipograficas:

- Usar uma fonte geometrica semelhante a Futura para titulos, labels importantes, nomes dos agentes e secoes.
- Usar uma fonte monoespacada semelhante a Courier Prime para logs, terminal, mensagens tecnicas e dados.
- Titulos devem ser centralizados quando fizer sentido, reforcando a composicao simetrica.
- Textos longos devem priorizar legibilidade sobre estilo.

## Estilo Visual Dos Agentes

Gerar uma imagem de coruja minimalista para cada tipo de agente:

- Agente
- Supervisor
- Planejador
- Pesquisador
- Designer

Cada coruja deve parecer parte de uma mesma familia visual, mas com variacoes claras por funcao.

Diretrizes para as corujas:

- Estilo minimalista, geometrico e simetrico.
- Aparencia de pequeno emblema ou personagem de diorama digital.
- Contornos limpos, poucos detalhes e silhueta forte.
- Cada coruja pode ter um acessorio sutil que indique sua funcao.
- O Supervisor pode ter postura mais central e hierarquica.
- O Planejador pode usar elementos de mapa, calendario ou linhas de rota.
- O Pesquisador pode usar lupa, livros ou orbitas de dados.
- O Designer pode usar formas, paleta, grid ou lapis.
- O Agente base deve ser mais neutro e versatil.
- Fundo transparente ou adaptavel aos cards.
- Boa leitura em tamanhos pequenos e medios.

## Icones Dos Assets

Gerar imagens de icone para os assets:

- Heartbeat
- Database
- Missao

Diretrizes para os icones:

- Minimalistas, geometricos e simetricos.
- Coerentes com as corujas dos agentes.
- Podem ter animacoes curtas em loop quando usados na interface.
- Heartbeat deve sugerir vida, atividade ou pulso do sistema.
- Database deve sugerir armazenamento, memoria e fonte de conhecimento.
- Missao deve sugerir objetivo, alvo ou expediente operacional.
- Fundo transparente.
- Legiveis em menu, cards, indicadores e canvas.

## Movimento E Video

A interface pode usar elementos animados ou videos curtos em loop, desde que nao prejudiquem performance nem legibilidade.

Aplicacoes recomendadas:

- Cards dos agentes com micro-loop de 3 a 5 segundos, como olhos da coruja piscando, pequena movimentacao mecanica ou brilho no emblema.
- Icone heartbeat pulsando de forma ritmica.
- Icone database com camadas ou discos se movendo levemente.
- Icone missao com alvo, linha de rota ou marcador entrando em posicao.
- Canvas central com transicoes suaves e graficos que montam como uma maquete.

Evitar:

- Videos decorativos grandes sem funcao.
- Movimento constante competindo com dados importantes.
- Animacoes que dificultem leitura do terminal, chat ou graficos.

## Layout Geral Do Dashboard

O dashboard deve ser organizado como um painel simetrico e operacional.

Estrutura recomendada:

- Topo ou lateral com os cards dos agentes em grade ou trilho perfeitamente alinhado.
- Menu de missoes com uma unica caixa de entrada em destaque.
- Canvas central como area principal da aplicacao.
- Chat compartilhado dos bots em area secundaria, mas sempre visivel ou facilmente acessivel.
- Terminal do agente aberto em painel dedicado, drawer, modal ou area inferior/lateral.

Diretrizes de composicao:

- Priorizar alinhamento central, margens consistentes e simetria visual.
- Usar bordas, molduras e divisorias como se fossem portas ou paineis de um diorama.
- Transicoes entre paineis podem usar wipes horizontais ou deslocamentos mecanicos.
- O dashboard deve carregar bem em desktop e mobile.
- Em mobile, os cards podem virar um carrossel horizontal, mantendo o canvas como foco principal.

## Cards Dos Agentes

Cada agente deve possuir um card proprio na interface.

Requisitos dos cards:

- Cada card deve exibir a imagem de coruja correspondente ao agente.
- Cada card deve exibir o nome ou funcao do agente.
- Cada card deve ter estado visual de hover, foco e selecao.
- Cada card deve ser clicavel.
- Ao clicar em um card, deve abrir o terminal correspondente daquele agente.
- O card ativo deve parecer encaixado ou destacado, como um compartimento mecanico selecionado.

Estilo dos cards:

- Formato limpo, simetrico e com bordas suaves.
- Fundo pastel ou cream com detalhes em navy.
- Pequena profundidade visual, como uma caixa de miniatura.
- Hover com leve zoom, clique mecanico ou deslocamento de 1 a 2 pixels.
- Transicao de selecao pode lembrar uma porta abrindo ou um painel deslizando.

Comportamento esperado:

- O usuario clica no card do agente.
- A interface identifica o agente selecionado.
- O terminal daquele agente e exibido ou trazido para foco.
- O card selecionado indica visualmente que esta ativo.

## Terminal Dos Agentes

Cada agente deve ter seu proprio terminal acessivel pelo card.

Requisitos do terminal:

- Deve exibir mensagens, logs, comandos ou eventos relacionados ao agente selecionado.
- Deve manter contexto visual claro sobre qual agente esta ativo.
- Deve permitir alternancia rapida entre terminais atraves dos cards.
- Deve ter aparencia de terminal moderno, com contraste adequado e boa legibilidade.
- Deve usar tipografia monoespacada semelhante a Courier Prime.

Estilo do terminal:

- Fundo `Uniform Navy` ou tom escuro equivalente.
- Texto claro, com acentos pastel para niveis de log e agentes.
- Moldura inspirada em painel mecanico ou console vintage.
- Cursor, prompt ou linhas de log podem ter microanimacao discreta.

## Chat Compartilhado Dos Bots

A interface deve conter um chat compartilhado entre os bots.

Requisitos do chat:

- Deve exibir a comunicacao conjunta dos agentes.
- Cada mensagem deve indicar claramente qual bot enviou a mensagem.
- Deve diferenciar visualmente mensagens de agentes diferentes.
- Deve suportar fluxo continuo de mensagens.
- Deve ser facil de ler sem competir visualmente com o canvas central.

Estilo do chat:

- Mensagens podem parecer pequenos bilhetes, cartoes ou etiquetas operacionais.
- Cada agente pode usar uma cor de acento da paleta.
- A entrada de mensagens pode usar transicao suave, como carimbo, slide curto ou encaixe mecanico.
- Evitar bolhas genericas demais se houver espaco para um visual mais autoral.

## Menu De Missoes

A interface deve conter um menu para definir missoes.

Requisitos do menu:

- Deve conter apenas uma caixa de entrada principal.
- Essa caixa deve ser usada para o usuario descrever ou setar a missao.
- O fluxo deve ser simples e direto.
- Nao adicionar formularios complexos, multiplos campos ou etapas desnecessarias.

Estilo do menu:

- A caixa de missao deve parecer o comando central do painel.
- Pode ter moldura simetrica, label forte e botao mecanico de envio.
- O botao de envio pode ter feedback de clique fisico.
- Ao enviar uma missao, a interface pode disparar uma transicao curta como um marcador entrando no canvas.

Comportamento esperado:

- O usuario digita a missao em uma unica caixa.
- O sistema usa essa missao como entrada principal para os agentes.
- A missao definida alimenta o chat, os terminais e o canvas de resultados.

## Canvas Central

A interface deve ter um canvas central dedicado aos resultados da missao.

Requisitos do canvas:

- Deve ser a area visual principal da aplicacao.
- Deve expor os resultados da missao de forma clara, bonita e interativa.
- Deve usar graficos visualmente atrativos.
- Os graficos devem ter aparencia 3D ou profundidade visual quando fizer sentido.
- Deve suportar visualizacoes como status, progresso, metricas, relacoes, fluxos ou conclusoes da missao.
- Deve manter equilibrio entre beleza visual e leitura objetiva dos dados.

Direcao visual do canvas:

- O canvas deve parecer uma maquete central dos resultados da missao.
- Graficos podem ser apresentados como blocos, torres, trilhos, mapas, linhas de fluxo ou paineis em perspectiva.
- Usar profundidade visual, sombras suaves, camadas e pequenas animacoes de montagem.
- Os dados devem entrar de forma ordenada, como pecas encaixando em uma composicao simetrica.
- Evitar excesso de ornamento quando o usuario precisar interpretar dados rapidamente.

Visualizacoes possiveis:

- Progresso da missao.
- Status por agente.
- Relacao entre descobertas, etapas e resultados.
- Linha do tempo da execucao.
- Mapa de dependencias.
- Indicadores de heartbeat do sistema.
- Fontes ou entradas vindas do database.
- Resultado final consolidado.

## Microinteracoes

Microinteracoes devem reforcar precisao e personalidade sem atrapalhar uso.

Requisitos:

- Hover dos cards com pequeno zoom ou elevacao.
- Clique com sensacao mecanica.
- Transicoes horizontais entre paineis, como wipes simetricos.
- Indicador de scroll ou progresso inspirado em elevador miniatura.
- Estados ativos com borda, luz sutil ou encaixe visual.
- Atualizacoes do canvas com montagem gradual dos graficos.
- Submit da missao com feedback claro e sonoridade visual de campainha, sem depender de audio.

## Estados E Interacoes

A interface deve considerar os seguintes estados:

- Nenhuma missao definida.
- Missao em andamento.
- Agente ativo.
- Terminal aberto.
- Chat recebendo mensagens.
- Resultado parcial no canvas.
- Resultado final da missao.
- Erro ou falha em agente.
- Sistema aguardando dados do database.
- Heartbeat ativo, instavel ou offline.

Interacoes principais:

- Clicar em card de agente abre o terminal correspondente.
- Digitar missao na caixa unica inicia ou atualiza a missao.
- Bots publicam mensagens no chat compartilhado.
- Canvas central atualiza os graficos e visualizacoes conforme a missao evolui.
- Heartbeat indica atividade geral do sistema.
- Database indica uso, consulta ou carregamento de conhecimento.
- Missao indica o objetivo atual em execucao.

## Acessibilidade E Performance

Requisitos:

- Manter contraste suficiente entre texto e fundo.
- Todas as interacoes devem funcionar com teclado.
- Cards clicaveis devem ter foco visivel.
- Animacoes devem respeitar preferencias de reducao de movimento quando aplicavel.
- Videos ou loops devem ter fallback visual leve.
- Nao usar movimento excessivo em areas de leitura continua.
- Canvas deve continuar compreensivel mesmo sem efeitos 3D.

## Prioridades De Implementacao

1. Criar a paleta, tipografia e tokens visuais principais.
2. Criar as imagens minimalistas das corujas para os agentes.
3. Criar os icones dos assets heartbeat, database e missao.
4. Implementar cards clicaveis dos agentes com estados de hover, foco e ativo.
5. Conectar cada card ao terminal correspondente.
6. Implementar chat compartilhado dos bots.
7. Implementar menu de missoes com uma unica caixa de entrada.
8. Implementar canvas central com graficos bonitos, modernos e com efeito 3D.
9. Adicionar microinteracoes mecanicas, wipes horizontais e animacoes sutis.
10. Garantir responsividade, acessibilidade e performance.

## Criterios De Aceite

- Existe uma imagem de coruja minimalista para cada agente listado.
- Existem icones para heartbeat, database e missao.
- Cada agente aparece em um card clicavel.
- Clicar no card abre o terminal daquele agente.
- Existe um chat compartilhado dos bots.
- Existe um menu de missoes com apenas uma caixa de entrada.
- Existe um canvas central para resultados da missao.
- O canvas apresenta graficos visualmente bonitos, modernos e com aparencia 3D.
- A interface usa composicao simetrica, paleta pastel e detalhes mecanicos sem deixar de parecer um dashboard de IA.
- As animacoes e videos sao sutis, funcionais e nao prejudicam leitura ou performance.
