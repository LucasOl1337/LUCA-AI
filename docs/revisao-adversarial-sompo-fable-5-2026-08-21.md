# Revisão adversarial SOMPO — Fable 5

Data: 21 de agosto de 2026  
Modelo: `cc/claude-fable-5`, chamado pelo 9Router local do LUCA-AI  
Escopo: ESP32/Mosquitto -> Firebase -> SSE -> Express -> WebSocket autenticado -> painel SOMPO

## Veredito

**Aprovar com ressalvas.**

O teste real prova a cadeia a partir do Firebase até o WebSocket autenticado. O código e
os testes sustentam o consumo do evento pelo estado React. Sem a placa, o broker, o
tópico e a ponte disponíveis nesta máquina, ainda não é correto declarar provado o elo
físico ESP32 -> Mosquitto -> Firebase.

## Evidência executada

O ensaio alterou somente `/trator/001/sensores/timestamp`. A escrita e a restauração
usaram ETag + `If-Match`: se o ESP atualizasse o campo ao mesmo tempo, a restauração seria
recusada em vez de sobrescrever o dado novo.

| Etapa | Resultado |
| --- | --- |
| Leitura Firebase | HTTP 200, trator `001`, timestamp inicial `886909` |
| Source real do LUCA | `state=live`, snapshot inicial normalizado |
| Escrita condicional de prova | HTTP 200 |
| Source observou a prova | `state=live`, `freshness=fresh` |
| Servidor Express isolado | iniciou com armazenamento temporário |
| Cadastro e cookie locais | HTTP 201 |
| Bootstrap autenticado | HTTP 200, trator `001` |
| WebSocket autenticado | recebeu snapshot inicial |
| Firebase -> WebSocket | recebeu o timestamp de prova em **335 ms** |
| Restauração condicional | HTTP 200; WebSocket observou `886909` novamente |
| Estado final no Firebase | timestamp `886909`, demais valores preservados |

Também passaram os 13 testes específicos em `server/sompo-telemetry.test.js` e
`server/sompo-cases-ui.test.js`.

## Achado de segurança

A escrita condicional foi feita sem token e aceita com HTTP 200. Portanto, o nó permite
ao menos escrita anônima no filho `timestamp`. Isso é suficiente para adulterar frescor
e evidência temporal do painel.

Antes de tratar a telemetria como confiável:

1. restringir `.write` à identidade da ponte ou do dispositivo `001`;
2. manter credenciais fora do firmware compartilhado, Serial, HTML e Git;
3. validar no Rules Simulator e repetir o ensaio com escrita anônima recusada;
4. se `.read` também for fechada, adicionar credencial configurável ao assinante SSE do
   backend antes da mudança.

## Achados do Fable 5

### Altos

1. **Nó raiz apagado causa reconexão cega.** Um evento `put` com `data: null` faz
   `normalizeSompoTelemetry` lançar. O runtime reconecta, recebe o mesmo nó vazio e pode
   repetir o ciclo enquanto preserva o snapshot antigo. Evidência:
   `server/sompo-telemetry-source.js:44`, `shared/sompo-telemetry.js:34`.
2. **`cancel` e `auth_revoked` não são distinguidos de queda de rede.** O runtime entra
   em backoff e o painel manda verificar conexão, mesmo quando a causa são Rules ou
   credenciais. Evidência: `server/sompo-telemetry-source.js:187` e `:232`.

### Médios

1. **Não há watchdog de silêncio do stream.** Uma conexão TCP half-open pode continuar
   marcada como `live`; após 15 segundos o snapshot fica `stale`, mas o transporte não
   muda para `reconnecting`. Evidência: `server/sompo-telemetry-source.js:214`.
2. **Timestamp não finito não confirma frescor.** `NaN`, overflow ou texto inválido vira
   `null`; com sensores iguais, o fingerprint não muda. Evidência:
   `shared/sompo-telemetry.js:10` e `server/sompo-telemetry-source.js:3`.
3. **Bootstrap usa timeout de cinco segundos.** Uma primeira resposta lenta pode mostrar
   indisponibilidade transitória antes de o stream resolver o snapshot. Evidência:
   `server/sompo-telemetry-source.js:79` e `:305`.

### Baixos ou já fechados

- o cleanup do hook fecha o WebSocket e limpa timers em
  `src/hooks/useLucaState.tsx:429` e `:444`; a dúvida do revisor foi fechada por inspeção;
- URL e caminho fixos são deliberados para o protótipo `001`, mas mudar de banco exige
  alteração e deploy;
- os testes de interface em `server/sompo-cases-ui.test.js` validam presença por regex e
  não substituem um ensaio DOM completo.

## O que ainda exige Lucas Silvério

1. ligar o ESP32 e mostrar cinco publicações MQTT aceitas com timestamp crescente;
2. confirmar broker, porta, tópico e ponte Mosquitto -> Firebase do sketch real;
3. variar distância e inclinação com segurança;
4. confirmar Serial -> Firebase -> painel sem recarregar;
5. testar `riscoColisao=true -> false` e `riscoInclinacao=true -> false`;
6. confirmar unidades, conversões, calibração e limiares do firmware.

## Conclusão operacional

Se o JSON documentado chegar ao nó Firebase, o LUCA o entrega ao WebSocket autenticado
sem refresh; o ensaio mediu 335 ms. O que permanece sem prova nesta máquina é a origem
física até o Firebase. Funcionalmente, Lucas tem um roteiro executável. Para integridade
de produção, a escrita pública e os dois achados altos do runtime precisam ser tratados.
