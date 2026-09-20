# Monitor de sonolência

Módulo experimental em `/sonolencia`, acessível pelo menu **Sonolência** após login. Ativa a webcam somente por clique e emite pulsos de 880 Hz quando os dois olhos permanecem fechados por 1 segundo. **Testar som** permite conferir o volume antes de iniciar; sensibilidade baixa/normal/alta ajusta a classificação, mantendo 1 segundo.

Teste com o veículo parado, rosto iluminado e sem óculos escuros. Este protótipo não é um sistema de segurança veicular: pode errar, perder o rosto ou não reconhecer olhos fechados. Sem imagens reais de usuários, os testes automatizados não medem precisão de detecção nem audibilidade no equipamento final.

## Isolamento

- Interface, estado, áudio e detector em `src/sonolencia/`, com carregamento sob demanda. Não altera missões, SOMPO, Laboratório, telemetria, banco ou APIs de negócio.
- Imagens ficam em memória no navegador; não há gravação, upload, histórico facial, microfone nem chamadas para provedores de IA.
- Modelo e runtime em `public/sonolencia-assets/`, servidos pelo próprio LUCA. Nenhum CDN é necessário durante a captura.
- Inferência em Web Worker dedicado, um frame por vez, no máximo 10 análises/s. Resultados com mais de 500 ms não contam. Perda de rosto ou intervalo de observações superior a 500 ms zera a contagem e desarma o som. Sem resposta por 8 s, o monitor encerra com erro.
- Ao abrir os olhos, o áudio cessa. Parar, sair da página, ocultar a aba ou perder a câmera encerra captura, áudio e worker. Inicializações canceladas também liberam streams que cheguem depois.
- `Permissions-Policy` libera `camera=(self)` exclusivamente no documento `/sonolencia` (incluindo barra final). A navegação cruza essa fronteira com carregamento de documento para aplicar o cabeçalho correto. As outras telas continuam com câmera bloqueada.
- `wasm-unsafe-eval` é permitido somente na resposta do bundle `assets/drowsiness-worker-*.js`. A CSP do documento, permissões de microfone/geolocalização e o proxy de borda permanecem restritos.

## Detector

MediaPipe Tasks Vision **0.10.32**, dependência fixa. Face Landmarker modelo **float16/1**, com scores `eyeBlinkLeft` e `eyeBlinkRight`. A classificação combina a média dos dois olhos com um piso para o olho de menor score, nos limiares 0,40 (normal), 0,50 (baixa) ou 0,30 (alta). Isso aceita diferenças moderadas entre os lados sem confundir uma piscada de um olho com fechamento bilateral. Histerese e uma tolerância máxima de 200 ms para leituras marginais evitam que um frame ruidoso apague a contagem; rosto perdido ou olhos claramente abertos continuam zerando imediatamente. As confianças de detecção, presença e rastreamento facial usam 0,5.

Os medidores convertem o score bruto em uma escala calibrada pelo limiar selecionado: até 0,10 aparece como 0% e o limiar de fechamento aparece como 100%. Portanto, eles mostram quanto cada olho se aproxima do estado que o monitor considera fechado, e não uma medição física da pálpebra. Apenas o fechamento bilateral alimenta o cronômetro e o alarme.

Referência de API: [guia oficial do Face Landmarker para Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js).

Os quatro arquivos WASM/JS foram copiados de `node_modules/@mediapipe/tasks-vision/wasm/`. Modelo: [face_landmarker.task, float16/1](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task). Licença Apache 2.0 em `public/sonolencia-assets/LICENSE`.

SHA-256 do modelo: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.

## Validação

```bash
npm run typecheck
npm test
npm run build
PORT=4348 LUCA_DATA_DIR=/tmp/luca-sonolencia-qa node server/index.js
# Em outro terminal; Chromium local e câmera sintética, sem acessar webcam física:
node scripts/sonolencia-browser-check.mjs
```

O teste de navegador só aceita localhost e cria conta descartável no estado local. Carrega o modelo/WASM real sob a CSP de produção; em seguida injeta observações controladas para testar o instante do alarme e seus pulsos Web Audio, reabertura, perda de rosto, worker travado, permissão negada, cancelamento assíncrono, saída da aba, troca de políticas por navegação e layout mobile. Capturas em `output/sonolencia/` (ignoradas pelo Git).

Publicação segue `docs/operacao.md`: build limpo, commit/push, `npm run stage:release`, upload dos tarballs e `install-vm.sh` na **sennin-kvm**. Além de `/api/health`, verificar os cabeçalhos de `/sonolencia` e `/sompo`, MIME/tamanho do worker e `sonolencia-assets/face_landmarker.task` (3.758.596 bytes), para descartar fallback SPA.
