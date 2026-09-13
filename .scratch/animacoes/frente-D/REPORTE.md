# FRENTE D — rampas e manobras (Devin Manobras, porta 5206)

Branch `codex/cine/manobras`, commit `9f94107`. Toquei só os meus blocos em
`shared/sompo-telemetry-simulator.js` e `shared/sompo-scenario-effects.js`.
Palco/render intacto. Testes: 134/134 verdes (`server/sompo-*.test.js`).

## O que estava errado e o que mudou

### steep-climb
- Antes: nascia já a 21°/6 km/h, sem aproximação; velocidade *subia* no
  meio da rampa (6→7→10). Zero leitura de esforço.
- Depois `vence-a-rampa`: aproximação em plano a 28 km/h → entra na rampa
  (pitch 3→15→21) → sangra 14→7→4,5 km/h no "motor no limite" → crista
  (pitch 9) → platô a 10→14. Exhaust 0.75 reforçado.
- `perda-de-tracao`: patina no cascalho (wheel 12 vs speed 3) → estanca →
  segura no freio (brake-lights 6200-7800) → engata ré parado → recuo
  controlado com pitch caindo 21→15→5 até a base.

### steep-descent
- Antes: `desce-controlado` *perdia* velocidade descendo 22° (65→55) —
  gravidade ao contrário.
- Depois: profile subiu pra 88 km/h. Entra no declive e a gravidade estica
  88→93→98→100 km/h com freio motor segurando; base afrouxa o pitch e sai
  a 85. `freio-aquece`: creep até 106 com brake-glow 0.85 + smoke, redução
  de marcha segura a 68, parada técnica puxando pro acostamento
  (lateral 2.0, yaw -4→0).

### tight-reverse
- Antes: engata ré já a 3 km/h no t=0, sem spool-up nem pausas.
- Depois `concluida`: parado → engata ré (0,9s) → traseira entra em S
  (yaw -10→-18, lateral →0,95) → pausa no freio → endireita → pulso final
  de creep. Distância frontal cresce na ré (sensor honesto).
- `toque-na-doca`: ré rápida demais (3,5) sem corrigir ângulo → toque com
  mergulho de pitch -1,5 e jolt de roll → parado. Distância frontal agora
  *cresce* durante a ré (antes encolhia, contraditório com sensor frontal).
- `reinicia-manobra`: ângulo insuficiente → para → avanço de correção à
  frente (direction vira só com speed 0 nas duas pontas) → nova ré alinhada.
- Efeitos: reverse-lights só durante marcha de ré; brake-lights nas pausas
  e na parada final.

### yard-maneuver
- Antes: aproximação em linha reta constante, sem alinhamento.
- Depois `encosta-na-doca`: diagonal de aproximação (yaw -5, lateral 0,5) →
  endireita junto à doca → pausa "confere o espelho" (speed 0, brake-light)
  → ajuste fino a 1 km/h → encosta a 12 cm. `toque-no-portao`: abordagem a
  3,5 km/h estreita demais → toque com pitch -1,8 + roll 1,5 → engata ré
  parado → recuo pra avaliar.
- Default (livre manual): removido reverse-lights — manual só anda pra
  frente, luz de ré acesa era leitura errada.

### bogged-down
- Antes: atolado era um slow-down suave — sem vai-e-vem, parecia só parar.
- Depois `atolado`: patina (wheel 17 vs speed 1,2) → balanço de ré →
  segura → surto pra frente patinando → enterra sem sair → última ré →
  imobilizado com sink 0,55 e roll 10. `desatola`: mesmo balanço, mas o
  surto pra frente pega tração e sai do berço a 5,5→7 km/h. `afunda-mais`:
  insiste cavando → ré enterra a traseira → afundamento lateral
  (sink 0,62, roll 13-14, inclinationRisk) → resgate.
- Regra do simulador respeitada: `direction` só vira em segmento com
  velocidade 0 nas duas pontas (o frame usa direction do keyframe anterior
  durante o blend; a integral fechada lê o sinal do seguinte — flip com
  speed>0 quebrava o teste de deslocamento em ~0,35 m).

### inclination
- `quase-tomba`: roda sobe no barranco (roll 23, lateral 0,9) → peso
  pendurado (28) → limite a 32° parado com sink 0,06 → assenta pra 29 →
  correção pro declive (yaw -8) descendo do barranco → parado a 11°.
- `estabiliza`: busca linha baixa com drift lateral e pitch variando no
  ponto mais fundo → retorna ao plano → estabiliza a 10 km/h.

## Shots
`.scratch/animacoes/frente-D/`: `base-*` (antes) e `depois-*` (depois).
Porta 5206 ainda no ar se quiser olhar ao vivo.

## Sinais pro coordenador (palco)
- yard-maneuver/tight-reverse: a "doca" não tem geometria — o caminhão para
  ao lado do galpão cenográfico. Se quiser vender a doca de verdade, seria
  prop do palco (createSompoRuralStage/roadScene), não do roteiro.
- Nada mais bloqueado do meu lado.

---

# FASE 2 — auditoria telemetria↔animação (commit e0f5172)

Método: dump de `getSompoRuralFrame` + `createSompoSimulationSnapshot` em
keyframe e meio de segmento para os 6 cenários × todos os desfechos +
shots na 5206. Painel lê o mesmo frame da animação; divergências possíveis
eram sinais, flags e magnitudes derivadas.

## Divergências corrigidas

1. **Sinal de aceleração em ré — `getSompoRuralFrame` (compartilhado)**:
   `accelerationX` e `lateralAcceleration` usavam `speedKph` sem sinal.
   Em qualquer segmento com `direction:-1` o painel lia aceleração
   longitudinal invertida (ré acelerando → +x; freando na ré → −x).
   Multipliquei por `direction` do segmento. Afeta meus 4 scripts com ré
   e os agri das frentes E/F (barn-maneuver, field-bogging) — todos
   melhoram; testes não travavam o sinal. 134/134 verde.
2. **tight-reverse/concluida**: correção de esterco −18°→+4° em 800 ms
   dava `yawRate` pico de 41 °/s (giro de drift num caminhão a 2 km/h).
   Espalhei em ~3 s com degrau intermediário; pico agora ~9,5 °/s.
3. **tight-reverse/reinicia-manobra**: correção −20°→−4° em 1,2 s
   (pico 20 °/s) esticada; e `collisionRisk` nunca desarmava — painel
   ficava "Colisão ativa" depois de "Manobra concluída". Desarmo no
   keyframe final.
4. **tight-reverse/toque-na-doca**: `pitch: -1.5` no impacto — contato
   de ré transfere peso pra traseira, nariz sobe. Virei pra +1,5.
   (Em `yard-maneuver/toque-no-portao` o pitch -1,8 está certo: impacto
   frontal mergulha o nariz.)
5. **steep-descent/freio-aquece**: recuperação 106→68→30→0 em ~5 s dava
   picos de -8,3 m/s² (~0,85g) rotulados "freio motor". Retimei pra
   21 s: freio motor morde a -2,1; serviço voltando a -3,9/-4,8; parada
   final -5,6 — freada firme crível pós-fade. Efeitos retimados.

## Status por cenário × desfecho

- **steep-climb/vence-a-rampa**: OK. Painel: pitch 3→21→2, v 28→4,5→14,
  flag inclinação só na rampa. Acel x negativo subindo (sangria) e leve
  positivo na crista. Valor: *"a telemetria mostra o motor no limite a
  4,5 km/h em 21° — evidência objetiva de operação sob esforço extremo
  antes de sinistro de powertrain em serra."*
- **steep-climb/perda-de-tracao**: OK (pós-fix do sinal). w=12 vs v=3 na
  patinação, estanca a 21°, segura no freio, ré controlada. Valor:
  *"roda girando a 4x a velocidade do chassi na rampa separa perda de
  tração de falta de potência — causa raiz do sinistro fica no registro."*
- **steep-descent/desce-controlado**: OK. Gravidade estica 88→100 km/h,
  freio motor segura, IMU lê gravidade projetada (+3,7 m/s² x em -22°)
  corretamente. Valor: *"descida controlada a ~100 km/h documenta
  condução correta com freio motor — contrafactual forte contra
  alegação de imperícia em serra."*
- **steep-descent/freio-aquece**: divergência corrigida (decel -8,3 →
  -2,1 a -5,6). Valor: *"velocidade crescendo com freio aplicado é a
  assinatura telemétrica do fade — o painel prova falha do sistema de
  freio antes da parada técnica, não depois do acidente."*
- **tight-reverse/concluida**: divergência corrigida (yaw 41→9,5 °/s).
  Sensor frontal cresce 140→250 cm durante a ré — honesto. Valor:
  *"cada correção de esterco e pausa da ré fica reconstruível frame a
  frame — manobra cuidadosa em acesso estreito vira prova de prudência."*
- **tight-reverse/toque-na-doca**: divergência corrigida (pitch). Flag
  persiste ao fim por escolha (incidente registrado). Valor: *"ré rápida
  demais sem correção + flag de colisão + microvariação de pitch no
  contato: o sinistro de doca se conta sozinho na linha do tempo."*
- **tight-reverse/reinicia-manobra**: divergência corrigida (flag +
  timing). Valor: *"o ciclo ré→avanço→ré registra o motorista
  corrigindo o ângulo em vez de insistir — mitigação de risco
  documentada em tempo real."*
- **yard-maneuver/encosta-na-doca**: OK. Distância 130→12 cm monotônica,
  flag de proximidade a partir de 70 cm, pausa de conferência a 55 cm.
  Valor: *"sensor a 12 cm com velocidade de 1 km/h e pausa de inspeção
  diferencia encostar na doca de bater — corta disputa sobre dano de
  manobra."*
- **yard-maneuver/toque-no-portao**: OK. Aproximação a 3,5 km/h em
  espaço estreito, mergulho de pitch no contato, recuo de ré com
  distância frontal crescendo. Valor: *"contato a 3,5 km/h com flag
  ativa e recuo pra avaliar: baixa energia, conduta correta pós-evento —
  separa avaria leve de negligência."*
- **bogged-down/atolado**: OK. w=17 vs v=0 (patinação real no painel de
  rodas/IMU), sink progressivo 0→0,55, balanço ré/frente com marcha
  trocada parado. Valor: *"roda a 17 km/h e chassi parado com
  afundamento progressivo prova atolamento — distingue de parada
  voluntária ou pane em registro de sinistro."*
- **bogged-down/desatola**: OK. Mesmo balanço, mas o surto pra frente
  pega tração (w 14→9≈v) e sai do berço. Valor: *"a técnica de balanço
  que recupera tração aparece na série — evidência de que o operador
  aplicou o procedimento correto antes de desistir."*
- **bogged-down/afunda-mais**: OK. Insistir cavando → ré enterra a
  traseira → afundamento lateral (sink 0,64, roll 14, flag inclinação).
  Valor: *"cada tentativa adicional aumenta sink e roll na telemetria —
  prova de agravamento do dano por insistência, relevante pra
  cobertura."*
- **inclination/estabiliza**: OK. Roll 17→10→5→2 com drift lateral e
  flag encerrada no plano. Valor: *"operador buscando a linha baixa e o
  alerta encerrando é mitigação registrada — bônus de conduta
  defensável."*
- **inclination/quase-tomba**: OK. Roll 32° parado, IMU lê ~5 m/s²
  lateral (gravidade rotacionada) — prova de quase-tombamento sem
  capotar. Valor: *"roll sustentado acima de 30° com o veículo parado
  documenta o quase-sinistro — subsídio pra precificar risco de rota
  sem precisar do acidente."*

## Observação residual (não bug)

- `bogged-down/atolado` e `perda-de-tracao` terminam com `direction:-1`
  parado — painel mostra "0 km/h · ré": o seletor ficou em R, leitura
  honesta.
- Flags de colisão persistem onde o sensor segue saturado (doca a 12 cm,
  portão a 60 cm) — coerente com ultrassom real.
- Declive de 22° a ~100 km/h é cenário estilizado de laboratório (40% de
  rampa não existe em rodovia), mas a resposta dinâmica está física.

## Testes
`node --test "server/sompo-*.test.js"` → 134/134 verde após os fixes.
Shots novos: `/tmp/manobras/v2/` (desc-engine, desc-shoulder,
rev-straighten, rev-impact).
