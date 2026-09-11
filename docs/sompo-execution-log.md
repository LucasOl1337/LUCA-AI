# Execução autônoma — 2026-09-06

## Estado inicial e isolamento
- Pedido integral lido; AGENTS.md, INDEX, README, docs/sompo e operacao lidos. Sem .git no checkout: `git status --short` falhou antes de qualquer edição. Não haverá commit/push/deploy.
- Node v24.14.0, compatível com node:sqlite. node_modules ausente. Primeira instalação falhou no cache externo; nova tentativa com cache .tmp/npm-cache.
- 115 fontes locais inventariadas por SHA-256 em docs/audit/inventory-sha256.txt. PDFs extraídos por página com pypdf; notebooks lidos como JSON sem execução; DOCX extraído como XML. Referências externas preservadas.
- Não executar runtime padrão: Firebase inicia automaticamente. Preparar modo local sem conexões externas e dados temporários antes da validação.

## Plano priorizado
1. Corrigir ausência de dados convertida em zero e flags ausentes em falso no pipeline, histórico e briefing; manter eixos/calibração.
2. Integrar regra acadêmica contextual (60% operacional/40% ambiental) com entradas explícitas, fatores, versão, limites e registro SQLite. Não inferir região/operação/incidentes do sensor.
3. Melhorar UX/UI da jornada de equipamentos: estado operacional antes do 3D, formulário de contexto, score explicável e avaliações recuperáveis; preservar casos de lavoura como complementares.
4. Separar cobertura pendente, fatos, hipóteses e limitações nas missões; validar episódios/frames existentes.
5. Executar baseline e verificações finais, integração HTTP/SQLite e navegador local desktop/mobile. Documentar lacunas de campo, apólice e IA externa.

## Evidências iniciais
- Sompo original, Apresentação Institucional, pp.12–16: equipamentos, alertas, score por contexto, drivers e trilha auditável; ranking e políticas são necessidades adicionais ainda não comprovadas.
- Matriz derivada afirma tudo concluído; relatório revisado da raiz pp.2–5 reconhece score pendente e campo parcial. Nenhuma afirmação de homologação será adotada.
- Python risco.py existe nas entregas, não é importado pelo Express. DDL T_* é atividade separada; aplicativo usa sompo_telemetry_samples em SQLite.
- Normalização e leitura SQL chamam Number(null), produzindo 0. Flags desconhecidas viram false. Caso de lavoura instrui não usar linguagem de material fictício: inadequado para dados sintéticos.

## Marco de implementação e validação
- Dependências instaladas (403 pacotes) após autorização técnica de rede. Sem dependências novas; npm ci usa lockfile existente.
- Correção de nulos/flags no contrato, SQLite e resumos; migrações aditivas collision_known/inclination_known conservam registros antigos como qualidade não confirmada.
- Score contextual shared/sompo-risk.js: paridade com os pesos Python 60/40, contexto explícito e classificação acadêmica. Tabela sompo_risk_assessments registra snapshot, entradas, fatores, versão, instante e cobertura pendente; avaliações isoladas por conta/origem/equipamento. Backend recalcula, não aceita score declarado nem snapshot físico do navegador.
- UX: sinais/alertas primeiro, contexto e contribuições em seguida, reconstrução/IA ao final. Tela responsiva, foco de teclado, ação de registro e recuperação/download de evidências. Casos complementares declarados sintéticos.
- Queda de WebSocket invalida estado de conexão; relógio da página expira snapshots físicos congelados após 15 s. Valores antigos não liberam score/registro.
- Demo local nova a cada execução, loopback 4243, dados temporários, Firebase desabilitado, Kamui/Router apontados para porta inativa, bloqueio de fetch externo. Monitor Python omitido na demo; erro de spawn agora não derruba runtime normal.
- Build aprovado com aviso de chunks >500 kB (Three.js já separado por lazy loading). Typecheck aprovado.
- Navegador Edge/Playwright: sem dados, simulação normal score 12, registro+reload, obstáculo crítico, episódio de colisão e mobile 390px sem overflow aprovados. Fixture WebSocket local: score 91, erro HTTP de gravação, stale e flags incompletas aprovados sem erros JS.
- Suite completa inicial com dependências: 585/593, 8 falhas. Uma era texto alterado do cabeçalho; uma causada pelo override de URL do ambiente de teste; três eram teste de log escrevendo .luca apesar de LUCA_DATA_DIR. Teste de log passou a criar diretório temporário próprio, preservando asserções. As três restantes já aparecem no baseline: auth-visual-tokens, luca-chat-run-error-cta e catálogo TARS/Yume ausente. Não houve redução de expectativas para escondê-las.
- Baseline anterior à instalação completa está registrado, mas falhas ERR_MODULE_NOT_FOUND não são diagnóstico do produto. Checkout sem Git impede baseline imutável de commit; nenhuma validação de produção foi executada.

## Encerramento técnico — 09/09/2026

### Correções de detalhe e resultado final
- Roteiro sob carga: `sompoCollisionSampleOffsets` mantém os pontos sintéticos de 500 ms, inclui 0 e 22.000 ms e aguarda lote em voo antes de fechar. Navegador recuperou exatamente **45 amostras e 5 quadros**.
- Captura: o primeiro frame parte do snapshot inicial do roteiro (não do cenário anterior). Metadados usam o instante do snapshot renderizado; janela de impacto não é rotulada como prova exata do pico. Upload parcial informa contagem real. Fixture de falha no segundo upload comprovou **45 amostras preservadas + 1 quadro recuperável**, com aviso 1/5.
- Episódios concorrentes: teste regressivo reproduziu perda (`0 !== 1`) ao gravar o mesmo timestamp em dois episódios. A chave de deduplicação passou a incluir episode_id; o mesmo instante pode existir em episódios diferentes e continua deduplicado dentro de cada um, inclusive após reabrir SQLite.
- Gêmeo: desconexão/stale não continua integrando a última velocidade angular; leitura incompleta não nivela a pose, e distância ausente oculta obstáculo/raio. Contrato de eixos e calibração não mudou.
- Último episódio selecionado fica em sessionStorage; reload mantém o destino da análise. A ação Usar leitura atual desmarca sem apagar evidência. Não é catálogo permanente de episódios.
- Contexto é limpo ao alternar manualmente entre origem física/simulada, evitando transferir implicitamente o cenário para a máquina.
- Falha de spawn do monitor Python não derruba o Express; demo não inicia esse subprocesso. A identificação de runtime local reconhece loopback em porta diferente de 4242, sem anunciar 9Router conectado apenas porque o Express respondeu.
- README corrigido: dev:full serve o build existente, não inicia Vite junto. Roteiro isolado e matriz entregues.

### Validações finais

| Verificação | Resultado e evidência |
|---|---|
| Node | v24.14.0, node:sqlite funcional |
| npm run typecheck | Aprovado; docs/audit/typecheck.txt |
| npm run build | Aprovado; docs/audit/build.txt. Aviso de chunks maiores que 500 kB mantido visível; não reduzido artificialmente |
| npm test | **597 testes: 594 aprovados, 3 falhas preexistentes**; docs/audit/final-tests.txt |
| Funções/HTTP/SQLite Sompo | Nulos, score, fatores, conta/origem, reabertura, frames, migração, episódios e deduplicação cobertos por testes comportamentais |
| Navegador desktop/mobile | Fluxo principal aprovado, 45 pontos, 5 quadros, reload de avaliação e episódio, 390px sem overflow; docs/audit/browser-flow.txt |
| Encaminhamento para bancada | **4 anexos** enviados à sessão, quadro omitido declarado e cobertura pendente no briefing. Conteúdo final da IA não validado; provedor offline |
| Estados de erro | Score alto 91, erro ao salvar, stale bloqueado, flags incompletas e ausência de erros JS; docs/audit/browser-states.txt |
| Upload parcial | Falha induzida no segundo frame, episódio complete com 45 amostras e 1 quadro; docs/audit/browser-frame-failure.txt |
| Hardware/atuadores/Firebase real/IA externa | Não executados; sem credenciais nem equipamento nesta execução |

As três falhas remanescentes aparecem no baseline anterior às edições de UI:
1. `auth-visual-tokens.test.js`: asserção de token CSS `--l-navy-deep` ausente no bloco de autenticação.
2. `luca-chat-run-error-cta.test.js`: asserção textual de “Atualizar sessão” no trecho de tratamento de erro da bancada.
3. `tool-catalog.test.js`: espera catálogos de projetos TARS/Yume que não acompanham este checkout.

Não foram removidas nem afrouxadas essas verificações. Os testes textuais de cabeçalho Sompo e aviso de frames foram atualizados para a nova cópia, preservando as demais asserções; o comportamento correspondente foi validado no navegador.

### Continuidade
- [Matriz de requisitos/US](./sompo-gap-analysis.md), [inventário de versões](./sompo-source-inventory.md), [como demonstrar](./sompo-demo.md).
- `relatorioSP3AIC` é PDF sem extensão, 12 páginas, também lido; não é duplicata binária dos outros PDFs. Reitera o recorte de 75% e score/campo pendentes. Extrações de leitura foram guardadas em `.tmp/source-extractions`; materiais externos não foram alterados.
- Pendências externas: firmware realmente implantado, vídeo/log de ativo agrícola, latência do alerta, validação atuarial, janela comparável de incidentes, apólice e regras contratuais. Ranking de frota, políticas por equipamento, push, CAN/Edge AI seguem backlog, não improvisados nesta execução.
- Alterações restritas ao aplicativo e à sua documentação/testes/scripts. `worker/`, Yume, Firebase, Mosquitto e hardware não receberam escrita. Não houve commit, push nem deploy.
