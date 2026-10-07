# Laboratório do sensor (`/sensor`)

Leia ao mudar o laboratório educativo. A entrada prioriza as leituras e a avaliação operacional. O caminhão continua inicial. `/sensor?veiculo=trator` abre o Trator MAX e preserva a escolha ao recarregar ou navegar pelo histórico.

**Simulação didática, sem conexão com equipamento.** Tudo roda no navegador. Não há API, MQTT, Firebase, gravação de episódio nem comando ao veículo nesta página. Identificadores `demo-caminhao`/`demo-trator` e relógio em ms pertencem ao ensaio, não a um dispositivo real.

## Onde está

| Arquivo | Responsabilidade |
| --- | --- |
| `src/sensor-lab/physics.js` (+ `.d.ts`) | Física pura, perfis de veículo, roteiros determinísticos, resposta MEMS e leitura no formato do contrato. Testes em `server/sensor-lab.test.js`. |
| `src/sensor-lab/SensorLabPage.tsx` e `sensor-lab.css` | Seletor/URL, leituras operacionais, três camadas de alerta, detalhe do contrato, MEMS opcional e fluxo da operação fora do canvas. |
| `src/sensor-lab/scene/mountSensorLab.ts` | Renderer, câmeras, arraste da mesa, relógio, pausa/repetição e governador. |
| `src/sensor-lab/scene/motionRig.ts` | Hexápode, caminhão SOMPO e MAX lazy, ponto frontal, obstáculo, seta de carga e base ilustrativa. |
| `src/sensor-lab/scene/mems.ts`, `imuPackage.ts` | Massa de prova, molas, pentes capacitivos, gangorra do eixo Z, giroscópio e encapsulamento. |
| `src/sensor-lab/scene/room.ts`, `scope.ts`, `post.ts`, `labels.ts`, `textures.ts`, `materials.ts` | Sala, monitor de leitura simulada, pós, etiquetas e materiais. |
| `scripts/sensor-preview/` | Prévia sem login sob CSP local e roteiro de validação em navegador de bancada. |
| `public/fonts/` | Outfit/JetBrains Mono locais (OFL), famílias próprias para não alterar o restante do app. |

## Ensaios e números

Caminhão: Encosta, Curva, Frenada e Buraco mantêm os valores anteriores. Limiar efetivo ilustrativo de 0,40 g (a geometria daria 0,54 g), atenção em 60% e risco em 80% do limite, tombamento na encosta acima de 21,8°.

MAX: Encosta, Curva de talhão, Parada diante de obstáculo e Solo irregular. Velocidade de 4 a 8 km/h na curva/parada, 6 km/h no solo irregular e raio de curva de 4 m. **0,40 g é limite didático arbitrado**, não medido/certificado nem recomendação de condução. CG e pivôs de tombamento também são ilustrativos.

Na Parada, a distância começa em 400 cm. O operador roteirizado reage a 150 cm, freia e para a 40 cm. A distância integra a velocidade e a face do obstáculo usa a mesma escala de 0,19 da maquete. O emissor HC-SR04 do MAX fica em `(2.2461, 0.7363, 0)` metros, frontal +X. O modelo de cerca de 4,5 m é o asset existente do SOMPO, carregado só quando o MAX é selecionado. O movimento é relativo à bancada, não um cenário rodoviário.

Três camadas distintas:

1. Limite físico ilustrativo: razão lateral/limite, atenção em 60%, risco em 80% e tombamento em 100% na encosta/curva.
2. Flag simulada: `riscoColisao` entra a 150 cm no roteiro. Não prova contato ou batida. `riscoInclinacao` vem da classificação física.
3. Regra visual: abaixo de 200 cm é atenção, até 100 cm **ou flag** é perigo. Portanto a flag já pode destacar perigo antes de cruzar 100 cm. Inclinação de 20° ou flag também pede avaliação.

Quem decide é o operador/gestor. O aviso não controla nem garante segurança.

## Campos e convenções

- Distância sem alvo e ambiente não simulado permanecem `null`, nunca zero/false por conveniência. Ausência de alvo não significa caminho livre.
- MAX mostra ambiente sintético fixo de 27 °C e 55%. Não mede mercadoria, não varia com o ensaio e não gera flag térmica.
- Ângulos didáticos seguem a pose: inclinação frente/trás (`pitch`) e lateral (`roll`). No dispositivo documentado os nomes chegam trocados e o painel corrige na entrada. A montagem física do IMU do MAX não foi verificada por este laboratório.
- Convenções do laboratório: aceleração em g, rotação em °/s, distância em cm, ângulos em graus. O JSON real não declara unidades.
- O monitor 3D mostra uma leitura simulada, não um pacote publicado. A rede desenhada ilustra o equipamento real, não atividade desta página.

## MEMS e processo operacional

“Por dentro do sensor” abre o chip e as vistas internas. Modo real/ampliado, etiquetas e chip aberto/fechado continuam disponíveis. Ressonância 5,5 kHz, cerca de 8,2 nm/g, massa 10 µg, mola ~12 N/m, vão 1,4 µm, 24 pares de dedos, 273 fF por lado e ~3,2 fF/g, ADC de 16 bits em ±2 g (16.384 contagens/g). Ampliado muda só o desenho (~72×), não as leituras.

“Como o dado vira decisão na operação” explica o fluxo existente: ESP32 → Mosquitto → Firebase → servidor LUCA (SSE/histórico SQLite) → painel autenticado/gêmeo → alerta e avaliação humana → episódio gravado por alguém no simulador SOMPO → análise na bancada → Safra. Sem dado há 15 s, o painel marca desatualizado. Alerta não grava episódio automaticamente. Safra está implementada em `SompoFleetPanel.tsx`.

## Prévia e validação

```sh
SENSOR_PREVIEW_PORT=5211 node scripts/sensor-preview/serve.mjs
```

Abra `http://127.0.0.1:5211/?sensorDebug` na bancada própria. `?sensorDebug` expõe `window.__sensorLab` (cena, câmera, leitura, relógio e custo por quadro) para inspeção. Prévia tem CSP real e APIs desligadas. Reinicie o servidor após editar, pois ele gera o bundle na inicialização.

Depois de validar `agent-bench status/browser-status` e reservar a fila pesada:

```sh
SENSOR_BENCH_CDP=http://127.0.0.1:PORTA_DA_BANCADA \
SENSOR_PROOF_DIR=/caminho/prints \
node scripts/sensor-preview/verify.mjs
```

O roteiro abre/fecha apenas a própria aba. Confere oito ensaios, pausa, repetição, URL/histórico/reload, carga lazy, limiares, distância geométrica, MEMS, ausência de APIs/erros e overflow desktop/390×844. Salva prints e JSON de evidências. O relógio de depuração fixa instantes para capturas determinísticas, não é telemetria real. A prévia testa o componente real, mas não substitui a conferência da integração no shell autenticado pelo regente.

Checks locais: `npm run typecheck`, `npm test`, `npm run test:cli`, `npm run build`. Não usar FPS da bancada como métrica do produto, nem alterar sombras pelo governador. Assets/fontes são somente `'self'`.
