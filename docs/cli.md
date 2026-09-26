# CLI do LUCA-AI

O `luca` opera todas as 93 rotas HTTP do runtime atual e os cálculos locais usados pelas telas. Funciona com Node.js 22 ou superior, sem build e sem instalar dependências para os comandos do CLI. Não inicializa Express, React ou navegador.

## Começar

No checkout atualizado:

```bash
node bin/luca.js --help
node bin/luca.js commands
npm run cli -- health
```

Para usar `luca` de qualquer diretório, vincule o pacote local:

```bash
npm link --ignore-scripts
luca --version
luca health
```

O pacote é privado e não é publicado no npm. `npm link` pode instalar as dependências do app; chamar `node /caminho/LUCA-AI/bin/luca.js` dispensa isso. `npm run` imprime seu próprio cabeçalho; em pipelines use `luca`, `node bin/luca.js` ou `npm run --silent cli --`.

Para iniciar o servidor local, siga [operação](operacao.md): `npm ci`, `npm run build`, `npm run server`. O CLI também acessa um servidor já iniciado ou a instalação remota. O padrão é `http://127.0.0.1:4242`.

## Descobrir funções e entradas

```bash
luca --help
luca chat --help
luca chat attachments upload --help
luca commands team --pretty
luca commands --output commands.json
luca catalog endpoints
luca catalog tools
luca catalog audit
```

`commands` é o contrato completo do CLI, disponível offline, com schema `luca.cli.commands.v1`: nomes, argumentos posicionais, campos, tipos, obrigatoriedade, método, rota e autenticação. `catalog ...` consulta os catálogos operacionais do servidor, cujo escopo é diferente. A [referência gerada](cli-reference.md) lista todos os comandos.

Campos string são literais. Campos `json` aceitam JSON inline, `@arquivo.json` ou `-` para stdin. Campos `list` aceitam itens separados por vírgula; via `--data`, use arrays JSON. Booleanos aceitam `--enabled`, `--enabled=false` ou `--no-enabled`. Flags prevalecem sobre os campos do corpo. Não há merge profundo de objetos. `--query chave=valor` é repetível e escapa os valores.

```bash
luca mission context --context @contexto.json
luca team run --data @rodada.json --wait
cat rodada.json | luca team run --data - --wait
luca events list --trace-id 'rastreio-123' --limit 20
luca mission activate --description 'Revisar arquitetura' --dry-run
```

`--dry-run` constrói a requisição sem enviá-la e oculta senha/credenciais. Uploads e JSON por arquivo ainda são lidos para validar a entrada. Argumentos desconhecidos, IDs faltantes, JSON inválido e combinações incompatíveis falham antes da rede. O servidor continua responsável pela validação das regras do domínio e pelos limites de payload.

## Perfis e autenticação

```bash
luca profile set local --url http://127.0.0.1:4242
luca profile set producao --url https://luca-ai.com.br
luca profile use local
luca profile list
luca profile show
luca auth login --email agente@example.test --password-stdin < /caminho/privado/senha
luca auth session
luca health --profile producao
luca auth logout
```

`auth register --name NOME --email EMAIL --password-stdin` cria uma conta e inicia uma sessão. Para automação, injete `LUCA_PASSWORD` pelo gerenciador de segredos ou forneça senha via stdin; não existe flag `--password`. A senha não é persistida. `--data` também aceita o contrato de login com `email` e `password`, mas não coloque um literal sensível no histórico do shell.

O CLI obtém sua própria sessão pela API de login. Não lê nem copia cookies de navegadores. O cookie fica no arquivo de perfis com modo `0600`; diretórios novos são criados com `0700`. `profile list/show` ocultam o cookie. Logout revoga a sessão no servidor. `profile delete NOME` só remove os dados locais.

Config padrão: `${XDG_CONFIG_HOME:-~/.config}/luca/config.json`. Precedência:

| Configuração | Ordem |
| --- | --- |
| Arquivo | `--config`, `LUCA_CLI_CONFIG`, caminho padrão |
| Perfil | `--profile`, `LUCA_PROFILE`, perfil ativo, `local` |
| Origem | `--base-url`, `LUCA_URL`, URL do perfil |
| Sessão | `LUCA_SESSION` explícito, cookie do perfil da mesma origem |

`LUCA_SESSION` contém somente o valor do token, sem `luca_session=`. A origem deve conter protocolo, host e porta, sem caminho/query/credenciais. Uma URL diferente não herda o cookie salvo. Login com `--base-url` vincula o perfil selecionado à nova URL; `profile set` também remove o cookie se a origem mudar. Redirecionamentos HTTP não são seguidos. Crie perfis separados para ambientes diferentes.

`LUCA_MACHINE_TOKEN` só é enviado para `/api/deliberations` e seus jobs, onde o servidor já suporta Bearer. Não concede acesso às outras APIs. Nessas rotas ele tem precedência sobre a sessão. Todas as outras operações usam a conta autenticada e os controles de usuário/admin existentes.

## Missões, agentes e agenda

```bash
luca preflight
luca models
luca personas list
luca agents list
luca personas add arquiteto
luca agents config yume:arquiteto --enabled --model 'MODELO_DO_CATALOGO'
luca mission activate --title 'Inspeção' --description 'Analisar os dados fornecidos' --success 'Parecer com evidências'
luca mission signal --label temperatura --value 42 --unit C --severity warning --note 'Nova leitura'
luca supervisor start
luca state
luca events flows
luca mission report --output missao.json
luca supervisor pause
luca mission complete
luca schedule create --description 'Revisar dados diários' --interval-value 1 --interval-unit days --total-runs infinite
luca schedule list
luca schedule pause ID --reason 'Manutenção'
luca schedule resume ID
luca schedule cancel ID
```

`mission complete` devolve `approved`; sucesso HTTP não implica aprovação do encerramento. `--force` pula a revisão conforme o contrato existente. `heartbeat start/pause`, `agents run ID`, `agents clear`, `mission reset` e `harness smoke` também estão disponíveis; consulte a ajuda antes de alterar estado. `harness smoke` é o smoke do runtime e pode chamar integrações. Testes mutantes só podem rodar em ambiente local isolado, conforme o AGENTS.md.

## Chats, anexos, equipes e jobs

```bash
luca chat folders create --name 'Investigação'
luca chat sessions create --title 'Ocorrência 12' --no-seed-from-active
luca chat library
luca chat attachments upload SESSION_ID --file ./evidencia.csv
luca chat attachments get SESSION_ID ATTACHMENT_ID --output ./copia.csv
luca team run --mission 'Avalie as evidências' --slugs arquiteto,revisor --session-id SESSION_ID --attachment-ids ATTACHMENT_ID --wait
luca team status RUN_ID --wait
luca chat sessions get SESSION_ID --output conversa.json
luca chat share create SESSION_ID
luca chat share revoke SESSION_ID
```

Use os slugs reais retornados por `personas list`. Uma equipe aceita `parallel`, `workflow` ou `individual`, com os mesmos campos da API: `slugs`, `workflow`, `judgeSlug`, `visualSlug`, `depth`, `modelOverrides`, `sessionId`, `attachmentIds`, `domain`, `domainOverride` e `traceId`. Para configurações grandes, prefira `--data @rodada.json`.

```json
{
  "mission": "Comparar as alternativas e registrar o parecer",
  "mode": "individual",
  "slugs": ["arquiteto", "revisor"],
  "judgeSlug": "juiz",
  "depth": 2,
  "modelOverrides": {},
  "traceId": "revisao-123"
}
```

Templates podem ser consultados/criados/editados/reordenados/apagados. Exemplo: `luca templates create --kind individual --template '{"label":"Revisão","participants":["arquiteto"],"judge":"juiz"}'`. O tipo `team` usa `assignments` por papel e `models` por slug. `templates reorder TIPO --ids id1,id2,...` exige todos os IDs desse tipo.

Para deliberações, envie o [ContextBundle v1](../server/deliberations/README.md):

```bash
luca deliberations create --objective 'Decidir a correção' --team '{"mode":"parallel","slugs":["arquiteto"]}' --artifacts '[{"id":"nota","kind":"note","content":"Evidência selecionada"}]' --wait
luca deliberations get DELIBERATION_ID --wait
```

Sem `--wait`, a criação devolve imediatamente o ID aceito. Com `--wait`, stdout recebe apenas o resultado final e stderr recebe o ID e o comando de retomada. Defaults: requisição 30 s, polling 1 s, espera total 30 min. Ajuste com `--timeout`, `--interval` e `--wait-timeout`, todos em **milissegundos**. `Ctrl+C` encerra o acompanhamento; não cancela o job no servidor. Cancelamento remoto não existe nessas APIs.

O CLI nunca repete POST/PUT/PATCH/DELETE automaticamente. Durante espera de jobs, apenas GETs com falha de rede ou HTTP 429/502/503/504 são repetidos até o limite. Se o envio inicial der timeout, consulte a sessão/estado antes de reenviar: não é possível saber se o servidor aceitou uma mutação cuja resposta se perdeu. Não há promessa de idempotência para deliberações; seus jobs em memória desaparecem após reinício.

## SOMPO e laboratório

```bash
luca sompo telemetry
luca sompo fleet
luca sompo history --fonte simulacao --trator SIM-001 --janela-min 30
luca sompo scenarios --output cenarios.json
luca sompo simulate --scenario normal --elapsed-ms 2000 --output simulacao.json
luca sompo episodes start --kind roteiro --trator SIM-001 --scenario-id normal --scenario-label 'Ensaio CLI'
luca sompo simulate --scenario normal --elapsed-ms 2000 | luca sompo simulation record --data -
luca sompo simulation record --data @amostras.json
luca sompo episodes get EPISODE_ID
luca sompo episodes finish EPISODE_ID --status complete
luca sompo export --episode-id EPISODE_ID --format csv --output telemetria.csv
luca lab inspect --csv telemetria.csv
luca lab replay --csv telemetria.csv --elapsed-ms 5000
luca lab cases import --csv telemetria.csv --name 'Inspeção'
luca lab cases analyze CASE_ID --focus 'Examinar a sequência de eventos'
luca lab cases conclude CASE_ID --category inconclusive --observations 'Evidências insuficientes' --action 'Solicitar inspeção'
luca lab cases get CASE_ID --output caso.json
luca lab report --data @caso.json --author 'Operador' --output relatorio.html
```

`sompo simulate` é offline e não grava amostras; retorna `{snapshot,brief,samples}`. Rodovia e máquinas agrícolas reutilizam os mesmos módulos do painel. Pode receber `--data '{"observedAt":"2026-01-01T00:00:00Z","connectedAt":"2026-01-01T00:00:00Z","controls":{"speedKph":20}}'`; controles manuais se aplicam aos cenários rodoviários. `sompo simulation record` espera `{samples:[...],episodeId?}` com amostras raw (`trator`, `timestamp`, `distancia`, `temperatura`, `umidade`, aceleração/rotação e flags), como as devolvidas no campo `samples` de `sompo simulate`. `sompo episodes frames upload ID --frames @frames.json` aceita `[{dataUrl,offsetMs,fase,label}]`; `frames get ID SEQ --output quadro.png` recupera o arquivo.

Risco: `sompo risk assess --source-kind simulation --raw @sensores.json --context '{"operation":"...","region":"...","incidents":0}'` registra a avaliação; com `firebase`, o servidor lê o sensor físico. `sompo risk calculate --data @avaliacao.json` calcula offline usando `{snapshot,context}`. `sompo normalize --data @sensores.json` normaliza o payload raw do ESP32. Unidades, limitações e formato: [SOMPO](sompo.md).

Casos CSV podem receber `--metadata @manifest.json --map @mapa.geojson --schema @schema.json`. `lab inspect/replay` são offline. `lab cases import` persiste via API. Para datasets JSON exportados do SOMPO: `luca lab convert --data @dataset.json --output convertido.csv`. O relatório HTML reutiliza o mesmo gerador da interface, com evidências e conclusões escapadas.

`lab cases analyze` é uma chamada síncrona, com timeout padrão de 10 min. A borda pode encerrar a conexão antes disso; consulte `lab cases get ID` para verificar a análise já iniciada antes de tentar outra. Não há endpoint de cancelamento de análise ou exclusão de caso.

## Sensor, geofencing e sonolência

```bash
luca sensor scenarios
luca sensor sample --scenario encosta --parameter 15 --time 3
luca geofence evaluate --data @geofence.json
luca drowsiness evaluate --data @observacoes.json --sensitivity normal
```

Sensor usa **segundos** em `--time` e a unidade indicada em `sensor scenarios` para `--parameter`. Retorna leitura, timeline e pacote de telemetria. Geofencing recebe `{position:{x,z,headingDeg?,speedKph?,rollDeg?,pitchDeg?},rules,polygons,machine?}` com coordenadas locais e as regras do [módulo de geofencing](geofencing.md).

Sonolência recebe `{"samples":[{"at":0,"left":0.8,"right":0.8},{"at":250,"left":0.8,"right":0.8}]}`. `at` é em milissegundos; os scores ficam entre 0 e 1. `{"at":500,"sample":null}` representa rosto perdido. O comando testa o monitor temporal, incluindo histerese e alarme lógico. Não abre câmera, não executa MediaPipe, não avalia a precisão da detecção e não emite áudio. Renderização 3D, controles visuais, acesso físico à câmera e som continuam sendo testes de navegador descritos nos documentos de cada módulo.

## Administração e diagnóstico

```bash
luca admin overview
luca admin users list --search example --sort activity_desc
luca admin report --limit 10
luca admin users library USER_ID
luca admin users session USER_ID SESSION_ID
luca admin users impersonate USER_ID
luca auth stop-impersonation
luca admin personas list
luca admin personas set SLUG --visible=false
luca admin personas reset SLUG
luca api GET /api/state
luca api POST /api/mission/context --data @contexto.json
```

Suporte/impersonação gira o cookie do perfil, preservando o fluxo de retorno ao admin. Overrides de personas são locais ao LUCA; não escrevem no Yume. O comando `api` aceita somente caminhos `/api/` da origem selecionada, nunca URLs arbitrárias, e usa o mesmo transporte/autenticação. Não expõe shell remoto ou bypass de permissão.

## Saída e erros para agentes

Respostas JSON preservam a estrutura da API. `--pretty` indenta; `--output arquivo` salva o conteúdo e devolve `{ok,output,bytes}`. Anexos, avatars, frames, artefatos, relatórios e CSV pedem `--output`; `--output -` envia bytes para stdout. Falha HTTP não grava um arquivo de erro no destino solicitado.

`state --watch --count 5 --interval 1000` e demais GETs JSON emitem **snapshots completos em NDJSON**, um por linha. Não são um stream de eventos incrementais: podem repetir eventos já observados. O padrão é dez snapshots; não há observação infinita implícita. `--watch` não combina com `--pretty`, `--output` ou `--wait`.

Erros saem em stderr como `{"ok":false,"error":{"code":"...","message":"...","status":401}}`. `status`, `response`, `result`, `id` e `resume` aparecem quando aplicáveis. Não parseie texto humano para decidir sucesso: use código de saída e campos JSON.

| Exit | Significado |
| --- | --- |
| 0 | Operação concluída/aceita; examine campos de domínio como `approved` |
| 1 | Erro HTTP/API, resposta inválida ou fallback HTML |
| 2 | Uso/entrada/configuração/arquivo inválido |
| 3 | HTTP 401/403: sessão ausente/expirada ou permissão insuficiente |
| 4 | Rede, timeout HTTP ou limite de espera; não implica cancelamento remoto |
| 5 | Job terminado com `status=failed` |
| 130 | Acompanhamento/requisição interrompido |

## Testar e manter

```bash
npm run test:cli
npm test
npm run typecheck
npm run build
npm run cli:docs
node cli/reference.js --check
```

Os testes de processo criam um servidor real em loopback, contas/dados descartáveis e integração externa bloqueada. Também exercitam o transporte com HTTP controlado: redirecionamentos, HTML, arquivos, timeout, recuperação de polling e interrupção. Nenhum teste usa credenciais ou dados da produção.

Para adicionar uma rota, inclua o comando em `cli/catalog.js`, regenere a referência e teste um fluxo observável. `tests/cli.test.js` compara todas as rotas `/api/` declaradas em `server/**/*.js` com o catálogo nos dois sentidos. `cli/main.js` resolve entrada/execução; `client.js` concentra rede/jobs; `config.js` concentra perfis/sessões; `local.js` importa os cálculos de domínio sob demanda. O pacote de release inclui `bin/` e `cli/`.
