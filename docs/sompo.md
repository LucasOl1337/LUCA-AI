# SOMPO

Fazenda real no Laboratório (`/sompo`): [dados, licenças, uso, outra fazenda e limites do relevo](./laboratorio-fazendas.md).

Leia SOMENTE ao mudar telemetria SOMPO, contrato ESP32/Firebase ou o painel do trator.

## Contrato

Origem no codigo: `server/sompo-telemetry-source.js`.

```text
https://trator-monitoramento-default-rtdb.firebaseio.com/trator/001/sensores.json
```

Campos no no (sem nivel extra; `POST` no Firebase criaria filho e quebraria o leitor):

`trator`, `timestamp` (muda a cada publicacao), `distancia`, `temperatura`, `umidade`, `pitch`, `roll`, `aceleracaoX/Y/Z`, `rotacaoX/Y/Z`, `riscoColisao`, `riscoInclinacao`.

Unidades nao vem no JSON — o painel mostra convencao, nao fato.

## Fluxo

```text
ESP32 -> Mosquitto -> Firebase -- SSE --> Express -- SQLite -- /ws autenticado --> painel + gêmeo 3D
                                                     ^
Simulador 3D -- POST /api/sompo/telemetry/simulation --+
```

O navegador nunca fala com o Firebase. Uma assinatura REST Streaming no Express (`put`/`patch`, backoff, snapshot preservado, `stale` apos 15s sem mudanca). `GET /api/sompo/telemetry` le essa memoria; nao abre outro GET.

No modo Firebase, `SompoTruckSimulator` funciona como gêmeo digital somente de leitura: `pitch` e `roll` orientam o caminhão, `rotacaoZ` alimenta o giro relativo, `distancia` posiciona o obstáculo e as flags alteram o estado visual. A cena consome o mesmo snapshot do painel via `/ws`; ela nao abre conexão própria e nao envia comandos ao equipamento.

Historico: o Express grava amostras em SQLite (`LUCA_DATA_DIR/sompo-telemetry.db`, default `.luca/sompo-telemetry.db`) via `node:sqlite`. O banco e global, nao por workspace — o feed e do dispositivo. `GET /api/sompo/telemetry/history` le a janela (`fonte=firebase|simulacao`, `janelaMin` default 15 / max 240, `trator` default `001`). O briefing da bancada inclui essa linha do tempo.

Episodios: um roteiro do simulador (botao "Simular colisao") grava um caso isolado. Fluxo: `POST /api/sompo/telemetry/episode` (`{kind:'colisao', trator?, scenarioLabel?}`) abre o episodio; os lotes de `POST /api/sompo/telemetry/simulation` levam `episodeId` (400 se inexistente ou fora de gravacao); `POST /api/sompo/telemetry/episode/:publicId/finish` fecha; `GET /api/sompo/telemetry/episode/:publicId` devolve TODAS as amostras em ordem cronologica + resumo com fases (aproximacao/impacto/pos-impacto, impacto = pico de |aceleracao|) e amostras-chave com decimacao adaptativa (teto 30). Episodio `recording` sem finish ha mais de 10 min vira `aborted` na leitura. Migracao: a coluna `episode_id` em `sompo_telemetry_samples` e adicionada de forma idempotente (`PRAGMA table_info` + `ALTER TABLE`) — banco existente da producao migra sem perda. A bancada analisa o episodio inteiro via `buildSompoEpisodeMission` (CTA "Analisar colisao na bancada").

Frames do episodio (evidencia visual): durante o roteiro de colisao o simulador captura ate 5 frames do canvas em momentos-chave (`SOMPO_COLLISION_FRAME_MOMENTS`: inicio, meia aproximacao, impacto no pico, pos-impacto, final), JPEG ~640px q0.7, captura sincrona no mesmo rAF do render (sem `preserveDrawingBuffer`). Upload em `POST /api/sompo/telemetry/episode/:publicId/frames` — 1 frame por request (limite de body do Express e 1mb), so com episodio `recording` ou `complete` ha menos de 10 min (janela de graca), teto de 6 frames/episodio e ~300KB/frame, assinatura de bytes conferida (jpeg/png); violacao responde 400 com codigo claro. Binario em `LUCA_DATA_DIR/sompo-episodes/<publicId>/frame-<seq>.jpg`, metadados na tabela `sompo_telemetry_episode_frames` (migracao idempotente), leitura autenticada em `GET .../frames/:seq`. O `GET` do episodio devolve os frames (metadados + URL). Na bancada, a SompoPage baixa e reenvia os frames como anexos de chat da sessao (orcamento: 4 anexos por rodada — com 5 frames, prioridade impacto > abertura > fechamento; o nao anexado e declarado na missao, nunca omitido) e `buildSompoEpisodeMission` ganha a secao "Evidencia visual" mandando os agentes cruzarem imagem x telemetria. Episodio sem frames continua valido: a missao diz explicitamente que nao ha evidencia visual. Falha de upload dos frames nao derruba o episodio — o painel avisa e a analise segue so com dados.

Peca visual do episodio: a arte deve PROVAR uma resposta humana ("o equipamento avisou a tempo?"), nao redesenhar numeros do texto. A missao do episodio embute um bloco de maquina (`SOMPO_EPISODE_VISUAL_DATA_MARKER`, serie compacta das amostras-chave + impacto + instante da flag) e a etapa visual (`materializeVisualPack`) desenha deterministicamente UMA linha do tempo SVG — distancia (cm) e aceleracao (em g; m/s² citado uma unica vez) segundo a segundo, com marcadores nomeados de inicio, IMPACTO e disparo da flag; a faixa entre os dois ultimos mostra o atraso do alerta sem ler numero. Manchete = achado (ex.: "O alerta chegou 2,3 s depois da batida"). Charts do plano da persona sao descartados nesse caso (barra de media por fase e redundancia sao proibidas pelo contrato na missao); a segunda peca e no maximo um cartao de decisao em frases, sem repetir os numeros do grafico.

Sem equipamento, o painel tem simulador no navegador (`SompoTruckSimulator`). Firebase continua o padrao. O simulador nao escreve no Firebase e nao substitui o snapshot do WebSocket. Enquanto ativo, acumula amostras e envia lotes ao Express (`POST /api/sompo/telemetry/simulation`, max 50) so para o historico SQL. `source.kind` (`firebase` ou `simulation`) vai na tela e no briefing.

Producao exige Node >= 22.5 por causa de `node:sqlite`. Falha de SQLite nao e engolida: o endpoint responde erro claro.

So sobe dado. O LUCA nao escreve no Firebase nem no Mosquitto. Canal de descida exige contrato no firmware e credencial restrita — sem isso, nao invente comando bidirecional.

## Eixos e calibracao

Na cena, o caminhao aponta para `+X` e `+Y` e para cima. O gemeo Firebase compoe a pose na ordem Euler `YZX` (guinada, arfagem, rolagem), para a rolagem permanecer no referencial do veiculo quando pitch e roll aparecem juntos. A guinada ignora ruido de ate 1,5 graus/s — zona morta que impede a deriva com o caminhao parado — e o rumo FICA onde a curva parou: nao ha recentramento automatico. Um decaimento de volta ao zero desfaz a curva poucos segundos depois dela acontecer, e um gemeo que desfaz a curva nao acompanha a direcao do caminhao fisico, que e o unico servico que ele presta. Sem magnetometro no firmware nao ha norte absoluto, entao a deriva residual de curvas reais e do operador: **Recentrar guinada**, com o caminhao apontado para a seta ciano.

O firmware do ESP32 nomeia `pitch` e `roll` ao contrario dos eixos do veiculo: o campo `pitch` e a rolagem do caminhao, e o campo `roll` e a arfagem. Medido com o equipamento na mao em 2026-08-26 (inclinar para frente fazia o gemeo girar para o lado). A correcao e na entrada (`sensorReadingToPose`): as variaveis locais `pitch`/`roll` seguem o caminhao, nao o nome do campo. O mapeamento de cena (`arfagem → Z`, `rolagem → X`, ordem `YZX`) nao muda. O toggle **Trocar arfagem ↔ rolagem** desfaz essa correcao.

O sinal e a montagem fisica do ESP32 so podem ser confirmados com o equipamento na mao. Abra **Calibracao de eixos** no gemeo digital e use inverter arfagem, rolagem ou guinada, ou trocar arfagem por rolagem se precisar desfazer a correcao de entrada. A mudanca e imediata, fica salva neste navegador (`luca:sompo-axis-calibration:v2`) e pode ser removida com **Voltar ao padrao**. A seta ciano no piso identifica a frente `+X` para comparacao com o caminhao real.

## Pegadinha

O no ja aceitou escrita REST anonima. Nao faca PUT/PATCH de prova no Firebase real sem combinar: um PUT substitui o snapshot e aparece no painel na hora.

## Score contextual e qualidade dos dados (auditoria de setembro/2026)

`shared/sompo-risk.js` porta a regra explícita de `risco.py` da entrega acadêmica, versão `academic-context-v1`: operacional 60%, ambiental 40%. Tipo de operação, condição da região e incidentes são declarados no painel; temperatura ambiente e umidade vêm da origem selecionada. Dados ausentes, inválidos, desatualizados ou desconectados não produzem score. A regra não incorpora flags de colisão/inclinação e não é probabilidade atuarial; flags continuam visíveis independentemente do número.

`POST /api/sompo/risk` recebe `sourceKind`, `context` e, somente para simulação, `raw` no contrato dos sensores. A origem física é relida pelo servidor. O backend recalcula e grava em `sompo_risk_assessments` snapshot, avaliação, versão e cobertura pendente, associados à conta. `GET /api/sompo/risk?trator=...&fonte=firebase|simulacao` retorna as últimas 20 avaliações daquela conta/equipamento/origem. A interface permite recuperar e exportar o JSON após reload.

Campos numéricos desconhecidos permanecem null no painel, no histórico e nos dados visuais; flags passam a aceitar null. Colunas aditivas `collision_known` e `inclination_known` preservam a distinção: registros anteriores sem metadado de presença não são promovidos a confirmação de segurança. Nenhuma tabela antiga é removida.

O cliente marca o snapshot físico como stale após 15 segundos sem atualização e na queda do WebSocket. O gêmeo para de integrar a guinada quando o sinal não é atual; distância desconhecida oculta obstáculo/raio, atitude incompleta preserva a pose. Eixos, sinais e controles de calibração foram mantidos.

O roteiro sintético recupera pontos agendados caso o temporizador do navegador atrase: 45 amostras de 0 a 22 s. O fechamento aguarda os envios em voo. Quadros registram o instante do snapshot renderizado, não um instante ideal de captura; perdas/atrasos e uploads parciais são informados. O último episódio selecionado sobrevive ao reload na mesma sessão do navegador; não é catálogo permanente de episódios.

Para operação isolada, `LUCA_SOMPO_OFFLINE=true` desliga a fonte Firebase inclusive em `read()`. O roteiro e os limites de validação estão em [sompo-demo.md](./sompo-demo.md).

A deduplicação das amostras é por origem/equipamento/**episódio**. Episódios distintos podem conter o mesmo instante, preservando a independência de ensaios simultâneos. Reabrir o banco reconstitui essas chaves sem misturar as gravações.
