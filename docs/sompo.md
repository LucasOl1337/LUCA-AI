# SOMPO

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

Sem equipamento, o painel tem simulador no navegador (`SompoTruckSimulator`). Firebase continua o padrao. O simulador nao escreve no Firebase e nao substitui o snapshot do WebSocket. Enquanto ativo, acumula amostras e envia lotes ao Express (`POST /api/sompo/telemetry/simulation`, max 50) so para o historico SQL. `source.kind` (`firebase` ou `simulation`) vai na tela e no briefing.

Producao exige Node >= 22.5 por causa de `node:sqlite`. Falha de SQLite nao e engolida: o endpoint responde erro claro.

So sobe dado. O LUCA nao escreve no Firebase nem no Mosquitto. Canal de descida exige contrato no firmware e credencial restrita — sem isso, nao invente comando bidirecional.

## Pegadinha

O no ja aceitou escrita REST anonima. Nao faca PUT/PATCH de prova no Firebase real sem combinar: um PUT substitui o snapshot e aparece no painel na hora.
