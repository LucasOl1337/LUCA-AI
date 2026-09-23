# Laboratório do sensor (`/sensor`)

Leia SOMENTE ao mudar o laboratório 3D "A massa de prova".

Módulo educativo: mostra por dentro o IMU MEMS que o ESP32 usa para publicar `aceleracaoX/Y/Z`, `rotacaoX/Y/Z` e `riscoInclinacao`. A cena liga três coisas numa bancada: a plataforma de movimento com o caminhão cara-chata do SOMPO, o chip aberto (massa de prova, molas, pentes capacitivos, gangorra do eixo Z e giroscópio de Coriolis) e o monitor com o pacote no formato do contrato de `docs/sompo.md`. Não lê telemetria real nem chama API: é simulação no navegador.

## Onde está

| Arquivo | O quê |
| --- | --- |
| `src/sensor-lab/physics.js` (+ `.d.ts`) | Física pura, forma fechada do relógio: roteiros (encosta, curva, frenada, buraco), tombamento, resposta do MEMS (nm, fF, contagens) e pacote do contrato. Testada em `server/sensor-lab.test.js`. |
| `src/sensor-lab/SensorLabPage.tsx` | HUD React: título, leituras, narração, diagrama de tombamento (SVG), painel, vistas, avisos e folha "Como funciona". |
| `src/sensor-lab/scene/mountSensorLab.ts` | Renderer, luzes, câmeras pré-definidas, arrastar a mesa, laço e governador de qualidade. |
| `src/sensor-lab/scene/mems.ts`, `imuPackage.ts` | Die MEMS e encapsulamento (fios de ouro com morph target para a vista explodida). |
| `src/sensor-lab/scene/motionRig.ts` | Hexápode + caminhão (`createSompoTruckModel` + `refineSompoTruck` + `astra-sompo-truck.glb`), seta de carga e base efetiva em raio-X. |
| `src/sensor-lab/scene/room.ts`, `scope.ts`, `post.ts`, `labels.ts`, `textures.ts`, `materials.ts` | Sala e janela, osciloscópio em canvas, pós (DOF por depth buffer, bloom, ACES, grão), etiquetas DOM e texturas procedurais. |
| `public/fonts/` | Outfit e JetBrains Mono (OFL), servidas localmente porque a CSP só aceita `'self'`. As famílias se chamam `Sensor Outfit`/`Sensor Mono` para não mexer no resto do app. |

## Números (ilustrativos, ordem de grandeza de folha de dados)

Ressonância 5,5 kHz → 8,2 nm por g; massa 10 µg, mola ~12 N/m; vão 1,4 µm, 24 pares de dedos → 273 fF por lado e ~3,2 fF por g; ADC 16 bits em ±2 g = 16.384 contagens por g. Caminhão: limiar efetivo de tombamento 0,40 g (geometria daria 0,54 g), aviso em 60% e risco em 80% do limite, encosta tomba acima de 21,8°. O modo "Ampliado" multiplica o deslocamento desenhado (~72×); "Real" mostra o que 1 g faz de verdade (quase nada).

## Prévia isolada

```sh
SENSOR_PREVIEW_PORT=5211 node scripts/sensor-preview/serve.mjs
```

Abre `http://127.0.0.1:5211/?sensorDebug` com a CSP real do app, sem login e sem API. `?sensorDebug` expõe `window.__sensorLab` (cena, câmera, leitura, relógio, custo por quadro).
