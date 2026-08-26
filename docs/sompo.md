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
ESP32 -> Mosquitto -> Firebase -- SSE --> Express -- SQLite -- /ws autenticado --> painel
                                                     ^
Simulador 3D -- POST /api/sompo/telemetry/simulation --+
```

O navegador nunca fala com o Firebase. Uma assinatura REST Streaming no Express (`put`/`patch`, backoff, snapshot preservado, `stale` apos 15s sem mudanca). `GET /api/sompo/telemetry` le essa memoria; nao abre outro GET.

Historico: o Express grava amostras em SQLite (`LUCA_DATA_DIR/sompo-telemetry.db`, default `.luca/sompo-telemetry.db`) via `node:sqlite`. O banco e global, nao por workspace — o feed e do dispositivo. `GET /api/sompo/telemetry/history` le a janela (`fonte=firebase|simulacao`, `janelaMin` default 15 / max 240, `trator` default `001`). O briefing da bancada inclui essa linha do tempo.

Sem equipamento, o painel tem simulador no navegador (`SompoTruckSimulator`). Firebase continua o padrao. O simulador nao escreve no Firebase e nao substitui o snapshot do WebSocket. Enquanto ativo, acumula amostras e envia lotes ao Express (`POST /api/sompo/telemetry/simulation`, max 50) so para o historico SQL. `source.kind` (`firebase` ou `simulation`) vai na tela e no briefing.

Producao exige Node >= 22.5 por causa de `node:sqlite`. Falha de SQLite nao e engolida: o endpoint responde erro claro.

So sobe dado. O LUCA nao escreve no Firebase nem no Mosquitto. Canal de descida exige contrato no firmware e credencial restrita — sem isso, nao invente comando bidirecional.

## Pegadinha

O no ja aceitou escrita REST anonima. Nao faca PUT/PATCH de prova no Firebase real sem combinar: um PUT substitui o snapshot e aparece no painel na hora.
