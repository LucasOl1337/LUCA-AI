# Geofencing por faixas

Leia SOMENTE ao mudar faixas de proximidade, perigos do mapa, o radar do simulador agrícola ou os episódios de faixa do Laboratório Virtual.

## O que é

Geofencing aqui é um framework de delimitação de área e classificação de zonas por proximidade a perigos mapeados (água, declive, estrutura). Ele não decide culpa nem rotula nada como "seguro": produz distância, faixa, direção, tempo até o perigo, episódios de exposição e área atingida, e entrega isso ao replay, aos agentes de análise e ao HUD do simulador. Sem GPS no ESP32 (`docs/sompo.md`), a posição real só existe no simulador 3D e nos CSVs do laboratório; o contrato já aceita `latitude_deg`/`longitude_deg`/`gnss_fix` para quando o hardware tiver GNSS.

## Contrato (um só para laboratório e simulador)

- **Polígonos** no formato do laboratório: `{ id, role: 'property_boundary' | 'allowed_area' | 'water' | 'hazard', category?, rings: {x, z}[][] }`, metros locais, `x` para leste, `z` para o sul. No GeoJSON, `properties.role` e, para `hazard`, `properties.category` (`slope`, `gully`, `structure`). `property_boundary` nunca autoriza operação; cerca só com `allowed_area`.
- **Regras** em `manifest.rules.hazards[]`: `{ role, category?, label, bands_m: [{ id, label, max_m }] crescente, justification }`. A borda pertence à faixa; `max_m: 0` = dentro do polígono. Sem `hazards`, `water_warning_distance_m` vira uma faixa única (comportamento original intacto). Valores são parâmetros declarados pelo operador, não distâncias de segurança calibradas; a justificativa aparece na legenda.
- **Perigo de máquina** (`role: 'machine'`, `metric: 'roll_deg' | 'pitch_deg'`): sem geometria. A "distância" é a margem em graus entre o sinal do CSV e o limite da máquina, lido de `manifest.machine.profile.max_roll_deg` (ou `limit_deg` fixo na regra). `bands_m` continua sendo a lista de faixas, agora em graus: `max_m: 0` = no limite ou acima, `max_m: 5` = a até 5° do limite. Amostra sem o sinal não abre nem fecha episódio. Esse é o ponto do framework: o declive é o mesmo para todos, o limite é de cada máquina; trocar o perfil troca os episódios e, com relevo, as zonas pintadas no mapa (`slopeZones` em `src/components/lab/labBands.ts`, inclinação do terreno ≥ limite).
- **Perfil da máquina** em `manifest.machine.profile`: números não negativos (`max_roll_deg`, `max_pitch_deg`, `platform_width_m`, `operating_speed_kmh`, `reaction_time_s`). Demonstração usa 15° para a colheitadeira; o valor real vem do fabricante e do implemento.
- **Motor** `shared/lab-geofence.js`: `classifyBand`, `resolveHazards`, `computeGeofenceEpisodes` (episódios por perigo com `observedMs`, `gapMs`, distância mínima e qualidade; eventos `hazard_band`), `bandGrid`/`affectedArea` (grade de 2 m dentro de `allowed_area`; a mesma grade pinta a cena, regra 1 do SPEC). `geofence.grid` fica no caso para a interface não recalcular.
- **Radar** `shared/sompo-geofence.js`: `evaluateGeofence({ x, z, headingDeg, speedKph, rollDeg }, rules, polygons, machine)` → `{ insideAllowed, nearest: { hazardLabel, bandLabel, distanceM, bearingDeg, timeToHazardS }, all, machine }` e `describeGeofence(result)` / `describeMachineLimit(result.machine)` para HUD. `headingDeg` segue o CSV do laboratório: 0 = norte, 90 = leste. `machine` é o equipamento do cenário (`SOMPO_AGRI_EQUIPMENT[id].profile.max_roll_deg`, valor de demonstração); a regra `role: 'machine'` está em todo talhão sintético e a margem em graus fica em `result.machine`, separada dos metros de `nearest`.

## Onde aparece

| Superfície | Arquivos | O que mostra |
|---|---|---|
| Laboratório, cena 3D | `src/components/lab/LabScene.tsx`, `labBands.ts` | Textura das faixas no solo (mesma grade), rastro pintado pela faixa, plantio (`createCropField.ts`) colhido por onde a máquina passou, colheitadeira GLB (`loadLabHarvester.ts`) |
| Laboratório, minimapa | `src/components/lab/LabMiniMap.tsx` | Canto inferior esquerdo: área, água, faixas forte→fraca, trajeto, máquina; clique leva o replay ao instante |
| Laboratório, painéis | `LabBandLegend.tsx`, `LabGeofencePanel.tsx` (+ `LabExposureStrip`) | Legenda com área atingida; episódios; régua de exposição na linha do tempo |
| Laboratório, agentes | `server/lab-cases.js` `evidenceContext` | Episódios e área atingida no payload da IA, com a frase de limitação |
| Simulador agrícola, mapa do talhão | `src/components/sompo/SompoGeofenceMap.tsx` (modo "Mapa do talhão" na barra do simulador) | Fazenda sintética vista de cima, norte para cima: área permitida, córrego em L, lagoa, ribanceira, declive, faixas pela mesma grade, percurso, máquina no instante, lista de regras com justificativa |
| Simulador agrícola | `shared/sompo-geofence-sites.js`, `shared/sompo-agri-brief.js`, `src/components/SompoTruckSimulator.tsx`, `createSompoAgriStage.ts` | Cenário próprio **"Operação com geofencing"** (`agri-geofencing`, ambiente `geofence-field`, colheitadeira): fazenda sintética de 180 × 140 m com formas curvas (talhão chanfrado, córrego em meandro, lagoa e declive elípticos, ribanceira curva) e três desfechos (parada na faixa elevada, segue até a crítica, declive além do limite da máquina). Os demais cenários do simulador não têm geofencing (`getSompoGeofenceSite` devolve null; `snapshot.geofence` null); `snapshot.position`, `snapshot.geofence`, `risks.proximity`; HUD "Radar: faixa · perigo a N m à direita · T s" e, quando a inclinação entra em faixa, "Próximo do limite · inclinação 22° · limite 25°"; zonas no chão do palco e no plantio (mesma grade; vermelho dentro/crítica, laranja borda/elevada, amarelo atenção) |

## Dataset de referência

`public/datasets/piracicaba-artemis/` (gerado por `scripts/generate-piracicaba-dataset.mjs`, travado por `server/piracicaba-dataset.test.js`): rio Piracicaba real (OSM 2708872, ODbL), limites, declive, percursos, relevo e imagem aérea fictícios e marcados como sintéticos. Ver `docs/laboratorio-fazendas.md`, seção "Faixas por perigo", para carregar outra fazenda.

## Próximos passos registrados

1. feito: amostra crua do simulador inclui posição/faixa e `convertSompoDataset` exporta posição disponível como GNSS sintético com origem local; falta: preservar esses campos na normalização e em `snapshotToRow`/`mapSampleRow` de `server/sompo-telemetry-history.js`, que hoje os descartam, e associar polígonos/regras do cenário ao caso para calcular episódios de faixa.
2. `manifest.machine.profile` (largura, velocidade, tempo de reação) alimentando faixas operacionais por máquina; o limite de inclinação já alimenta o laboratório e o radar do simulador.
3. GPS no ESP32: campos `latitude`, `longitude`, `gnss_fix` no nó do Firebase; o servidor roda o mesmo `evaluateGeofence` sobre o snapshot físico.
4. Fontes externas para fazendas reais: OSM (água), SICAR (imóvel), modelo digital de elevação (declividade).
