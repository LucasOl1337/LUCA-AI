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
ESP32 -> Mosquitto -> Firebase -- SSE --> Express -- /ws autenticado --> painel
```

O navegador nunca fala com o Firebase. Uma assinatura REST Streaming no Express (`put`/`patch`, backoff, snapshot preservado, `stale` apos 15s sem mudanca). `GET /api/sompo/telemetry` le essa memoria; nao abre outro GET.

So sobe dado. O LUCA nao escreve no Firebase nem no Mosquitto. Canal de descida exige contrato no firmware e credencial restrita — sem isso, nao invente comando bidirecional.

## Pegadinha

O no ja aceitou escrita REST anonima. Nao faca PUT/PATCH de prova no Firebase real sem combinar: um PUT substitui o snapshot e aparece no painel na hora.
