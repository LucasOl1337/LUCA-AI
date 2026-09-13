# GOAL — Revisão completa das animações SOMPO

## Resultado observável
Todos os 26 cenários do simulador SOMPO revisados e melhorados até lerem como física real: velocidades, acelerações, guinadas, roll/pitch, timing de efeitos e comportamento das máquinas. Cada cenário tem prova visual (shots antes/depois em keyframes).

## Baseline
Deploy cd41daf ao vivo. Movimento base já corrigido (velocidades reais, suspensão por roda, slip-angle no desvio, frenagem física). Falta: revisão cenário a cenário.

## Verificador primário
Por cenário: shots em keyframes (evento + desfecho) comparados com física esperada + visual-target.png para qualidade. Suite `npm test` 683/0 e typecheck após merge de cada frente.

## Frentes (1 agente SWE-2 cada, worktree própria)

| Frente | Agente | Porta | Cenários |
|--------|--------|-------|----------|
| A desvios-frenagens | Devin Desvios | 5203 | animal-crossing, obstacle, driver-drowsiness, hard-braking |
| B clima-pista | Devin Clima | 5204 | aquaplaning, hot-weather, rough-road, shifted-load, fast-corner |
| C falhas | Devin Falhas | 5205 | tire-blowout, brake-failure, engine-fire, rollover |
| D rampas-manobras | Devin Manobras | 5206 | steep-climb, steep-descent, tight-reverse, yard-maneuver, bogged-down, inclination |
| E agri-campo | Devin AgriCampo | 5207 | agri-harvest-dust, agri-field-bogging, agri-night-operation |
| F agri-maquina | Devin AgriMaquina | 5208 | agri-barn-maneuver, agri-hydraulic-failure, agri-tractor-rollover |
| normal | coordenador | 5197 | normal (baseline já revisado) |

## Regras de ownership
- Cada frente edita SOMENTE os blocos dos seus cenários em shared/sompo-telemetry-simulator.js, shared/sompo-scenario-effects.js e testes correspondentes.
- Arquivos de palco/render (createSompo*.ts) são do coordenador: frente sinaliza a necessidade, coordenador aplica.
- Commits na própria branch codex/cine/<frente>. Coordenador mergeia serial, roda suite, corrige conflitos.

## Loop por agente
1. Rodar cenário, capturar keyframes (SHOT_SCENARIO + SHOT_OUTCOME + SHOT_AT).
2. Auditar realismo: velocidade, aceleração, heading vs deslize, roll/pitch, timing de efeitos, rodas, câmera.
3. Corrigir no roteiro do cenário; re-shot; iterar.
4. Reportar: o que achou, o que mudou, shots antes/depois, testes.

## Anti-cheat
- Não afrouxar asserts pra passar teste; atualizar pro regime novo com justificativa.
- Não declarar cenário revisado sem shot de prova.
- Sem mudança em arquivos fora da frente sem avisar.

## Gates
- Deploy final: após merge de todas as frentes + suite verde + QA visual. Commit/push/deploy = fluxo padrão do repo.
