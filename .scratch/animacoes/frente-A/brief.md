# Frente A — desvios e frenagens (devin #2)

Fase 2 (auditoria telemetria↔animação) concluída. Commit `f4731d1` na `codex/cine/desvios`. Testes 40/40 verdes. Método: script `.scratch/look/audit-telemetria.mjs` amostra `getSompoRuralFrame` a cada 50ms e cruza com a cinemática do palco (viagem em forma fechada, âncora do animal, range do sensor). Painel lê do mesmo scriptFrame que anima — a auditoria real é número roteirizado vs física.

## Por cenário

**animal-crossing** (3 desfechos)
- freada-a-tempo: era pico -10.2 m/s² → aplainado pra -6.9. Parada 7.9s com a vaca a 2.4m do nariz recém-saída do asfalto (sensor 46cm↔gap real 2.4m com a lateral). Painel 0 km/h + caminhão parado + vaca no nariz: bate. **Frase: reconstituição de quase-sinistro — a telemetria prova que o motorista freou a tempo.**
- desvio: freada-jab de 100ms (-11.1) suavizada → pico -5.3; slip ≤5.8°, passagem rente com 2.5m de vão real. **Frase: o mesmo evento sem sinistro — desvio bem executado vira evidência de direção defensiva.**
- colisao: impacto retimado 5.9s→6.5s a 26 km/h (era 14 com pico -10 irreal); freada distribuída, vaca cai no para-choque, sensor 8cm↔gap real 1.26m. **Frase: reconstituição de colisão com animal — velocidade de impacto e ponto de contato auditáveis.**

**obstacle**
- parada-segura: creep 8→0 em 6s, para a ~1.9m do prop; desaceleração -0.7 m/s² coerente com manobra de pátio. **Frase: prova de parada assistida por sensor de proximidade em manobra.**
- toque-leve: toque a ~1.2m com pitch -2 e roughness 2.2 no contato. **Frase: dano leve em manobra documentado — o sensor registra o toque que o segurado pode negar.**
- livre: manual, sem roteiro.

**driver-drowsiness** (3 desfechos)
- recupera: serpenteio com slip contido (≤4.5°), retorna à faixa a 55 km/h. **Frase: detecção precoce de fadiga — o serpenteio na telemetria antecede o sinistro.**
- saida-de-pista: era pico -7.8 na grama → retimado pra -6.2 (arrasto do terreno enquanto dorme + freada ao despertar); brake-lights agora acendem no despertar (9.5s). **Frase: o pior caso da fadiga — saída de pista documentada fase a fase.**
- parada-descanso: encosta a 15 km/h e para no acostamento; slip -5.8 na manobra de estacionar, dentro do regime. **Frase: o desfecho bom — a telemetria mostra a decisão segura.**

**hard-braking**
- obstaculo-na-pista: 80→0 em ~5s, pico -6.2 m/s², ~55m de frenagem, pitch -5. **Frase: distância real de frenagem de emergência — referência pra avaliar qualquer narrativa de "freou e não deu".**
- derrapagem: fishtail intencional (yaw 11.6° contra o deslize = física de skid), para atravessado no piso solto. **Frase: frenagem que virou perda de controle — a telemetria distingue freada reta de derrapagem.**
- sem-impacto: manual, sem roteiro.

## Achados e fixes commitados
- Pico de desaceleração irreal nos 3 desfechos do animal → aplainado (detalhe: keyframe intermediário sem speedKph herdava o valor e partia a rampa de frenagem — armadilha do formato).
- Retime de efeitos colado nos novos instantes (impact-dust/debris/hazard da colisao em 6.5s; brake-lights da saída no despertar 9.5s).
- 2 asserts de teste atualizados pro novo instante de impacto (6.0s→6.6s), justificativa no commit.

## Divergência conhecida (não bug de telemetria)
- derrapagem slip 11.6° é o fishtail intencional.
- Seek direto no preview deixa a pose lateral sem convergir (probe artifact, não é o app).

## Shots novos da fase 2
`f2-freada-7900.png` (parada + painel 0 km/h + vaca na borda), `f2-colisao-6500.png` (impacto, painel 26 km/h / 5,53 cm), `f2-desvio-4400.png`, `f2-saida-9600.png`.
