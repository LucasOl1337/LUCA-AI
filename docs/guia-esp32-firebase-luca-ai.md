# Guia técnico — ESP32, Firebase e telemetria em tempo real no LUCA-AI

Pesquisa técnica e roteiro operacional para Lucas Silvério conectar o ESP32 físico ao
módulo SOMPO do LUCA-AI. Fontes consultadas em 21 de agosto de 2026.

## Resposta curta

O fluxo usado por Lucas Silvério é tecnicamente compatível e a metade
Firebase -> LUCA já funciona:

```text
ESP32 -> Mosquitto -> ponte para Firebase -> Firebase Realtime Database
      -> REST Streaming/SSE -> Express LUCA -> WebSocket autenticado -> painel SOMPO
```

Essa arquitetura foi confirmada na transcrição do vídeo `video lucasfiap.txt`: o
firmware publica no Mosquitto e uma ponte leva os dados ao Firebase. O ESP32 **não
precisa abrir conexão com o domínio do LUCA nem com o WebSocket do navegador**. O
contrato entre as duas partes é o JSON final no nó exato do Firebase. O backend do LUCA
já mantém uma assinatura contínua desse nó e repassa cada mudança para o painel.

Gravar direto do ESP32 no Firebase por HTTPS também é tecnicamente possível, mas não é
necessário para conectar o protótipo atual e não deve substituir o caminho Mosquitto já
funcional sem uma decisão do grupo.

Em 21/08/2026, uma leitura pública do endpoint retornou HTTP 200 com o snapshot do
trator `001`, e uma assinatura com `Accept: text/event-stream` recebeu o evento inicial
`put`. Isso comprova que a URL, a leitura pública e o caminho Firebase -> LUCA estão
ativos. Não comprova que o ESP físico está ligado agora nem que uma gravação sem token
será aceita. A permissão de escrita só pode ser confirmada pelo proprietário no console
do Firebase ou por um teste de escrita autorizado.

## 1. Contrato exato que o LUCA espera

### Destino final no Firebase

```text
https://trator-monitoramento-default-rtdb.firebaseio.com/trator/001/sensores.json
```

O sufixo `.json` é obrigatório quando a ponte usa a API REST do Realtime Database, e o
Firebase aceita apenas tráfego HTTPS. A URL usada pelo LUCA está fixada em
`server/sompo-telemetry-source.js`; o caminho lógico compartilhado está em
`shared/sompo-telemetry.js`.

Fonte oficial: [Firebase — instalação da API REST](https://firebase.google.com/docs/database/rest/start)
e [referência REST do Realtime Database](https://firebase.google.com/docs/reference/rest/database).

### JSON compatível

Os nomes diferenciam maiúsculas de minúsculas e devem ficar diretamente em
`/trator/001/sensores`, sem outro nível intermediário:

```json
{
  "trator": "001",
  "timestamp": 886909,
  "distancia": 70.66,
  "temperatura": 28.6,
  "umidade": 37.0,
  "pitch": 0.06,
  "roll": -0.54,
  "aceleracaoX": 10.01,
  "aceleracaoY": -0.08,
  "aceleracaoZ": 0.61,
  "rotacaoX": -0.04,
  "rotacaoY": -0.03,
  "rotacaoZ": -0.02,
  "riscoColisao": true,
  "riscoInclinacao": false
}
```

Contrato de tipos:

| Campo | Tipo JSON | Uso no LUCA |
| --- | --- | --- |
| `trator` | string | Identificador; deve ser `"001"`. |
| `timestamp` | number | Contador bruto do ESP; deve mudar em cada publicação. |
| `distancia`, `temperatura`, `umidade` | number | Leituras simples. |
| `pitch`, `roll` | number | Inclinação nos dois eixos. |
| `aceleracaoX/Y/Z` | number | Vetor de aceleração; o LUCA calcula a magnitude. |
| `rotacaoX/Y/Z` | number | Vetor de rotação; o LUCA calcula a magnitude. |
| `riscoColisao`, `riscoInclinacao` | boolean | Flags determinísticas do firmware, sem aspas. |

As unidades não estão declaradas no JSON atual. O painel mostra convenções com
asterisco, mas Lucas precisa confirmar no firmware se distância é cm, temperatura é °C,
umidade é %, aceleração é m/s² e rotação é °/s antes que essas unidades sejam tratadas
como fatos técnicos.

### Frequência

O LUCA marca o snapshot como parado após 15 segundos sem qualquer mudança. Para o teste,
publique a cada 2 a 5 segundos e altere `timestamp` em toda publicação, mesmo se os
sensores permanecerem iguais. Uma flag de risco deve ser publicada imediatamente.

Evite publicar em todo ciclo do `loop()` sem intervalo: isso aumenta consumo, tráfego e
chance de limitação sem melhorar o painel.

## 2. PUT, PATCH ou POST na ponte Firebase

### Recomendação para a ponte: PUT com snapshot completo

`PUT` substitui integralmente o nó escolhido. É a opção mais simples quando o ESP envia
todos os campos juntos; a troca é atômica para quem está escutando o nó.

```http
PUT /trator/001/sensores.json?print=silent HTTP/1.1
Host: trator-monitoramento-default-rtdb.firebaseio.com
Content-Type: application/json
Connection: keep-alive

{...snapshot completo...}
```

Com resposta normal, sucesso é HTTP `200`. Com `?print=silent`, sucesso é HTTP `204` e
o Firebase não devolve o JSON, economizando banda do ESP.

Use `PATCH` somente se o firmware realmente enviar um subconjunto de campos. O Firebase
preserva os filhos omitidos e o LUCA sabe aplicar eventos `patch`.

Não use `POST` neste nó. `POST` cria um filho com chave automática; o resultado seria
`/sensores/-<id>/...`, enquanto o LUCA espera os campos diretamente em `/sensores`.

O header `Content-Type: application/json` declara corretamente o corpo. A documentação
do Firebase exige JSON válido, embora alguns exemplos `curl -d` funcionem sem declarar o
header explicitamente. Para muitas escritas, a própria documentação recomenda reutilizar
a conexão HTTPS com keep-alive.

Fonte oficial: [Firebase — salvar dados via REST](https://firebase.google.com/docs/database/rest/save-data).

## 3. Segurança e autenticação

### O estado observável hoje

O backend atual do LUCA assina o Firebase sem token. Portanto, a regra `.read` do nó
precisa continuar pública até o backend ganhar uma credencial própria. O GET público
funcionou no teste de 21/08/2026.

Isso não permite concluir que `.write` também esteja pública. No caminho atual, as
credenciais de escrita podem estar somente na ponte Mosquitto -> Firebase. Não faça uma
gravação REST de teste no nó real sem combinar o horário, pois um `PUT` incorreto
substitui o snapshot e aparece imediatamente no painel.

### Opções oficiais

O REST do Firebase aceita:

- acesso sem token, somente quando as Security Rules liberam acesso público;
- Firebase ID token em `?auth=<ID_TOKEN>`, respeitando as Security Rules;
- Google OAuth2 access token de service account em `Authorization: Bearer ...` ou
  `?access_token=...`, destinado a servidor confiável.

Nunca coloque o arquivo JSON nem a chave privada de uma service account no firmware.
O Firebase alerta explicitamente para não implantar essa credencial em aplicativo
cliente. Também não envie credenciais no documento do grupo, repositório, captura de
tela ou log Serial.

Fonte oficial: [Firebase — autenticar requisições REST](https://firebase.google.com/docs/database/rest/auth).

### Se o grupo decidir gravar direto do ESP32

1. O proprietário do projeto cria uma conta Firebase Authentication exclusiva para o
   trator `001` e guarda o UID.
2. O firmware autentica essa conta pelo endpoint oficial
   `accounts:signInWithPassword`, recebe `idToken`, `refreshToken` e `expiresIn`.
3. O ESP grava com `?auth=<ID_TOKEN>`.
4. Antes de expirar, o firmware renova a sessão pelo endpoint de refresh. A resposta
   oficial atual indica expiração do ID token em aproximadamente 3.600 segundos.
5. As Security Rules permitem escrita somente para o UID do trator, mas mantêm leitura
   no nó para o backend atual do LUCA.

Esse caminho ainda guarda uma credencial do dispositivo no ESP. Se a placa for perdida,
ela deve ser revogada/rotacionada. O caminho mais forte é um serviço de provisionamento
que gere custom tokens por dispositivo; isso exige um endpoint seguro que ainda não
existe no repositório do LUCA.

Fonte oficial: [Firebase Auth REST — login, refresh e custom token](https://firebase.google.com/docs/reference/rest/auth/)
e [Firebase — criar custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens).

A Web API Key identifica o projeto, mas não concede sozinha acesso ao banco. ID token e
Security Rules fazem a autorização. Fonte: [Firebase — API keys](https://firebase.google.com/docs/projects/api-keys).

### Exemplo de Security Rules

Substitua `UID_REAL_DO_DISPOSITIVO_001` pelo UID criado no Firebase Authentication.
Teste no Rules Simulator antes de publicar. Este exemplo preserva a leitura pública que
o LUCA atual requer, restringe escrita ao dispositivo e valida os tipos sem inventar
limiares de sensores:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "trator": {
      "001": {
        "sensores": {
          ".read": true,
          ".write": "auth != null && auth.uid === 'UID_REAL_DO_DISPOSITIVO_001'",
          ".validate": "newData.hasChildren(['trator','timestamp','distancia','temperatura','umidade','pitch','roll','aceleracaoX','aceleracaoY','aceleracaoZ','rotacaoX','rotacaoY','rotacaoZ','riscoColisao','riscoInclinacao'])",
          "trator": { ".validate": "newData.isString() && newData.val() === '001'" },
          "timestamp": { ".validate": "newData.isNumber()" },
          "distancia": { ".validate": "newData.isNumber()" },
          "temperatura": { ".validate": "newData.isNumber()" },
          "umidade": { ".validate": "newData.isNumber()" },
          "pitch": { ".validate": "newData.isNumber()" },
          "roll": { ".validate": "newData.isNumber()" },
          "aceleracaoX": { ".validate": "newData.isNumber()" },
          "aceleracaoY": { ".validate": "newData.isNumber()" },
          "aceleracaoZ": { ".validate": "newData.isNumber()" },
          "rotacaoX": { ".validate": "newData.isNumber()" },
          "rotacaoY": { ".validate": "newData.isNumber()" },
          "rotacaoZ": { ".validate": "newData.isNumber()" },
          "riscoColisao": { ".validate": "newData.isBoolean()" },
          "riscoInclinacao": { ".validate": "newData.isBoolean()" },
          "$other": { ".validate": false }
        }
      }
    }
  }
}
```

Regras `.read` e `.write` cascatas em um nível superior liberam todos os descendentes;
por isso não deixe `/trator` publicamente gravável. `.validate` é a ferramenta própria
para impor campos e tipos em um banco schemaless.

Fonte oficial: [visão geral das Security Rules do Realtime Database](https://firebase.google.com/docs/database/security)
e [referência de regras e validação](https://firebase.google.com/docs/reference/security/database/).

## 4. HTTPS/TLS no ESP32

Requisitos mínimos:

- conectar em modo Wi-Fi Station e aguardar `WL_CONNECTED`;
- usar somente a URL `https://...`;
- validar certificado e hostname do Firebase com uma CA raiz ou bundle x509;
- sincronizar o relógio por SNTP antes do primeiro handshake TLS;
- nunca usar `setInsecure()`, `skip_common_name=true` ou opção equivalente fora de um
  diagnóstico local;
- tratar falha TLS como falha de envio; não rebaixar para HTTP.

No Arduino-ESP32, o exemplo oficial usa `NetworkClientSecure`, chama `setCACert()` e
sincroniza o relógio antes da requisição. Em ESP-IDF, configure `cert_pem` ou
`crt_bundle_attach`. Fixar apenas o certificado final do servidor é frágil porque ele
pode ser renovado; prefira a cadeia/CA ou o bundle mantido pelo framework.

Fontes oficiais:

- [Espressif — exemplo BasicHttpsClient do Arduino-ESP32](https://github.com/espressif/arduino-esp32/blob/master/libraries/HTTPClient/examples/BasicHttpsClient/BasicHttpsClient.ino)
- [Espressif — ESP HTTP Client](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/protocols/esp_http_client.html)
- [Espressif — ESP-TLS e verificação do servidor](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/protocols/esp_tls.html)

## 5. Rotina de publicação do protótipo atual

O firmware existente deve manter a publicação Mosquitto que Lucas já demonstrou, sem
copiar valores de exemplo. A sequência operacional é:

```text
1. Conectar ao Wi-Fi e sincronizar o relógio.
2. Ler e validar sensores.
3. Calcular riscoColisao e riscoInclinacao no firmware.
4. Montar um JSON com todos os campos e tipos do contrato.
5. Publicar no mesmo broker e tópico que já alimentam a ponte Firebase.
6. Confirmar no Serial que o broker aceitou a publicação.
7. Repetir a cada 2–5 segundos e imediatamente quando uma flag de risco mudar.
8. Em erro transitório, preservar o loop de sensores e tentar de novo com backoff.
```

O hostname, porta, tópico, usuário e senha do Mosquitto não foram entregues junto com a
transcrição. Eles devem ser lidos do sketch que já funciona; não devem ser inventados
nem colocados no HTML do grupo.

Se o grupo optar por remover o Mosquitto e publicar por REST diretamente, use então a
sequência HTTPS abaixo:

```text
1. Criar NetworkClientSecure com CA/bundle válido.
2. Abrir HTTPClient na URL exata do Firebase.
3. Adicionar Content-Type: application/json.
4. Adicionar o ID token em ?auth=... quando as Rules exigirem.
5. Fazer PUT do snapshot completo.
6. Aceitar somente 200 ou 204 como sucesso e nunca registrar o token.
7. Fechar/liberar o cliente e repetir com backoff em falha transitória.
```

A API oficial do `HTTPClient` do Arduino-ESP32 oferece `PUT(String)`, `PATCH(String)`,
`addHeader()` e controle de redirecionamento. Para redirecionar um `PUT` mantendo método,
body e headers, o modo precisa ser o de redirecionamento forçado, não o modo estrito que
só segue GET/HEAD.

Fonte primária: [Espressif — HTTPClient.h](https://github.com/espressif/arduino-esp32/blob/master/libraries/HTTPClient/src/HTTPClient.h).

## 6. O que o backend do LUCA faz em tempo real

O Express abre um GET persistente para o mesmo endpoint com:

```http
Accept: text/event-stream
Cache-Control: no-cache
```

O cliente SSE precisa seguir redirects HTTP, especialmente `307`. O Firebase envia
frames no formato:

```text
event: put
data: {"path":"/","data":{...snapshot...}}

```

Eventos oficiais:

| Evento | Ação correta |
| --- | --- |
| `put` | Substituir o estado no `path` relativo pelo valor de `data`. |
| `patch` | Atualizar somente as chaves de `data` no `path` relativo. |
| `keep-alive` | Manter a conexão; `data` é `null`, sem mudança de sensor. |
| `cancel` | Parar/reavaliar: as regras revogaram a leitura ou houve erro fatal. |
| `auth_revoked` | Renovar/corrigir a credencial antes de reconectar. |

Não se pode assumir que um chunk TCP equivale a um frame SSE inteiro. O parser acumula
bytes até a linha em branco que termina o evento. Se a conexão fechar, o consumidor deve
reconectar; backoff exponencial limitado evita sobrecarga. O padrão EventSource prevê
reconexão, e admite backoff adicional após falhas.

O código atual do LUCA implementa `put`, `patch`, `keep-alive`, `cancel`,
`auth_revoked`, redirects e reconexão exponencial de 1 a 15 segundos. Ele preserva o
último snapshot durante a queda e informa ao painel que está reconectando.

Fontes oficiais:

- [Firebase — streaming REST/SSE](https://firebase.google.com/docs/database/rest/retrieve-data#section-rest-streaming)
- [WHATWG — padrão Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)

## 7. Roteiro de teste físico com Lucas

### Antes de ligar

- confirmar que a placa é ESP32 e anotar versão do Arduino-ESP32 ou ESP-IDF;
- obter o repositório/sketch real do firmware;
- confirmar SSID, alimentação estável e acesso à internet;
- confirmar a unidade de cada sensor;
- obter do proprietário do Firebase a opção de autenticação, sem colocá-la no documento
  do grupo;
- abrir o painel SOMPO com uma conta autenticada no LUCA.

### Teste em quatro etapas

1. **Serial:** verificar Wi-Fi conectado e hora sincronizada.
2. **Mosquitto e Firebase:** exigir confirmação de publicação MQTT e observar o mesmo
   snapshot no nó Firebase. Se a ponte usa REST, HTTP 200/204 indica sucesso; 401 aponta
   token ou Rules, 400 indica JSON/path inválido, 404 indica banco incorreto e 503 é
   indisponibilidade temporária.
3. **Tempo real:** variar fisicamente um sensor e confirmar que o valor/timestamp muda no
   Firebase e depois no painel sem recarregar a página.
4. **Risco:** acionar de forma segura as condições de colisão/inclinação simuladas pelo
   firmware e confirmar apenas as flags, sem expor pessoa ou equipamento a risco real.

### Critério de aceite

- cinco publicações consecutivas são aceitas pelo Mosquitto e aparecem no Firebase;
- `timestamp` muda em cada publicação;
- o painel mostra conexão `live`, não `stale`;
- uma alteração física aparece no painel sem refresh;
- desconectar o Wi-Fi faz o painel indicar reconexão/snapshot preservado;
- reconectar o Wi-Fi retoma atualizações sem reiniciar o LUCA;
- nenhum token, senha ou chave aparece no Serial Monitor, repositório ou HTML compartilhado.

## 8. Diagnóstico rápido

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| MQTT não conecta | Wi-Fi, broker, porta, TLS ou credencial | Conferir o sketch funcional e nunca expor senha no Serial. |
| MQTT publica, Firebase não muda | Ponte, tópico ou mapeamento | Conferir o tópico e o processo Mosquitto -> Firebase. |
| HTTP negativo/sem conexão na ponte | DNS, TLS ou credencial Firebase | Confirmar CA/bundle, hostname e internet. |
| HTTP 400 | JSON malformado ou path inválido | Imprimir JSON sem credenciais e validar tipos/chaves. |
| HTTP 401 | Token expirado/inválido ou Rules negaram | Renovar ID token e conferir UID/rules. |
| HTTP 404 | Nome/URL do banco incorreto | Usar exatamente a URL deste guia, com `.json`. |
| HTTP 503 | Firebase temporariamente indisponível | Repetir com backoff; não entrar em loop agressivo. |
| Firebase muda, painel não | Backend SSE/rede do LUCA | Verificar estado `reconnecting` e último evento no painel. |
| Painel fica `stale` | JSON não muda por 15 s | Atualizar `timestamp` e publicar a cada 2–5 s. |
| Campos aparecem vazios | Nome/tipo diferente do contrato | Comparar o JSON campo a campo; números sem aspas e flags booleanas. |
| Cria vários IDs sob `sensores` | Firmware usou POST | Trocar por PUT no endpoint fixo. |

Erros oficiais do REST: [Firebase — referência e códigos HTTP](https://firebase.google.com/docs/reference/rest/database#error_conditions).

## 9. Limites relevantes

| Limite oficial por instância | Valor |
| --- | --- |
| Conexões simultâneas | 100 no plano Spark; até 200.000 nos demais cenários documentados. |
| Taxa de escrita sustentada | Aproximadamente 1.000 escritas/s antes de possível limitação. |
| Tamanho de uma escrita REST | 256 MB. |
| Bytes escritos | 64 MB/minuto. |
| Tamanho de uma resposta | 256 MB. |

Um trator publicando um JSON pequeno a cada poucos segundos fica muito abaixo desses
limites. A arquitetura do LUCA usa uma única conexão Firebase no backend e distribui o
resultado aos navegadores, evitando uma assinatura Firebase por usuário.

Fonte oficial: [Firebase — limites do Realtime Database](https://firebase.google.com/docs/database/usage/limits).

## Pendências que dependem do dono do Firebase ou do firmware

- confirmar se a escrita atual exige token e ver as Security Rules reais;
- obter do sketch o broker, a porta e o tópico exatos e confirmar que a ponte está ativa;
- escolher e provisionar a identidade do dispositivo `001`;
- entregar o sketch/repositório do ESP32 para adaptar sem adivinhar bibliotecas;
- confirmar unidades, calibração e limiares de `riscoColisao` e `riscoInclinacao`;
- executar o teste físico com mudança real do `timestamp`;
- se a leitura também precisar ser privada, adicionar autenticação configurável no
  assinante SSE do backend antes de remover `.read: true`.

Até essas confirmações, é correto afirmar que **a integração técnica é suportada e o
canal Firebase -> LUCA funciona**, mas não que **o ESP físico está publicando agora** ou
que **a configuração de escrita está segura**.
