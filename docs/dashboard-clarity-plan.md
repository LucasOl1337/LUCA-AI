# LUCA-AI dashboard clarity plan

## Objetivo

Transformar o dashboard em uma tela que uma pessoa externa consiga entender em menos de 60 segundos:

1. Qual problema o LUCA-AI esta acompanhando.
2. O que o sistema esta fazendo agora.
3. Qual valor pratico foi gerado.
4. Qual proxima decisao o usuario deveria tomar.

O painel atual mostra informacao real, mas a leitura depende de conhecer a arquitetura interna. A proxima versao precisa trocar a logica de "componentes tecnicos soltos" por uma narrativa operacional.

## Diagnostico atual

O dashboard atual tem valor, mas a ordem visual nao cria raciocinio:

- A primeira area mostra agentes e heartbeat antes de explicar o caso de negocio.
- O titulo principal e "database", que descreve a fonte de dados, nao o valor para o usuario.
- Os cards de metricas dizem "ciclos", "agentes" e "database viva", mas nao respondem "isso e bom ou ruim?".
- Os graficos aparecem cedo demais, antes de o usuario entender a tese.
- "simulacao ativa", "fila incessante", "fonte da verdade", "metodo" e "procedimento" sao bons blocos, mas estao no mesmo peso visual e sem sequencia.
- O usuario externo nao tem uma linha de leitura clara: problema -> evidencia -> acao -> impacto -> proximo passo.

## Narrativa proposta

A tela deve seguir esta ordem:

1. **Situacao**
   - O que esta sendo monitorado.
   - Qual risco principal esta ativo.
   - Qual urgencia ou severidade.

2. **Diagnostico**
   - Por que isso importa.
   - Evidencias principais.
   - Quais fatores estao pressionando o resultado.

3. **Acao do LUCA-AI**
   - Qual agente trabalhou.
   - Qual job foi executado.
   - O que foi produzido: simulacao, relatorio, fonte, metodo ou procedimento.

4. **Valor gerado**
   - Perda proxy evitada.
   - Tempo operacional reduzido.
   - Decisao mais clara para underwriting, sinistro, corretor ou gestor.

5. **Proximo passo**
   - A recomendacao acionavel.
   - O dono sugerido.
   - A decisao a tomar agora.

## Nova arquitetura visual

### 1. Header de contexto

Substituir o topo de tiles por uma faixa de contexto:

- Titulo: "LUCA-AI: inteligencia operacional para risco agro"
- Subtitulo curto: "O sistema transforma sinais de risco em simulacoes, procedimentos e decisoes acionaveis."
- Status discreto: backend online, supervisor running, ultimo ciclo.
- Um indicador principal: "risco ativo agora".

Os agentes continuam existindo, mas deixam de ser a primeira coisa que a pessoa ve. Eles viram uma barra lateral ou um bloco "sistema em execucao".

### 2. Painel de historia principal

Criar uma area acima da dobra com 3 colunas:

- **Agora**
  - risco ativo
  - severidade
  - status do ciclo

- **Por que importa**
  - uma tese curta do ultimo relatorio
  - evidencia principal

- **Valor**
  - perda proxy evitada
  - jobs concluidos
  - ativos gerados

Essa area e a resposta rapida para uma pessoa de fora.

### 3. Linha de raciocinio

Adicionar uma timeline horizontal ou vertical:

1. Sinal detectado
2. Diagnostico produzido
3. Simulacao calculada
4. Procedimento criado
5. Proxima decisao

Cada etapa deve mostrar uma frase curta e um status. Isso da sequencia mental ao dashboard.

### 4. Evidencias e graficos

Mover os graficos para depois da narrativa:

- "Pressao por risco" como grafico principal.
- "Capital e PSR" como apoio.
- "Criticidade" como distribuicao secundaria.

Cada grafico precisa ter uma legenda explicativa curta, por exemplo:

- "Este grafico mostra quais riscos estao consumindo mais atencao operacional."
- "Este grafico compara pressao de PSR e resseguro para priorizar decisao de capital."

### 5. Ativos produzidos

Agrupar fonte, metodo, procedimento, simulacao e relatorio em uma secao chamada:

"O que o LUCA-AI entregou"

Cada ativo deve ter:

- nome
- utilidade
- quando usar
- botao ou link visual: "ver detalhes"

### 6. Sistema em execucao

Mover agentes, heartbeat, logs e fila para uma area tecnica mais baixa:

- "Como o sistema esta trabalhando"
- supervisor
- executor riscos-campo
- fila de jobs
- heartbeat/logs

Isso preserva transparencia tecnica sem competir com a narrativa de valor.

## Hierarquia de informacao

Prioridade visual recomendada:

1. Risco ativo e valor gerado.
2. Tese do diagnostico.
3. Proximo passo.
4. Timeline de raciocinio.
5. Graficos de evidencia.
6. Ativos gerados.
7. Fila/logs/agentes.

## Direcao visual

Manter o DNA tecnico escuro, mas com mais clareza editorial.

### Paleta

- Fundo: preto quente tecnico, como atual.
- Superficies: menos bordas internas e mais blocos por secao.
- Verde: sucesso, ganho, sistema online.
- Amarelo/ambar: alerta, risco em observacao.
- Vermelho suave: criticidade.
- Cinza claro: texto principal.
- Cinza medio: metadados.

### Tipografia

- Titulos mais humanos e explicativos.
- Labels tecnicos menores.
- Numeros de valor maiores.
- Frases de tese com mais respiro.

### Layout

- Menos grid uniforme.
- Mais composicao guiada: hero operacional, timeline, evidencias, entregaveis, sistema.
- Cards com funcao clara, nao todos iguais.
- Evitar encaixar tudo acima da dobra.

## Componentes planejados

### ExecutiveSummary

Mostra a resposta curta:

- risco ativo
- tese
- valor gerado
- proximo passo

### ReasoningTimeline

Mostra a sequencia:

- sinal
- diagnostico
- simulacao
- procedimento
- decisao

### ValueScoreboard

Mostra metricas com linguagem de negocio:

- perda proxy evitada
- jobs concluidos
- ativos operacionais criados
- fontes/metodos/procedimentos disponiveis

### EvidenceCharts

Agrupa graficos com texto explicativo.

### DeliveredAssets

Mostra relatorio, fonte da verdade, metodo, procedimento e simulacao como entregas.

### SystemActivity

Mostra agentes, heartbeat e fila tecnica.

## Mapeamento dos dados atuais

Dados ja existentes que podem alimentar a nova narrativa:

- `database.summary` -> tese geral do caso.
- `database.painPoints` -> riscos e criticidade.
- `database.simulations[0]` -> simulacao ativa e perda proxy evitada.
- `database.reports[0]` -> relatorio mais recente.
- `database.truthSources[0]` -> fonte da verdade.
- `database.methods[0]` -> metodo operacional.
- `database.procedures[0]` -> procedimento de trabalho.
- `database.jobs` -> fila e progresso.
- `database.heartbeat` -> atividade recente.
- `agents` -> transparencia tecnica.

## Sequencia de implementacao

### Fase 1: clareza sem mexer no backend

- Reorganizar `src/main.jsx` em componentes menores.
- Criar `ExecutiveSummary`, `ReasoningTimeline`, `ValueScoreboard`, `EvidenceCharts`, `DeliveredAssets` e `SystemActivity`.
- Reescrever textos de secao para linguagem de usuario externo.
- Preservar endpoints e dados atuais.
- Rodar `npm run build`.

### Fase 2: acabamento visual

- Reduzir bordas internas repetidas.
- Criar hierarquia forte para numeros e tese.
- Melhorar espacamento vertical.
- Dar pesos diferentes para blocos primarios e secundarios.
- Conferir desktop e mobile.

### Fase 3: interacao explicativa

- Adicionar estado selecionado para "risco ativo".
- Permitir abrir detalhe de relatorio/simulacao/procedimento.
- Filtrar fila por tipo de ativo.
- Destacar o ultimo job concluido.

### Fase 4: eficiencia visual e tecnica

- Fazer lazy-load dos graficos Recharts.
- Reduzir payload exibido nos blocos iniciais.
- Evitar renderizar listas longas quando a secao estiver fechada.

## Criterios de aceite

Uma pessoa externa deve conseguir responder estas perguntas sem explicacao oral:

1. Que problema o LUCA-AI esta atacando?
2. Qual risco esta mais importante agora?
3. Que evidencia sustenta isso?
4. O que o sistema produziu?
5. Qual valor pratico foi gerado?
6. Qual e o proximo passo?
7. O que os agentes estao fazendo em segundo plano?

## Resultado esperado

A tela deixa de parecer um painel interno de logs e passa a parecer uma central de decisao:

- primeiro explica o valor;
- depois mostra a evidencia;
- depois mostra o trabalho do agente;
- por ultimo mostra a telemetria tecnica.

