# Demonstração local Sompo

Use Node 22.5 ou superior (validado com 24.14.0) e abra um terminal em `LUCA-AI-main`.

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run demo:sompo
```

Abra [a demonstração local](http://127.0.0.1:4243/sompo). Crie uma conta de demonstração na tela de acesso. Não use dados pessoais ou credenciais de produção.

Esse comando usa um diretório temporário **novo em cada inicialização**, imprime seu caminho, não lê o Firebase e não inicia o monitor Python. Kamui e o roteador de IA ficam indisponíveis intencionalmente; a demonstração de telemetria, score e episódios funciona sem eles. Chamadas fetch externas do processo são bloqueadas. A porta pode ser alterada com `LUCA_DEMO_PORT`. O servidor fica limitado a 127.0.0.1.

## Roteiro de demonstração

1. **Sem equipamento:** a aba física apresenta ausência de dados e score indisponível. Não significa risco zero.
2. **Operação normal:** escolha Simulador 3D. Em contexto, selecione Trabalho em campo, Rural e 0 incidentes. Com temperatura ~27 °C e umidade ~48%, score = **12/100**. Confira 15×60% da operação e 5×60% da região: soma 12. Essa classificação não equivale a segurança operacional.
3. **Auditabilidade:** clique Registrar avaliação; abra Avaliações registradas e baixe a evidência JSON. Ela contém snapshot, contexto declarado, fatores, versão e cobertura pendente. Recarregue a página: a avaliação deve continuar disponível para a mesma conta, equipamento e origem.
4. **Alerta independente:** escolha Obstáculo frontal no simulador. A flag sintética deve ganhar destaque mesmo com score contextual baixo. O painel não envia comando nem confirma buzzer/LED físicos.
5. **Maior exposição contextual:** escolha Proximidade de água, Alagada e 5 incidentes. A regra dá 67 com ambiente ameno; elevar temperatura para ≥38 e umidade para ≥90 leva a **91/100**. Pesos e limites são acadêmicos; não são parâmetros oficiais Sompo.
6. **Episódio:** clique Simular colisão e aguarde 22 segundos mais o envio. O roteiro grava 45 amostras de 0 a 22.000 ms a cada 500 ms. Em navegador com WebGL/renderização adequada, captura cinco quadros. A falta de quadros ou falha de envio aparece explicitamente e não é substituída por imagem inventada.
7. **Recuperação:** recarregue a aba. O último episódio selecionado é preservado na sessão do navegador; a bancada relê os dados no servidor. “Usar leitura atual” desmarca o episódio sem apagar evidências. Abrir uma nova demo cria outro banco, portanto não recupera episódios do banco temporário anterior.
8. **Bancada:** selecione a equipe e Analisar colisão na bancada. A jornada prepara uma sessão, envia até quatro quadros (priorizando os mais relevantes), declara o quadro não anexado e inclui a linha do tempo. No modo isolado, a IA não consegue produzir um parecer real; o sucesso da preparação não deve ser apresentado como validação do conteúdo gerado.

## Verificações reproduzíveis

```powershell
npm run typecheck
npm run build
$env:LUCA_DATA_DIR = Join-Path $env:TEMP ('luca-tests-' + [guid]::NewGuid())
$env:LUCA_SOMPO_OFFLINE = 'true'
$env:NODE_OPTIONS = '--import=./scripts/offline-network.mjs'
npm test
```

Não sobrescreva ROUTER_BASE_URL/KAMUI_BASE para executar a suíte: alguns testes verificam os defaults. As integrações de rede são substituídas nos testes; o preload bloqueia fetch remoto não simulado. O teste de event-log cria diretório temporário próprio.

Com o servidor da demo ativo na porta 4243 e Microsoft Edge instalado:

```powershell
node scripts/sompo-browser-check.mjs
node scripts/sompo-browser-states.mjs
```

Os scripts usam Playwright já presente nas dependências, contas temporárias e apenas loopback. Salvam screenshots e resultados em `docs/audit/`. O segundo injeta uma fixture de WebSocket **somente no navegador**, para validar frescor, ausência e falhas sem adulterar nenhuma fonte física.

## O que os resultados comprovam

- Score determinístico e contribuições, validações de entrada e cobertura pendente.
- Persistência e recuperação de avaliações por conta, fonte e equipamento.
- Telemetria/flags incompletas, expiração do snapshot e erro de gravação.
- Episódio sintético, cronologia e recuperação dos quadros disponíveis.
- Renderização desktop e celular (390 px), foco de teclado e mensagens explícitas.

Os testes não comprovam homologação agrícola, latência do ESP32, acerto atuarial, prevenção física, leitura de apólice ou precisão dos agentes. Consulte a [matriz de lacunas](./sompo-gap-analysis.md) e o [log com resultados reais](./sompo-execution-log.md). Não foi feito commit, push ou deploy.

Também disponível: `node scripts/sompo-browser-frame-failure.mjs`, que provoca falha no segundo upload de quadro e verifica a preservação das amostras e do quadro já recebido. A suíte geral encerrou com 597 testes, 594 aprovados e três falhas anteriores identificadas no log; não deve ser descrita como inteiramente verde.
